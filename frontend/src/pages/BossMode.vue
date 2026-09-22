<template>
	<div class="flex h-screen flex-col bg-neutral-50">
		<div class="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
			<div class="flex items-center gap-1 overflow-x-auto">
				<button
					v-for="tab in tabs"
					:key="tab.key"
					class="touch-target rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium whitespace-nowrap"
					:class="activeTab === tab.key ? 'bg-brand text-white' : 'text-neutral-600 hover:bg-neutral-100'"
					@click="activeTab = tab.key"
				>
					{{ tab.label }}
				</button>
			</div>
			<a href="/pos" class="text-sm font-medium text-brand whitespace-nowrap">Cashier Mode →</a>
		</div>

		<div class="flex-1 overflow-y-auto">
			<DashboardTab v-if="activeTab === 'dashboard'" />
			<ExpensesTab v-else-if="activeTab === 'expenses'" />
			<IncomeTab v-else-if="activeTab === 'income'" />
			<InvoicesTab v-else-if="activeTab === 'invoices'" />
			<ReportsTab v-else-if="activeTab === 'reports'" />
		</div>
	</div>
</template>

<script setup>
import { ref } from "vue";
import DashboardTab from "./boss/DashboardTab.vue";
import ExpensesTab from "./boss/ExpensesTab.vue";
import IncomeTab from "./boss/IncomeTab.vue";
import InvoicesTab from "./boss/InvoicesTab.vue";
import ReportsTab from "./boss/ReportsTab.vue";

const tabs = [
	{ key: "dashboard", label: "Dashboard" },
	{ key: "expenses", label: "Expenses" },
	{ key: "income", label: "Income" },
	{ key: "invoices", label: "Invoices" },
	{ key: "reports", label: "Reports" },
];
const activeTab = ref("dashboard");
</script>
