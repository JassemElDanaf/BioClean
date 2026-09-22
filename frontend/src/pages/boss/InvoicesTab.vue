<template>
	<div class="space-y-4 p-4">
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold text-neutral-700">B2B / van invoices</div>
			<a href="/desk/sales-invoice/new" target="_blank" class="touch-target rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-white">
				New Invoice
			</a>
		</div>

		<div class="rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-card)]">
			<div v-if="invoices.loading" class="p-4 text-center text-sm text-neutral-400">Loading...</div>
			<div v-for="inv in invoices.data || []" :key="inv.name" class="flex items-center justify-between border-b border-neutral-100 p-3 text-sm last:border-0">
				<div>
					<div class="font-medium">{{ inv.name }} - {{ inv.customer }}</div>
					<div class="text-xs text-neutral-400">{{ inv.posting_date }} · ${{ inv.grand_total.toFixed(2) }} · outstanding ${{ inv.outstanding_amount.toFixed(2) }}</div>
				</div>
				<div class="flex gap-2">
					<a
						:href="`/api/method/frappe.utils.print_format.download_pdf?doctype=Sales Invoice&name=${encodeURIComponent(inv.name)}&format=A4 Invoice`"
						target="_blank"
						class="touch-target rounded-[var(--radius-md)] border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700"
					>
						Download PDF
					</a>
					<a
						:href="`/desk/sales-invoice/${encodeURIComponent(inv.name)}`"
						target="_blank"
						class="touch-target rounded-[var(--radius-md)] border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700"
					>
						Open / Email
					</a>
				</div>
			</div>
			<div v-if="!invoices.loading && !(invoices.data || []).length" class="p-4 text-center text-sm text-neutral-400">
				No B2B/van invoices yet.
			</div>
		</div>
	</div>
</template>

<script setup>
import { createListResource } from "frappe-ui";

const invoices = createListResource({
	doctype: "Sales Invoice",
	filters: { is_pos: 0, docstatus: 1 },
	fields: ["name", "customer", "posting_date", "grand_total", "outstanding_amount"],
	orderBy: "posting_date desc",
	pageLength: 30,
	auto: true,
});
</script>
