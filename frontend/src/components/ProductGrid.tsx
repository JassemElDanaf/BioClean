import { useMemo, useRef, useState } from "react";
import type { Item } from "../features/inventory/types";
import { useBarcodeScanner } from "../lib/useBarcodeScanner";
import { pickProductEmoji } from "../lib/productEmoji";
import { SearchIcon } from "./icons";
import StockBadge from "./StockBadge";
import type { DraftLine } from "./DocumentCartPanel";

// The product-browsing half of a "build a document" screen (Invoicing/
// Purchases/Quotation) - deliberately built to feel like POS's own
// product grid (search + category pills + a grid of tiles, all visible
// at once) rather than a search box that only reveals results once
// clicked into, since browsing/scanning straight through the catalog is
// the actual common case, not always knowing the exact name to type.
export default function ProductGrid({
	items,
	lines,
	respectStock,
	onAdd,
	priceFor,
}: {
	items: Item[];
	lines: DraftLine[];
	respectStock: boolean;
	onAdd: (item: Item) => void;
	priceFor: (item: Item) => number;
}) {
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("All");
	const [scanError, setScanError] = useState<string | null>(null);
	const scanErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function lineQtyFor(itemId: number): number {
		return lines.find((l) => l.item.id === itemId)?.qty ?? 0;
	}

	function handleScan(barcode: string) {
		const item = items.find((i) => i.barcode === barcode);
		if (scanErrorTimeoutRef.current) clearTimeout(scanErrorTimeoutRef.current);
		if (!item) {
			setScanError(`No item found for barcode "${barcode}"`);
		} else if (respectStock && (item.stock_qty <= 0 || lineQtyFor(item.id) >= item.stock_qty)) {
			setScanError(`"${item.item_name}" is out of stock`);
		} else {
			setScanError(null);
			onAdd(item);
			return;
		}
		scanErrorTimeoutRef.current = setTimeout(() => setScanError(null), 3000);
	}

	// Works no matter what's focused on this document (this search box, a
	// qty field in the cart panel, nothing) - see useBarcodeScanner's docstring.
	useBarcodeScanner(handleScan);

	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const item of items) if (item.category) set.add(item.category);
		return ["All", ...Array.from(set).sort()];
	}, [items]);

	const visibleItems = useMemo(() => {
		const q = search.trim().toLowerCase();
		return items.filter((item) => {
			if (category !== "All" && item.category !== category) return false;
			if (!q) return true;
			return item.item_name.toLowerCase().includes(q) || item.barcode.toLowerCase().includes(q);
		});
	}, [items, search, category]);

	return (
		<div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16, height: "100%", minHeight: 0, overflow: "hidden" }}>
			{scanError && (
				<div
					style={{
						position: "fixed",
						top: 20,
						left: "50%",
						transform: "translateX(-50%)",
						background: "#fde2e2",
						color: "#b42318",
						border: "1px solid #f5b5b0",
						borderRadius: 10,
						padding: "10px 18px",
						fontSize: 14,
						fontWeight: 600,
						boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
						zIndex: 2000,
					}}
				>
					{scanError}
				</div>
			)}
			<div style={{ position: "relative", marginBottom: 12 }}>
				<span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-500)" }}>
					<SearchIcon size={16} />
				</span>
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by product name or barcode..."
					style={searchInputStyle}
				/>
			</div>

			{/* Wraps to as many lines as the category list needs, rather than
			    scrolling sideways - a second horizontal scrollbar stacked
			    under the product grid's own is exactly the "competing scroll
			    areas" pattern this page should never have. */}
			{categories.length > 2 && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
					{categories.map((c) => (
						<button key={c} onClick={() => setCategory(c)} style={c === category ? pillActiveStyle : pillStyle}>
							{c}
						</button>
					))}
				</div>
			)}

			{/* Its own scroll region, deliberately separate from the page's -
			    paired with DocumentCartPanel's matching calc(100vh - 32px) cap
			    so both columns read as one fixed-height workspace: the catalog
			    scrolls on the left, the cart scrolls on the right, independently. */}
			<div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingTop: 4 }}>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
					{visibleItems.map((item) => {
						const inCartQty = lineQtyFor(item.id);
						const outOfStock = respectStock && item.stock_qty <= 0;
						const atCap = respectStock && inCartQty >= item.stock_qty && !outOfStock;
						return (
							<div key={item.id} style={cardStyle}>
								{item.image_url ? (
									<img src={item.image_url} alt={item.item_name} style={imageStyle} />
								) : (
									<div style={imagePlaceholderStyle}>{pickProductEmoji(item.item_name)}</div>
								)}
								<div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{item.item_name}</div>
								<div style={{ fontSize: 11, color: "var(--neutral-500)", marginBottom: 6 }}>
									{item.stock_qty} {item.uom}
								</div>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
									<span style={{ fontSize: 14, fontWeight: 800 }}>${priceFor(item).toFixed(2)}</span>
									{respectStock && <StockBadge stockQty={item.stock_qty} reorderLevel={item.reorder_level} />}
								</div>
								<button onClick={() => onAdd(item)} disabled={outOfStock || atCap} style={outOfStock || atCap ? addButtonDisabledStyle : addButtonStyle}>
									{inCartQty > 0 ? `+ Add (${inCartQty})` : "+ Add"}
								</button>
							</div>
						);
					})}
				</div>
				{visibleItems.length === 0 && <div style={{ color: "var(--neutral-500)", padding: 32, textAlign: "center" }}>No products match.</div>}
			</div>
		</div>
	);
}

const searchInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "11px 14px 11px 38px",
	borderRadius: 10,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	background: "#fff",
	boxSizing: "border-box",
};
const pillStyle: React.CSSProperties = {
	padding: "6px 14px",
	borderRadius: 999,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	color: "var(--neutral-900)",
	fontSize: 12,
	fontWeight: 600,
	cursor: "pointer",
	whiteSpace: "nowrap",
	flexShrink: 0,
};
const pillActiveStyle: React.CSSProperties = {
	...pillStyle,
	background: "var(--brand)",
	borderColor: "var(--brand)",
	color: "#fff",
};
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column" };
const imageStyle: React.CSSProperties = { width: "100%", height: 72, objectFit: "cover", borderRadius: 8, marginBottom: 8 };
const imagePlaceholderStyle: React.CSSProperties = {
	width: "100%",
	height: 72,
	borderRadius: 8,
	background: "var(--brand-pale)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	fontSize: 26,
	marginBottom: 8,
};
const addButtonStyle: React.CSSProperties = {
	padding: "7px 10px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 12,
	fontWeight: 700,
	cursor: "pointer",
};
const addButtonDisabledStyle: React.CSSProperties = {
	...addButtonStyle,
	background: "var(--neutral-200)",
	color: "var(--neutral-500)",
	cursor: "not-allowed",
};
