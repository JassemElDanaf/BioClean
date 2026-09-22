<template>
	<div class="space-y-4 p-4">
		<div class="grid grid-cols-3 gap-3">
			<KpiTile label="Income today" :value="`$${incomeTotal.toFixed(2)}`" value-class="text-brand" />
			<KpiTile label="Expenses today" :value="`$${expenseTotal.toFixed(2)}`" value-class="text-red-600" />
			<KpiTile label="Net today" :value="`$${(incomeTotal - expenseTotal).toFixed(2)}`" />
		</div>

		<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
			<div class="mb-2 text-sm font-semibold text-neutral-700">Today's income</div>
			<div v-for="(row, i) in income.data || []" :key="i" class="flex justify-between border-b border-neutral-100 py-1.5 text-sm last:border-0">
				<span>{{ row.source }} - {{ row.reference }} <span class="text-neutral-400">({{ row.mode_of_payment }})</span></span>
				<span class="font-medium text-brand">${{ row.amount.toFixed(2) }}</span>
			</div>
			<div v-if="!(income.data || []).length" class="text-sm text-neutral-400">No income recorded today.</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue";
import { createResource } from "frappe-ui";
import KpiTile from "../../components/KpiTile.vue";

const income = createResource({ url: "bioclean.boss.get_income_feed", auto: true });
const expenses = createResource({ url: "bioclean.boss.get_expense_feed", auto: true });

const incomeTotal = computed(() => (income.data || []).reduce((sum, r) => sum + r.amount, 0));
const expenseTotal = computed(() => (expenses.data || []).reduce((sum, r) => sum + r.amount, 0));
</script>
