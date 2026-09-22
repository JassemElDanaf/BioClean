<template>
	<div class="space-y-4 p-4">
		<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
			<div class="mb-3 text-sm font-semibold text-neutral-700">Log an expense</div>
			<div class="grid gap-2 md:grid-cols-4">
				<input v-model.number="form.amount" type="number" step="0.01" placeholder="Amount (USD)" class="rounded border border-neutral-200 px-3 py-2 text-sm" />
				<select v-model="form.expense_account" class="rounded border border-neutral-200 px-3 py-2 text-sm">
					<option value="" disabled>Expense account</option>
					<option v-for="a in accounts.data || []" :key="a.name" :value="a.name">{{ a.name }}</option>
				</select>
				<select v-model="form.cost_center" class="rounded border border-neutral-200 px-3 py-2 text-sm">
					<option value="" disabled>Cost center</option>
					<option v-for="c in costCenters.data || []" :key="c.name" :value="c.name">{{ c.name }}</option>
				</select>
				<input v-model="form.description" placeholder="Description" class="rounded border border-neutral-200 px-3 py-2 text-sm" />
			</div>
			<button
				class="touch-target mt-3 rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
				:disabled="!canSubmit || logExpense.loading"
				@click="submit"
			>
				{{ logExpense.loading ? "Logging..." : "Log expense" }}
			</button>
		</div>

		<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
			<div class="mb-2 flex items-center justify-between">
				<div class="text-sm font-semibold text-neutral-700">Today's expenses</div>
				<div class="text-sm font-bold text-red-600">${{ total.toFixed(2) }}</div>
			</div>
			<div v-for="row in feed.data || []" :key="row.journal_entry" class="flex justify-between border-b border-neutral-100 py-1.5 text-sm last:border-0">
				<span>{{ row.account }} <span class="text-neutral-400">({{ row.cost_center }})</span></span>
				<span class="font-medium">${{ row.amount.toFixed(2) }}</span>
			</div>
			<div v-if="!(feed.data || []).length" class="text-sm text-neutral-400">No expenses logged today.</div>
		</div>
	</div>
</template>

<script setup>
import { reactive, computed } from "vue";
import { createResource } from "frappe-ui";

const form = reactive({ amount: null, expense_account: "", cost_center: "", description: "" });

const accounts = createResource({ url: "bioclean.boss.get_expense_accounts", auto: true });
const costCenters = createResource({ url: "bioclean.boss.get_cost_centers", auto: true });
const feed = createResource({ url: "bioclean.boss.get_expense_feed", auto: true });

const total = computed(() => (feed.data || []).reduce((sum, r) => sum + r.amount, 0));
const canSubmit = computed(() => form.amount > 0 && form.expense_account && form.cost_center);

const logExpense = createResource({ url: "bioclean.boss.log_expense" });

async function submit() {
	await logExpense.submit({ ...form });
	form.amount = null;
	form.description = "";
	feed.reload();
}
</script>
