import { useMemo, useState } from "react";
import type { Item } from "../features/inventory/types";
import { MinusIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons";

export interface DraftLine {
	item: Item;
	qty: number;
	unitPrice: number;
}

// Shared by Invoicing and Quotation - same "search catalog, build a line
// list" mechanic, differing only in `respectStock`: an invoice deducts
// stock immediately on creation (same as a POS sale) so it can't be
// oversold, but a quotation makes no commitment at all - quoting 500
// units of something with 50 in stock is a completely normal ask ("can
// you get me this many"), so its picker must not cap by stock_qty.
export default function DocumentLineBuilder({
	items,
	lines,
	respectStock,
	onAdd,
	onChangeQty,
	onRemove,
	priceFor,
}: {
	items: Item[];
	lines: DraftLine[];
	respectStock: boolean;
	onAdd: (item: Item) => void;
	onChangeQty: (itemId: number, delta: number) => void;
	onRemove: (itemId: number) => void;
	priceFor: (item: Item) => number;
}) {
	const [search, setSearch] = useState("");

	const results = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return [];
		return items.filter((i) => i.item_name.toLowerCase().includes(q) || i.barcode.toLowerCase().includes(q)).slice(0, 8);
	}, [items, search]);

	function lineQtyFor(itemId: number): number {
		return lines.find((l) => l.item.id === itemId)?.qty ?? 0;
	}

	return (
		<div>
			<div style={{ position: "relative", marginBottom: 10 }}>
				<span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-500)" }}>
					<SearchIcon size={15} />
				</span>
				<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items to add..." style={searchInputStyle} />
			</div>

			{results.length > 0 && (
				<div style={{ border: "1px solid var(--neutral-200)", borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
					{results.map((item) => {
						const atCap = respectStock && lineQtyFor(item.id) >= item.stock_qty;
						const outOfStock = respectStock && item.stock_qty <= 0;
						return (
							<div key={item.id} style={resultRowStyle}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 13, fontWeight: 600 }}>{item.item_name}</div>
									<div style={{ fontSize: 12, color: "var(--neutral-500)" }}>
										${priceFor(item).toFixed(2)} · {item.stock_qty} in stock
									</div>
								</div>
								<button onClick={() => onAdd(item)} disabled={outOfStock || atCap} style={outOfStock || atCap ? addButtonDisabledStyle : addButtonStyle}>
									+ Add
								</button>
							</div>
						);
					})}
				</div>
			)}

			<div style={{ display: "grid", gap: 8 }}>
				{lines.map((line) => (
					<div key={line.item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--neutral-100)" }}>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.item.item_name}</div>
							<div style={{ fontSize: 12, color: "var(--neutral-500)" }}>${line.unitPrice.toFixed(2)} each</div>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<button onClick={() => onChangeQty(line.item.id, -1)} style={qtyButtonStyle}>
								<MinusIcon size={13} />
							</button>
							<span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{line.qty}</span>
							<button onClick={() => onChangeQty(line.item.id, 1)} disabled={respectStock && line.qty >= line.item.stock_qty} style={qtyButtonStyle}>
								<PlusIcon size={13} />
							</button>
						</div>
						<div style={{ fontSize: 13, fontWeight: 700, width: 60, textAlign: "right" }}>${(line.qty * line.unitPrice).toFixed(2)}</div>
						<button onClick={() => onRemove(line.item.id)} style={{ ...qtyButtonStyle, color: "crimson", border: "none" }}>
							<TrashIcon size={14} />
						</button>
					</div>
				))}
				{lines.length === 0 && <div style={{ color: "var(--neutral-500)", fontSize: 13, padding: "12px 0" }}>No items added yet.</div>}
			</div>
		</div>
	);
}

const searchInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "10px 12px 10px 36px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};
const resultRowStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	padding: "8px 12px",
	borderBottom: "1px solid var(--neutral-100)",
};
const addButtonStyle: React.CSSProperties = {
	padding: "6px 12px",
	borderRadius: 6,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 12,
	fontWeight: 700,
	cursor: "pointer",
	whiteSpace: "nowrap",
};
const addButtonDisabledStyle: React.CSSProperties = {
	...addButtonStyle,
	background: "var(--neutral-200)",
	color: "var(--neutral-500)",
	cursor: "not-allowed",
};
const qtyButtonStyle: React.CSSProperties = {
	width: 22,
	height: 22,
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
	padding: 0,
};
