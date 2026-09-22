<template>
	<div class="flex h-screen flex-col bg-neutral-50">
		<!-- Deliberately no nav/sidebar here at all - Cashier Mode is a
		     single-purpose full-screen register, per the design language spec. -->
		<CategoryTabs :groups="itemGroups.data || []" v-model="selectedGroup" />

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

		<div class="flex-1 overflow-y-auto p-4">
			<div v-if="items.loading" class="mt-10 text-center text-neutral-400">Loading...</div>
			<div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
				<ProductTile
					v-for="item in items.data || []"
					:key="item.item_code"
					:item="item"
					@add="addToCart(item)"
				/>
			</div>
		</div>

		<!-- Persistent cart indicator - always visible even with the drawer
		     closed, so the running total is never more than a glance away. -->
		<button
			v-if="cartCount > 0"
			class="touch-target fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-white shadow-[var(--shadow-elevated)]"
			@click="cartOpen = true"
		>
			<span class="font-semibold">{{ cartCount }} item{{ cartCount > 1 ? "s" : "" }}</span>
			<span class="font-bold">${{ cartTotal.toFixed(2) }}</span>
		</button>

		<CartDrawer
			:open="cartOpen"
			:lines="cart"
			@close="cartOpen = false"
			@increment="(code) => changeQty(code, 1)"
			@decrement="(code) => changeQty(code, -1)"
			@remove="removeLine"
			@checkout="openCheckout"
			@hold="holdSale"
		/>

		<CheckoutModal
			:open="checkoutOpen"
			:total="cartTotal"
			:rate="exchangeRate"
			:lines="cart"
			@close="checkoutOpen = false"
			@success="onCheckoutSuccess"
		/>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { createListResource, createResource } from "frappe-ui";
import CategoryTabs from "../components/CategoryTabs.vue";
import ProductTile from "../components/ProductTile.vue";
import CartDrawer from "../components/CartDrawer.vue";
import CheckoutModal from "../components/CheckoutModal.vue";

const selectedGroup = ref(null);
const cart = ref([]);
const cartOpen = ref(false);
const checkoutOpen = ref(false);
const barcodeBuffer = ref("");
const barcodeInput = ref(null);
const exchangeRate = ref(89500);

const itemGroups = createListResource({
	doctype: "Item Group",
	filters: { is_group: 0 },
	fields: ["name"],
	pageLength: 20,
	auto: true,
	onSuccess(data) {
		if (data.length && !selectedGroup.value) selectedGroup.value = data[0].name;
	},
});

const items = createResource({
	url: "bioclean.api.get_pos_items",
	params: { item_group: selectedGroup.value },
	auto: false,
});

watch(selectedGroup, (group) => {
	if (group) items.fetch({ item_group: group });
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

function holdSale() {
	// Confirmed feature: park the cart, free the register immediately.
	// Held-sales list UI is a fast-follow - for now this just clears the
	// active cart without losing the register to a single stuck sale.
	const held = JSON.parse(sessionStorage.getItem("bioclean_held_sales") || "[]");
	held.push({ lines: cart.value, heldAt: new Date().toISOString() });
	sessionStorage.setItem("bioclean_held_sales", JSON.stringify(held));
	cart.value = [];
	cartOpen.value = false;
}

function openCheckout() {
	cartOpen.value = false;
	checkoutOpen.value = true;
}

function onCheckoutSuccess(invoice) {
	checkoutOpen.value = false;
	cart.value = [];
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

const cartCount = computed(() => cart.value.reduce((sum, l) => sum + l.qty, 0));
const cartTotal = computed(() => cart.value.reduce((sum, l) => sum + l.rate * l.qty, 0));

onMounted(() => nextTick(() => barcodeInput.value?.focus()));
</script>
