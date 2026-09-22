<template>
	<div class="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-neutral-200">
		<button
			v-for="group in groups"
			:key="group.name"
			class="touch-target shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors"
			:class="
				modelValue === group.name
					? 'bg-brand text-white'
					: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
			"
			@click="$emit('update:modelValue', group.name)"
		>
			{{ group.name }}
		</button>
	</div>
</template>

<script setup>
defineProps({
	groups: { type: Array, required: true },
	modelValue: { type: String, default: null },
});
defineEmits(["update:modelValue"]);
</script>
