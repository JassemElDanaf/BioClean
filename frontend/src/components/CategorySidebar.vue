<template>
	<div class="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white sm:w-52">
		<button
			class="touch-target px-4 py-3 text-left text-sm font-semibold"
			:class="modelValue === null ? 'bg-brand text-white' : 'text-neutral-700 hover:bg-neutral-100'"
			@click="$emit('update:modelValue', null)"
		>
			All Items
		</button>
		<button
			v-for="group in groups"
			:key="group.name"
			class="touch-target px-4 py-3 text-left text-sm font-medium"
			:class="modelValue === group.name ? 'bg-brand text-white' : 'text-neutral-600 hover:bg-neutral-100'"
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
