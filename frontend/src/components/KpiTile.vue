<template>
	<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
		<div class="text-xs font-medium uppercase tracking-wide text-neutral-400">{{ label }}</div>
		<div class="mt-1 text-2xl font-bold" :class="valueClass">{{ value }}</div>
	</div>
</template>

<script setup>
defineProps({
	label: { type: String, required: true },
	value: { type: String, required: true },
	valueClass: { type: String, default: "text-neutral-900" },
});
</script>
