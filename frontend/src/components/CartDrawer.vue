<template>
	<Transition name="slide">
		<div v-if="open" class="fixed inset-0 z-40 flex justify-end">
			<div class="absolute inset-0 bg-black/30" @click="$emit('close')" />
			<div class="relative flex h-full w-full max-w-sm flex-col bg-white shadow-[var(--shadow-elevated)]">
				<div class="flex items-center justify-between border-b border-neutral-200 p-4">
					<h2 class="text-lg font-semibold">Cart</h2>
					<button class="touch-target text-neutral-400" @click="$emit('close')">✕</button>
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
		</div>
	</Transition>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
	open: { type: Boolean, default: false },
	lines: { type: Array, required: true },
});
defineEmits(["close", "increment", "decrement", "remove", "checkout", "hold"]);

const total = computed(() => props.lines.reduce((sum, l) => sum + l.rate * l.qty, 0));
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
	transition: opacity 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
	opacity: 0;
}
</style>
