<template>
	<div v-if="audit.loading" class="p-6 text-center text-neutral-400">Loading...</div>
	<div v-else-if="audit.data" class="space-y-4 p-4">
		<AuditSection title="Cancelled invoices" :rows="audit.data.cancelled_invoices">
			<template #row="{ row }">
				<span>{{ row.name }} - {{ row.customer }}</span>
				<span class="text-red-600">${{ row.grand_total.toFixed(2) }} · {{ row.modified_by }}</span>
			</template>
		</AuditSection>

		<AuditSection title="Returns / refunds" :rows="audit.data.returns">
			<template #row="{ row }">
				<span>{{ row.name }} - {{ row.customer }}</span>
				<span>${{ row.grand_total.toFixed(2) }} · {{ row.owner }}</span>
			</template>
		</AuditSection>

		<AuditSection title="Stock adjustments" :rows="audit.data.stock_adjustments">
			<template #row="{ row }">
				<span>{{ row.name }} - {{ row.posting_date }}</span>
				<span>${{ row.difference_amount.toFixed(2) }} · {{ row.owner }}</span>
			</template>
		</AuditSection>

		<AuditSection title="Cash variances (POS closing)" :rows="audit.data.cash_variances">
			<template #row="{ row }">
				<span>{{ row.name }} - {{ row.mode_of_payment }}</span>
				<span :class="row.difference < 0 ? 'text-red-600' : 'text-brand'">${{ row.difference.toFixed(2) }} · {{ row.user }}</span>
			</template>
		</AuditSection>

		<AuditSection title="Exchange rate changes" :rows="audit.data.rate_changes">
			<template #row="{ row }">
				<span>{{ row.old_rate }} → {{ row.new_rate }}</span>
				<span>{{ row.changed_by }}</span>
			</template>
		</AuditSection>

		<AuditSection title="Cancelled van settlements" :rows="audit.data.cancelled_van_settlements">
			<template #row="{ row }">
				<span>{{ row.name }} - {{ row.driver }}</span>
				<span>${{ row.total_net_sold_amount.toFixed(2) }} · {{ row.modified_by }}</span>
			</template>
		</AuditSection>
	</div>
</template>

<script setup>
import { createResource } from "frappe-ui";
import { h } from "vue";

const audit = createResource({ url: "bioclean.boss.get_audit_trail", auto: true });

// Small inline section component - just this file's own list-with-empty-state
// pattern, repeated six times above; not reusable enough elsewhere yet to
// warrant its own file.
const AuditSection = {
	props: { title: String, rows: { type: Array, default: () => [] } },
	setup(props, { slots }) {
		return () =>
			h("div", { class: "rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-card)]" }, [
				h("div", { class: "mb-2 text-sm font-semibold text-neutral-700" }, `${props.title} (${props.rows.length})`),
				...props.rows.map((row, i) =>
					h(
						"div",
						{ key: i, class: "flex justify-between border-b border-neutral-100 py-1.5 text-sm last:border-0" },
						slots.row({ row })
					)
				),
				props.rows.length === 0 ? h("div", { class: "text-sm text-neutral-400" }, "None in the last 30 days.") : null,
			]);
	},
};
</script>
