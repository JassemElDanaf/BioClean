<template>
	<div class="flex h-screen flex-col bg-neutral-50">
		<!-- Top bar: search + held sales, replacing the old horizontal category
		     tabs now that categories live in the left sidebar. -->
		<div class="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
			<input
				v-model="search"
				type="search"
				placeholder="Search products..."
				class="touch-target flex-1 rounded-[var(--radius-md)] border border-neutral-200 px-3"
			/>
			<button
				v-if="heldSales.length"
				class="touch-target shrink-0 rounded-[var(--radius-md)] border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700"
				@click="showHeld = true"
			>
				Held ({{ heldSales.length }})
			</button>
		</div>

		<!-- Hidden barcode-scanner input: always focused, invisible, catches
		     keyboard-wedge scanner input (types fast + Enter) without a
		     visible on-screen field cluttering the grid. Tablet-camera
		     scanning is a later fallback per the plan - scanner gun is primary. -->
		<input
			ref="barcodeInput"
			v-model="barcodeBuffer"
			class="absolute -left-full opacity-0"
			@keyup.enter="handleBarcodeScan"
		/>

		<div class="flex flex-1 overflow-hidden">
			<CategorySidebar :groups="itemGroups.data || []" v-model="selectedGroup" />

			<div class="flex-1 overflow-y-auto p-4">
				<div v-if="items.loading" class="mt-10 text-center text-neutral-400">Loading...</div>
				<div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					<ProductTile
						v-for="item in items.data || []"
						:key="item.item_code"
						:item="item"
						@add="addToCart(item)"
					/>
				</div>
				<div v-if="!items.loading && !(items.data || []).length" class="mt-10 text-center text-neutral-400">
					No items found.
				</div>
			</div>

			<CartPanel
				:lines="cart"
				v-model:customerPhone="customerPhone"
				@increment="(code) => changeQty(code, 1)"
				@decrement="(code) => changeQty(code, -1)"
				@remove="removeLine"
				@checkout="checkoutOpen = true"
				@hold="holdSale"
			/>
		</div>

		<CheckoutModal
			:open="checkoutOpen"
			:total="cartTotal"
			:rate="exchangeRate"
			:lines="cart"
			:customer-phone="customerPhone"
			@close="checkoutOpen = false"
			@success="onCheckoutSuccess"
		/>

		<!-- Held sales list - a park/resume queue rather than the single-slot
		     "hold clears the cart into thin air" behavior from before. -->
		<div v-if="showHeld" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
			<div class="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-elevated)]">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Held sales</h2>
					<button class="touch-target text-neutral-400" @click="showHeld = false">✕</button>
				</div>
				<div v-for="(sale, i) in heldSales" :key="i" class="mb-2 flex items-center justify-between rounded-[var(--radius-md)] bg-neutral-50 p-3">
					<div class="text-sm">
						<div class="font-medium">{{ sale.lines.length }} item{{ sale.lines.length > 1 ? "s" : "" }}</div>
						<div class="text-xs text-neutral-400">{{ new Date(sale.heldAt).toLocaleTimeString() }}</div>
					</div>
					<button class="touch-target rounded-[var(--radius-md)] bg-brand px-3 py-1.5 text-sm font-semibold text-white" @click="resumeSale(i)">
						Resume
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { createListResource, createResource } from "frappe-ui";
import CategorySidebar from "../components/CategorySidebar.vue";
import ProductTile from "../components/ProductTile.vue";
import CartPanel from "../components/CartPanel.vue";
import CheckoutModal from "../components/CheckoutModal.vue";

const selectedGroup = ref(null);
const search = ref("");
const cart = ref([]);
const customerPhone = ref("");
const checkoutOpen = ref(false);
const barcodeBuffer = ref("");
const barcodeInput = ref(null);
const exchangeRate = ref(89500);
const showHeld = ref(false);
const heldSales = ref(JSON.parse(sessionStorage.getItem("bioclean_held_sales") || "[]"));

const itemGroups = createListResource({
	doctype: "Item Group",
	filters: { is_group: 0 },
	fields: ["name"],
	pageLength: 20,
	auto: true,
});

const items = createResource({
	url: "bioclean.api.get_pos_items",
	params: { item_group: selectedGroup.value },
	auto: true,
});

let searchDebounce;
watch([selectedGroup, search], () => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(() => {
		items.fetch({ item_group: selectedGroup.value, search: search.value || undefined });
	}, 200);
});

const rateResource = createResource({ url: "bioclean.api.get_exchange_rate", auto: true });
watch(
	() => rateResource.data,
	(val) => {
		if (val) exchangeRate.value = val;
	}
);

const lookupBarcode = createResource({ url: "bioclean.api.lookup_by_barcode" });

async function handleBarcodeScan() {
	const code = barcodeBuffer.value.trim();
	barcodeBuffer.value = "";
	if (!code) return;
	const item = await lookupBarcode.submit({ barcode: code });
	if (item) {
		addToCart(item);
	} else {
		// Uncatalogued item: quick manual-price line item escape valve
		// (confirmed decision) - never blocks a sale on missing catalog data.
		const price = prompt(`Item not found for barcode "${code}". Enter a price to ring up manually, or Cancel.`);
		if (price !== null && !isNaN(parseFloat(price))) {
			addToCart({ item_code: code, item_name: `Manual item (${code})`, rate: parseFloat(price) });
		}
	}
}

function addToCart(item) {
	const existing = cart.value.find((l) => l.item_code === item.item_code);
	if (existing) {
		existing.qty += 1;
	} else {
		cart.value.push({ item_code: item.item_code, item_name: item.item_name, rate: item.rate || 0, qty: 1 });
	}
}

function changeQty(itemCode, delta) {
	const line = cart.value.find((l) => l.item_code === itemCode);
	if (!line) return;
	line.qty += delta;
	if (line.qty <= 0) removeLine(itemCode);
}

function removeLine(itemCode) {
	cart.value = cart.value.filter((l) => l.item_code !== itemCode);
}

function persistHeldSales() {
	sessionStorage.setItem("bioclean_held_sales", JSON.stringify(heldSales.value));
}

function holdSale() {
	heldSales.value.push({ lines: cart.value, heldAt: new Date().toISOString() });
	persistHeldSales();
	cart.value = [];
}

function resumeSale(index) {
	cart.value = heldSales.value[index].lines;
	heldSales.value.splice(index, 1);
	persistHeldSales();
	showHeld.value = false;
}

function onCheckoutSuccess(invoice) {
	checkoutOpen.value = false;
	cart.value = [];
	customerPhone.value = "";
	// Decoupled from checkout success, per the plan: the sale is already
	// final regardless of what happens here. Opens the already-built Receipt
	// Print Format for the cashier to print/reprint via the browser's own
	// print dialog - real ESC/POS direct-to-printer wiring follows once
	// hardware is chosen (Pre-Implementation Verification Checklist).
	window.open(
		`/api/method/frappe.utils.print_format.download_pdf?doctype=Sales Invoice&name=${invoice.name}&format=Receipt`,
		"_blank"
	);
}

const cartTotal = computed(() => cart.value.reduce((sum, l) => sum + l.rate * l.qty, 0));

onMounted(() => nextTick(() => barcodeInput.value?.focus()));
</script>
