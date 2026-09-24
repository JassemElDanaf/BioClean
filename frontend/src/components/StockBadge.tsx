// Shared between the Inventory table and the POS product grid - same
// three-state stock language (In Stock / Low Stock / Out of Stock) should
// mean the same thing and look the same everywhere it appears.
export default function StockBadge({ stockQty, reorderLevel }: { stockQty: number; reorderLevel: number }) {
	const outOfStock = stockQty <= 0;
	const lowStock = !outOfStock && stockQty <= reorderLevel;
	const { label, bg, fg } = outOfStock
		? { label: "Out of Stock", bg: "var(--neutral-100)", fg: "var(--neutral-500)" }
		: lowStock
			? { label: "Low Stock", bg: "#fff3e0", fg: "#b45f06" }
			: { label: "In Stock", bg: "var(--brand-pale)", fg: "var(--brand)" };

	return (
		<span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>{label}</span>
	);
}
