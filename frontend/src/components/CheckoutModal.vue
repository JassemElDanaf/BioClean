<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-md rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-elevated)]">
			<h2 class="mb-1 text-lg font-semibold">Checkout</h2>
			<p class="mb-4 text-sm text-neutral-500">Total due: <span class="font-semibold text-neutral-900">${{ total.toFixed(2) }}</span></p>

			<label class="mb-1 block text-xs font-medium text-neutral-500">Customer phone (optional)</label>
			<input
				v-model="phone"
				type="tel"
				placeholder="Skip for anonymous sale"
				class="touch-target mb-4 w-full rounded-[var(--radius-md)] border border-neutral-200 px-3"
			/>

			<div class="mb-4 grid grid-cols-2 gap-3">
				<div>
					<label class="mb-1 block text-xs font-medium text-neutral-500">Tendered USD</label>
					<input
						v-model.number="usdTendered"
						type="number"
						min="0"
						step="0.01"
						class="touch-target w-full rounded-[var(--radius-md)] border border-neutral-200 px-3"
					/>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-neutral-500">Tendered LBP</label>
					<input
						v-model.number="lbpTendered"
						type="number"
						min="0"
						step="1000"
						class="touch-target w-full rounded-[var(--radius-md)] border border-neutral-200 px-3"
					/>
				</div>
			</div>

			<div class="mb-4 flex justify-between rounded-[var(--radius-md)] bg-neutral-50 p-3 text-sm">
				<span>Combined tender (USD equiv.)</span>
				<span class="font-semibold" :class="remaining > 0.001 ? 'text-red-500' : 'text-brand'">
					${{ combinedUsd.toFixed(2) }}
				</span>
			</div>
			<div v-if="remaining <= 0.001" class="mb-4 text-sm text-neutral-500">
				Change due: <span class="font-semibold text-neutral-900">${{ Math.abs(remaining).toFixed(2) }}</span>
			</div>

			<div class="flex gap-2">
				<button class="touch-target flex-1 rounded-[var(--radius-md)] border border-neutral-200 py-2" @click="$emit('close')">
					Cancel
				</button>
				<button
					class="touch-target flex-1 rounded-[var(--radius-md)] bg-brand py-2 font-semibold text-white disabled:opacity-40"
					:disabled="remaining > 0.001 || submitting"
					@click="submit"
				>
					{{ submitting ? "Processing..." : "Confirm" }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { createResource } from "frappe-ui";

const props = defineProps({
	open: { type: Boolean, default: false },
	total: { type: Number, required: true },
	rate: { type: Number, required: true },
	lines: { type: Array, required: true },
});
const emit = defineEmits(["close", "success"]);

const phone = ref("");
const usdTendered = ref(0);
const lbpTendered = ref(0);
const submitting = ref(false);

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) {
			phone.value = "";
			usdTendered.value = Number(props.total.toFixed(2));
			lbpTendered.value = 0;
		}
	}
);

const combinedUsd = computed(() => (usdTendered.value || 0) + (lbpTendered.value || 0) / props.rate);
const remaining = computed(() => props.total - combinedUsd.value);

const checkoutResource = createResource({ url: "bioclean.api.checkout" });
const lookupCustomer = createResource({ url: "bioclean.api.find_or_create_customer" });

async function submit() {
	submitting.value = true;
	try {
		let customer = null;
		if (phone.value.trim()) {
			const result = await lookupCustomer.submit({ phone: phone.value.trim() });
			customer = result.name;
		}

		const payments = [];
		if (usdTendered.value > 0) {
			payments.push({ mode_of_payment: "Cash", currency: "USD", amount: usdTendered.value });
		}
		if (lbpTendered.value > 0) {
			payments.push({ mode_of_payment: "Cash", currency: "LBP", amount: lbpTendered.value });
		}

		const invoice = await checkoutResource.submit({
			idempotency_key: crypto.randomUUID(),
			items: props.lines.map((l) => ({ item_code: l.item_code, qty: l.qty, rate: l.rate })),
			payments,
			customer,
		});
		emit("success", invoice);
	} finally {
		submitting.value = false;
	}
}
</script>
