<template>
	<div class="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-white sm:w-96">
		<div class="border-b border-neutral-200 p-4">
			<label class="mb-1 block text-xs font-medium text-neutral-500">Customer phone (optional)</label>
			<input
				:value="customerPhone"
				type="tel"
				placeholder="Skip for a walk-in sale"
				class="touch-target w-full rounded-[var(--radius-md)] border border-neutral-200 px-3"
				@input="$emit('update:customerPhone', $event.target.value)"
			/>
		</div>

		<div class="flex-1 overflow-y-auto p-4">
			<div v-if="lines.length === 0" class="mt-10 text-center text-neutral-400">Cart is empty</div>
			<div
				v-for="line in lines"
				:key="line.item_code"
				class="mb-3 flex items-center justify-between rounded-[var(--radius-md)] bg-neutral-50 p-3"
			>
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium">{{ line.item_name }}</div>
					<div class="text-xs text-neutral-500">
						<span v-if="line.rate === 0" class="font-semibold text-brand">FREE</span>
						<span v-else>${{ line.rate.toFixed(2) }} each</span>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<button class="touch-target text-neutral-400" @click="$emit('decrement', line.item_code)">−</button>
					<span class="w-6 text-center text-sm">{{ line.qty }}</span>
					<button class="touch-target text-neutral-400" @click="$emit('increment', line.item_code)">+</button>
					<button class="touch-target pl-2 text-red-400" @click="$emit('remove', line.item_code)">🗑</button>
				</div>
			</div>
		</div>

		<div class="border-t border-neutral-200 p-4">
			<div class="mb-3 flex items-center justify-between text-lg font-semibold">
				<span>Total</span>
				<span>${{ total.toFixed(2) }}</span>
			</div>
			<button
				class="touch-target w-full rounded-[var(--radius-md)] bg-brand py-3 font-semibold text-white disabled:opacity-40"
				:disabled="lines.length === 0"
				@click="$emit('checkout')"
			>
				Charge ${{ total.toFixed(2) }}
			</button>
			<button
				class="touch-target mt-2 w-full rounded-[var(--radius-md)] py-2 text-sm text-neutral-500"
				:disabled="lines.length === 0"
				@click="$emit('hold')"
			>
				Hold sale
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
	lines: { type: Array, required: true },
	customerPhone: { type: String, default: "" },
});
defineEmits(["increment", "decrement", "remove", "checkout", "hold", "update:customerPhone"]);

const total = computed(() => props.lines.reduce((sum, l) => sum + l.rate * l.qty, 0));
</script>
