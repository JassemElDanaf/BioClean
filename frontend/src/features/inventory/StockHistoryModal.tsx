import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { getStockMovements } from "./api";
import type { Item, StockMovement } from "./types";

const REASON_LABELS: Record<string, string> = {
	initial_stock: "Initial stock (creation)",
	purchase_receipt: "Received shipment",
	correction: "Manual count correction",
	damage: "Damaged / expired",
	pos_sale: "POS sale",
	invoice: "Invoice",
	other: "Other",
	manual: "Manual adjustment",
};

export default function StockHistoryModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
	const [movements, setMovements] = useState<StockMovement[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!item) return;
		setLoading(true);
		getStockMovements(item.id)
			.then(setMovements)
			.finally(() => setLoading(false));
	}, [item]);

	if (!item) return null;

	return (
		<Modal open={!!item} onClose={onClose} title={`Stock History - ${item.item_name}`}>
			{loading ? (
				<div>Loading...</div>
			) : movements.length === 0 ? (
				<div style={{ color: "var(--neutral-500)", fontSize: 14 }}>No stock movements recorded yet.</div>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "1px solid var(--neutral-200)" }}>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Reason</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Change</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Balance After</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Unit Cost</th>
						</tr>
					</thead>
					<tbody>
						{movements.map((m) => (
							<tr key={m.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>{new Date(m.created_at).toLocaleString()}</td>
								<td style={tdStyle}>{REASON_LABELS[m.reason] ?? m.reason}</td>
								<td style={{ ...tdStyle, textAlign: "right", color: m.delta < 0 ? "crimson" : "var(--brand)", fontWeight: 600 }}>
									{m.delta > 0 ? "+" : ""}
									{m.delta}
								</td>
								<td style={{ ...tdStyle, textAlign: "right" }}>{m.qty_after}</td>
								<td style={{ ...tdStyle, textAlign: "right" }}>{m.unit_cost != null ? `$${m.unit_cost.toFixed(2)}` : "-"}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</Modal>
	);
}

const thStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 13 };
