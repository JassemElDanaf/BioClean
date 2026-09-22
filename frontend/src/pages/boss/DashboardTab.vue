<template>
	<div v-if="summary.loading" class="p-6 text-center text-neutral-400">Loading...</div>
	<div v-else-if="summary.data" class="space-y-6 p-4">
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<KpiTile label="Sales (7d)" :value="`$${summary.data.total_sales.toFixed(2)}`" value-class="text-brand" />
			<KpiTile label="Expenses (7d)" :value="`$${summary.data.total_expenses.toFixed(2)}`" value-class="text-red-600" />
			<KpiTile
				label="Net (7d)"
				:value="`$${(summary.data.total_sales - summary.data.total_expenses).toFixed(2)}`"
			/>
			<KpiTile label="Transactions" :value="String(summary.data.transaction_count)" />
		</div>

		<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
			<div class="mb-3 text-sm font-semibold text-neutral-700">Sales by day</div>
			<div class="flex items-end gap-2" style="height: 100px;">
				<div v-for="day in summary.data.sales_by_day" :key="day.posting_date" class="flex flex-1 flex-col items-center gap-1">
					<div
						class="w-full rounded-t bg-brand"
						:style="{ height: `${maxDay ? (day.total / maxDay) * 80 : 0}px` }"
					></div>
					<div class="text-[10px] text-neutral-400">{{ day.posting_date.slice(5) }}</div>
				</div>
			</div>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
				<div class="mb-2 text-sm font-semibold text-neutral-700">Top items</div>
				<div v-for="item in summary.data.top_items" :key="item.item_code" class="flex justify-between py-1 text-sm">
					<span>{{ item.item_name }}</span>
					<span class="font-medium">${{ item.amount.toFixed(2) }}</span>
				</div>
				<div v-if="!summary.data.top_items.length" class="text-sm text-neutral-400">No sales yet.</div>
			</div>

			<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
				<div class="mb-2 text-sm font-semibold text-neutral-700">Low stock alerts</div>
				<div v-for="row in summary.data.low_stock_items" :key="row.item_code + row.warehouse" class="flex justify-between py-1 text-sm">
					<span>{{ row.item_code }} ({{ row.warehouse }})</span>
					<span class="font-medium text-red-600">{{ row.actual_qty }} / {{ row.warehouse_reorder_level }}</span>
				</div>
				<div v-if="!summary.data.low_stock_items.length" class="text-sm text-neutral-400">Nothing below reorder level.</div>
			</div>
		</div>

		<div class="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]">
			<div class="mb-2 text-sm font-semibold text-neutral-700">Recent van settlements</div>
			<div v-for="row in summary.data.van_settlements" :key="row.name" class="flex justify-between py-1 text-sm">
				<span>{{ row.name }} - {{ row.driver }}</span>
				<span>${{ row.total_net_sold_amount.toFixed(2) }} (outstanding ${{ row.outstanding_amount.toFixed(2) }})</span>
			</div>
			<div v-if="!summary.data.van_settlements.length" class="text-sm text-neutral-400">No van settlements in range.</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue";
import { createResource } from "frappe-ui";
import KpiTile from "../../components/KpiTile.vue";

const summary = createResource({ url: "bioclean.boss.get_dashboard_summary", auto: true });
const maxDay = computed(() => Math.max(0, ...(summary.data?.sales_by_day || []).map((d) => d.total)));
</script>
