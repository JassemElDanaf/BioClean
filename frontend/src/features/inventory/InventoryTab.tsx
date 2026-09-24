import { useEffect, useMemo, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import { SearchIcon } from "../../components/icons";
import StockBadge from "../../components/StockBadge";
import { ApiError } from "../../lib/api";
import { useExchangeRate, usdToLbp } from "../../lib/currency";
import { createItem, deleteItem, exportItemsCsvUrl, listItems, listSuppliers, updateItem } from "./api";
import ItemFormModal from "./ItemFormModal";
import StockAdjustModal from "./StockAdjustModal";
import StockHistoryModal from "./StockHistoryModal";
import SuppliersModal from "./SuppliersModal";
import type { Item, ItemFormValues, Supplier } from "./types";

type SortKey = "item_name" | "barcode" | "category" | "stock_qty" | "retail_price";
type Currency = "USD" | "LBP";

export default function InventoryTab() {
	const [items, setItems] = useState<Item[]>([]);
	const [totalMatching, setTotalMatching] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Item | null>(null);
	const [adjusting, setAdjusting] = useState<Item | null>(null);
	const [viewingHistory, setViewingHistory] = useState<Item | null>(null);
	const [suppliers, setSuppliers] = useState<Supplier[]>([]);
	const [suppliersOpen, setSuppliersOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [lowStockOnly, setLowStockOnly] = useState(false);
	const [sortKey, setSortKey] = useState<SortKey>("item_name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [currency, setCurrency] = useState<Currency>("USD");
	const exchangeRate = useExchangeRate();

	function formatPrice(amountUsd: number): string {
		if (currency === "LBP" && exchangeRate) return `${usdToLbp(amountUsd, exchangeRate.rate, exchangeRate.rounding).toLocaleString()} LBP`;
		return `$${amountUsd.toFixed(2)}`;
	}

	async function reload() {
		setLoading(true);
		try {
			const { items, total } = await listItems({ lowStockOnly });
			setItems(items);
			setTotalMatching(total);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load inventory");
		} finally {
			setLoading(false);
		}
	}

	function reloadSuppliers() {
		listSuppliers()
			.then(setSuppliers)
			.catch(() => setSuppliers([]));
	}

	useEffect(() => {
		reload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lowStockOnly]);

	useEffect(() => {
		reloadSuppliers();
	}, []);

	async function handleSubmit(values: ItemFormValues): Promise<Item> {
		const item = editing ? await updateItem(editing.id, values) : await createItem(values);
		await reload();
		return item;
	}

	async function handleDelete(item: Item) {
		if (!confirm(`Delete "${item.item_name}"? This can't be undone.`)) return;
		try {
			await deleteItem(item.id);
			await reload();
		} catch (err) {
			// Most likely a 409 from the backend refusing to delete an item
			// with real stock history - surfaced here rather than silently
			// failing, since this used to be an unhandled promise rejection.
			alert(err instanceof ApiError ? err.message : "Couldn't delete this item.");
		}
	}

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	}

	const visibleItems = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = q
			? items.filter((item) => [item.barcode, item.item_name, item.category].some((v) => v?.toLowerCase().includes(q)))
			: items;

		const sorted = [...filtered].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
			return sortDir === "asc" ? cmp : -cmp;
		});
		return sorted;
	}, [items, search, sortKey, sortDir]);

	// Truncated (rather than just filtered by search/lowStockOnly) only when
	// the backend reports more matches than this page actually fetched -
	// the one case where what's on screen genuinely isn't everything.
	const truncated = totalMatching > items.length;

	if (loading) return <div>Loading inventory...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load inventory: {error}</div>;

	return (
		<div>
			{truncated && (
				<div style={{ background: "#fff8e1", color: "#8a6100", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
					Showing the first {items.length.toLocaleString()} of {totalMatching.toLocaleString()} matching items - narrow your search to see the rest.
				</div>
			)}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<h2 style={{ margin: 0 }}>
					Inventory ({visibleItems.length}
					{visibleItems.length !== items.length ? ` of ${items.length}` : ""} items)
				</h2>
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<div style={{ position: "relative" }}>
						<span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-500)", pointerEvents: "none" }}>
							<SearchIcon size={15} />
						</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search name, barcode, category..."
							style={searchInputStyle}
						/>
					</div>
					<button onClick={() => setLowStockOnly((v) => !v)} style={lowStockOnly ? activePillStyle : secondaryButtonStyle}>
						Low Stock Only
					</button>
					<button onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))} style={secondaryButtonStyle}>
						Show in: {currency}
					</button>
					<button onClick={() => setSuppliersOpen(true)} style={secondaryButtonStyle}>
						Suppliers
					</button>
					<a href={exportItemsCsvUrl} style={secondaryButtonStyle}>
						Export CSV
					</a>
					<button
						onClick={() => {
							setEditing(null);
							setFormOpen(true);
						}}
						style={primaryButtonStyle}
					>
						+ Add Item
					</button>
				</div>
			</div>

			{/* Columns don't fit every screen width - scroll the table itself
			    rather than letting it push the whole page wider than the viewport. */}
			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse", background: "#fff" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}></th>
							<SortableTh label="Item Name" sortKey="item_name" active={sortKey} dir={sortDir} onClick={toggleSort} />
							<SortableTh label="Barcode" sortKey="barcode" active={sortKey} dir={sortDir} onClick={toggleSort} />
							<SortableTh label="Category" sortKey="category" active={sortKey} dir={sortDir} onClick={toggleSort} />
							<th style={thStyle}>UOM</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Cost</th>
							<SortableTh label="Retail" sortKey="retail_price" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
							<th style={{ ...thStyle, textAlign: "right" }}>Wholesale</th>
							<SortableTh label="Stock Qty" sortKey="stock_qty" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{visibleItems.map((item) => {
							return (
								<tr key={item.id} style={{ borderBottom: "1px solid var(--neutral-200)" }}>
									<td style={tdStyle}>
										{item.image_url ? (
											<img src={item.image_url} alt={item.item_name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6 }} />
										) : (
											<div style={imagePlaceholderStyle}>📦</div>
										)}
									</td>
									<td style={tdStyle}>{item.item_name}</td>
									<td style={tdStyle}>{item.barcode}</td>
									<td style={tdStyle}>{item.category}</td>
									<td style={tdStyle}>{item.uom}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(item.cost_price)}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(item.retail_price)}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(item.wholesale_price)}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
											<span style={{ fontWeight: 700 }}>{item.stock_qty}</span>
											<StockBadge stockQty={item.stock_qty} reorderLevel={item.reorder_level} />
										</div>
									</td>
									<td style={tdStyle}>
										<ActionsMenu
											actions={[
												{
													label: "Edit",
													onClick: () => {
														setEditing(item);
														setFormOpen(true);
													},
												},
												{ label: "Adjust Stock", onClick: () => setAdjusting(item) },
												{ label: "History", onClick: () => setViewingHistory(item) },
												{ label: "Delete", onClick: () => handleDelete(item), danger: true },
											]}
										/>
									</td>
								</tr>
							);
						})}
						{visibleItems.length === 0 && (
							<tr>
								<td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									{search ? `No items match "${search}".` : lowStockOnly ? "No items are low on stock." : "No items yet."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<ItemFormModal
				key={`${editing?.id ?? "new"}-${formOpen}`}
				open={formOpen}
				onClose={() => setFormOpen(false)}
				onSubmit={handleSubmit}
				onImageChanged={reload}
				editing={editing}
			/>
			<StockAdjustModal item={adjusting} onClose={() => setAdjusting(null)} onAdjusted={reload} />
			<StockHistoryModal item={viewingHistory} onClose={() => setViewingHistory(null)} />
			<SuppliersModal open={suppliersOpen} onClose={() => setSuppliersOpen(false)} suppliers={suppliers} onChanged={reloadSuppliers} />
		</div>
	);
}

function SortableTh({
	label,
	sortKey,
	active,
	dir,
	onClick,
	align,
}: {
	label: string;
	sortKey: SortKey;
	active: SortKey;
	dir: "asc" | "desc";
	onClick: (key: SortKey) => void;
	align?: "right";
}) {
	const isActive = active === sortKey;
	return (
		<th
			style={{ ...thStyle, textAlign: align ?? "left", cursor: "pointer", userSelect: "none" }}
			onClick={() => onClick(sortKey)}
		>
			{label} {isActive ? (dir === "asc" ? "▲" : "▼") : ""}
		</th>
	);
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const imagePlaceholderStyle: React.CSSProperties = {
	width: 32,
	height: 32,
	borderRadius: 6,
	background: "var(--neutral-100)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	fontSize: 16,
};
const searchInputStyle: React.CSSProperties = {
	padding: "8px 12px 8px 32px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
	width: 240,
};
const secondaryButtonStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	textDecoration: "none",
	cursor: "pointer",
};
const activePillStyle: React.CSSProperties = {
	...secondaryButtonStyle,
	border: "1px solid var(--brand)",
	background: "var(--brand-pale)",
	color: "var(--brand)",
};
const primaryButtonStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 13,
	fontWeight: 700,
	cursor: "pointer",
};
