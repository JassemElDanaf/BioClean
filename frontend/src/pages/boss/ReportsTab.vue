<template>
	<div class="grid gap-3 p-4 md:grid-cols-2">
		<a
			v-for="report in reports"
			:key="report.name"
			:href="`/desk/query-report/${encodeURIComponent(report.name)}`"
			target="_blank"
			class="touch-target flex items-center justify-between rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)]"
		>
			<div>
				<div class="font-medium text-neutral-900">{{ report.name }}</div>
				<div class="text-xs text-neutral-400">{{ report.phase }}</div>
			</div>
			<span class="text-brand">Open →</span>
		</a>
		<a
			href="/desk/list/loyalty-point-entry"
			target="_blank"
			class="touch-target flex items-center justify-between rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)]"
		>
			<div>
				<div class="font-medium text-neutral-900">Loyalty Points Ledger</div>
				<div class="text-xs text-neutral-400">Native list export - Phase 6</div>
			</div>
			<span class="text-brand">Open →</span>
		</a>
	</div>
</template>

<script setup>
const reports = [
	{ name: "Sales Export", phase: "Phase 7" },
	{ name: "Expense by Cost Center", phase: "Phase 7" },
	{ name: "Payment Method Breakdown", phase: "Phase 7" },
	{ name: "Promotion Usage", phase: "Phase 4" },
	{ name: "Van Settlement History", phase: "Phase 5" },
	{ name: "Gift Card Ledger", phase: "Phase 6" },
];
</script>
