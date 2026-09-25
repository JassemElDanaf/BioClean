import { useEffect, useState, type ReactNode } from "react";
import type { Item } from "../features/inventory/types";
import { CartIcon, ChevronRightIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";

export interface DraftLine {
	item: Item;
	qty: number;
	unitPrice: number;
}

// The entire right-hand column of a "build a document" screen (Invoicing/
// Purchases/Quotation) - holding everything needed to finish the document:
// who it's for (compact, at the top - secondary fields collapsed behind
// "More details"), the running line list, and the total + Create button
// pinned at the bottom so they're never scrolled out of view.
//
// height: "100%" deliberately, not a calc(100vh - Npx) guess - this panel
// (and ProductGrid beside it) sit in a flex row that the page itself sizes
// to exactly fill the space below its own header (see QuotationTab/
// InvoicingTab/PurchasesTab's formOpen layout: the page root becomes a
// height-constrained flex column, header is its auto-height first child,
// this row is flex:1). A viewport-relative height here doesn't account
// for how tall that header actually is - it can only be got right by the
// header's own real layout, not a number guessed from outside it. A long
// line list still scrolls *inside* this panel rather than growing past
// its box. This is the one deliberate exception to "the page scrolls, not
// components": a cart genuinely needs to stay reachable while browsing
// products.
export default function DocumentCartPanel({
	header,
	secondaryLabel = "More details",
	secondary,
	lines,
	respectStock,
	onChangeQty,
	onRemove,
	error,
	actionLabel,
	actionDisabled,
	onAction,
}: {
	header: ReactNode;
	secondaryLabel?: string;
	secondary?: ReactNode;
	lines: DraftLine[];
	respectStock: boolean;
	onChangeQty: (itemId: number, delta: number) => void;
	onRemove: (itemId: number) => void;
	error?: string | null;
	actionLabel: string;
	actionDisabled?: boolean;
	onAction: () => void;
}) {
	const [secondaryOpen, setSecondaryOpen] = useState(false);
	const total = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

	return (
		<div className="doc-cart-panel" style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--neutral-200)", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
			<div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--neutral-200)" }}>
				<div style={{ display: "grid", gap: 10 }}>{header}</div>

				{secondary && (
					<div style={{ marginTop: 10 }}>
						<button type="button" onClick={() => setSecondaryOpen((v) => !v)} style={secondaryToggleStyle}>
							<span style={{ display: "inline-flex", transform: secondaryOpen ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
								<ChevronRightIcon size={12} />
							</span>
							{secondaryLabel}
						</button>
						{secondaryOpen && <div style={{ marginTop: 8, display: "grid", gap: 8 }}>{secondary}</div>}
					</div>
				)}
			</div>

			<div className="doc-cart-panel-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
				{lines.length === 0 ? (
					<div className="doc-cart-panel-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--neutral-500)", gap: 10 }}>
						<CartIcon size={32} color="var(--neutral-300)" />
						<span style={{ fontSize: 13 }}>No items added yet</span>
					</div>
				) : (
					<div style={{ padding: "4px 16px" }}>
						{lines.map((line) => (
							<div key={line.item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--neutral-100)" }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.item.item_name}</div>
									<div style={{ fontSize: 12, color: "var(--neutral-500)" }}>${line.unitPrice.toFixed(2)} each</div>
								</div>
								<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
									<button onClick={() => onChangeQty(line.item.id, -1)} style={qtyButtonStyle}>
										<MinusIcon size={13} />
									</button>
									<QtyInput qty={line.qty} onCommit={(typed) => onChangeQty(line.item.id, typed - line.qty)} />
									<button onClick={() => onChangeQty(line.item.id, 1)} disabled={respectStock && line.qty >= line.item.stock_qty} style={qtyButtonStyle}>
										<PlusIcon size={13} />
									</button>
								</div>
								<div style={{ fontSize: 13, fontWeight: 700, width: 58, textAlign: "right" }}>${(line.qty * line.unitPrice).toFixed(2)}</div>
								<button onClick={() => onRemove(line.item.id)} style={{ ...qtyButtonStyle, color: "crimson", border: "none" }}>
									<TrashIcon size={14} />
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			<div style={{ padding: "14px 18px 18px", borderTop: "1px solid var(--neutral-200)", display: "grid", gap: 10, flexShrink: 0 }}>
				<div style={{ display: "flex", justifyContent: "space-between" }}>
					<span style={{ fontWeight: 700 }}>Total</span>
					<span style={{ fontWeight: 800, fontSize: 18 }}>${total.toFixed(2)}</span>
				</div>
				{error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}
				<button onClick={onAction} disabled={actionDisabled} style={actionDisabled ? primaryButtonDisabledStyle : primaryButtonStyle}>
					{actionLabel}
				</button>
			</div>
		</div>
	);
}

const secondaryToggleStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 6,
	background: "none",
	border: "none",
	padding: 0,
	fontSize: 12,
	fontWeight: 700,
	color: "var(--neutral-500)",
	cursor: "pointer",
	fontFamily: "inherit",
};
// A quantity someone wants to type directly (a wholesale order for 100 of
// something) rather than clicking "+" a hundred times. Kept as its own
// local draft string - not bound straight to `qty` - so clearing the field
// to type a new number doesn't get instantly overwritten by the parent's
// still-old value re-rendering mid-keystroke. Committed (parsed, clamped
// to >=1) on blur or Enter; Escape reverts to the last real qty.
export function QtyInput({ qty, onCommit }: { qty: number; onCommit: (typed: number) => void }) {
	const [draft, setDraft] = useState(String(qty));

	useEffect(() => {
		setDraft(String(qty));
	}, [qty]);

	function commit() {
		const typed = Math.max(1, Math.floor(Number(draft)) || 1);
		if (typed !== qty) onCommit(typed);
		else setDraft(String(qty));
	}

	return (
		<input
			type="number"
			inputMode="numeric"
			min={1}
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onFocus={(e) => e.target.select()}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commit();
					(e.target as HTMLInputElement).blur();
				} else if (e.key === "Escape") {
					setDraft(String(qty));
					(e.target as HTMLInputElement).blur();
				}
			}}
			style={qtyInputStyle}
		/>
	);
}

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
const qtyInputStyle: React.CSSProperties = {
	width: 40,
	fontSize: 13,
	fontWeight: 700,
	textAlign: "center",
	padding: "3px 2px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	fontFamily: "inherit",
};
const primaryButtonStyle: React.CSSProperties = {
	padding: "12px 16px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 700,
	fontSize: 14,
	cursor: "pointer",
};
const primaryButtonDisabledStyle: React.CSSProperties = {
	...primaryButtonStyle,
	background: "var(--brand-pale)",
	color: "var(--brand)",
	cursor: "not-allowed",
};
