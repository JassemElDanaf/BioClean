<template>
	<button
		class="touch-target flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-white text-left shadow-[var(--shadow-card)] transition-transform active:scale-95"
		@click="$emit('add')"
	>
		<div class="flex aspect-square items-center justify-center bg-neutral-100">
			<img v-if="item.image" :src="item.image" :alt="item.item_name" class="h-full w-full object-cover" />
			<span v-else class="text-3xl text-neutral-300">🧴</span>
		</div>
		<div class="p-2">
			<div class="truncate text-sm font-medium text-neutral-900">{{ item.item_name }}</div>
			<div class="text-sm font-semibold text-brand">
				{{ item.rate != null ? `$${item.rate.toFixed(2)}` : "No price" }}
			</div>
		</div>
	</button>
</template>

<script setup>
defineProps({ item: { type: Object, required: true } });
defineEmits(["add"]);
</script>
