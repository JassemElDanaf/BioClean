import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ActionsMenu from "../../components/ActionsMenu";
import { SearchIcon } from "../../components/icons";
import ManageCategoriesModal from "../../components/ManageCategoriesModal";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { ApiError } from "../../lib/api";
import { useExchangeRate, usdToLbp } from "../../lib/currency";
import { createItem, deleteItem, exportItemsCsvUrl, listItems, listSuppliers, renameItemCategory, updateItem } from "./api";
import ItemFormModal from "./ItemFormModal";
import StockAdjustModal from "./StockAdjustModal";
import StockHistoryModal from "./StockHistoryModal";
import SuppliersModal from "./SuppliersModal";
import type { Item, ItemFormValues, Supplier } from "./types";

type SortKey = "item_name" | "barcode" | "category" | "stock_qty" | "retail_price";
type Currency = "USD" | "LBP";
type StockFilter = "all" | "low" | "out";

export default function InventoryTab() {
	const [searchParams, setSearchParams] = useSearchParams();
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
	const [managingCategories, setManagingCategories] = useState(false);
	const [search, setSearch] = useState("");
	// Deep-linkable (?stock=low|out) so a Dashboard alert card can jump
	// straight into the right filtered view instead of the default list.
	const [stockFilter, setStockFilter] = useState<StockFilter>(() => {
		const s = searchParams.get("stock");
		return s === "low" || s === "out" ? s : "all";
	});
	const [sortKey, setSortKey] = useState<SortKey>("item_name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [currency, setCurrency] = useState<Currency>("USD");
	const [category, setCategory] = useState("All");
	const exchangeRate = useExchangeRate();

	function formatPrice(amountUsd: number): string {
		if (currency === "LBP" && exchangeRate) return `${usdToLbp(amountUsd, exchangeRate.rate, exchangeRate.rounding).toLocaleString()} LBP`;
		return `$${amountUsd.toFixed(2)}`;
	}

	async function reload() {
		setLoading(true);
		try {
			const { items, total } = await listItems({ lowStockOnly: stockFilter === "low", outOfStockOnly: stockFilter === "out" });
			setItems(items);
			setTotalMatching(total);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load inventory");
		} finally {
			setLoading(false);
		}
	}

	function setStockFilterAndUrl(next: StockFilter) {
		setStockFilter(next);
		setSearchParams(
			(prev) => {
				const params = new URLSearchParams(prev);
				if (next === "all") params.delete("stock");
				else params.set("stock", next);
				return params;
			},
			{ replace: true }
		);
	}

	function reloadSuppliers() {
		listSuppliers()
			.then(setSuppliers)
			.catch(() => setSuppliers([]));
	}

	useEffect(() => {
		reload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stockFilter]);

	useEffect(() => {
		reloadSuppliers();
	}, []);

	async function handleSubmit(values: ItemFormValues): Promise<Item> {
		const item = editing ? await updateItem(editing.id, values) : await createItem(values);
		await reload();
		return item;
	}

	async function handleDelete(item: Item) {
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

	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const item of items) if (item.category) set.add(item.category);
		return ["All", ...Array.from(set).sort()];
	}, [items]);

	const visibleItems = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = items.filter((item) => {
			if (category !== "All" && item.category !== category) return false;
			if (!q) return true;
			return [item.barcode, item.item_name, item.category].some((v) => v?.toLowerCase().includes(q));
		});

		const sorted = [...filtered].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
			return sortDir === "asc" ? cmp : -cmp;
		});
		return sorted;
	}, [items, search, category, sortKey, sortDir]);

	// Truncated (rather than just filtered by search/stockFilter) only when
	// the backend reports more matches than this page actually fetched -
	// the one case where what's on screen genuinely isn't everything.
	const truncated = totalMatching > items.length;

	if (loading && items.length === 0) return <div>Loading inventory...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load inventory: {error}</div>;

	return (
		<div>
			{truncated && (
				<div style={{ background: "#fff8e1", color: "#8a6100", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
					Showing the first {items.length.toLocaleString()} of {totalMatching.toLocaleString()} matching items - narrow your search to see the rest.
				</div>
			)}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>
						Inventory ({visibleItems.length}
						{visibleItems.length !== items.length ? ` of ${items.length}` : ""} items)
					</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<div style={{ position: "relative", flex: "1 1 180px" }}>
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
					<button onClick={() => setStockFilterAndUrl(stockFilter === "low" ? "all" : "low")} style={stockFilter === "low" ? activePillStyle : secondaryButtonStyle}>
						Low Stock
					</button>
					<button onClick={() => setStockFilterAndUrl(stockFilter === "out" ? "all" : "out")} style={stockFilter === "out" ? activePillStyle : secondaryButtonStyle}>
						Out of Stock
					</button>
					<button onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))} style={secondaryButtonStyle}>
						Show in: {currency}
					</button>
					<button onClick={() => setSuppliersOpen(true)} style={secondaryButtonStyle}>
						Suppliers
					</button>
					<button onClick={() => setManagingCategories(true)} style={secondaryButtonStyle}>
						Categories
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

			{categories.length > 2 && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
					{categories.map((c) => (
						<button key={c} onClick={() => setCategory(c)} style={c === category ? categoryPillActiveStyle : categoryPillStyle}>
							{c}
						</button>
					))}
				</div>
			)}

			{/* Columns don't fit every screen width, so this scrolls horizontally
			    rather than pushing the whole page wider than the viewport - but
			    it does NOT cap its own height/scroll vertically, so a long list
			    just extends the page and lets <main> handle the one scrollbar.
			    The header stays pinned (sticky, relative to that page scroll)
			    so column labels are never scrolled out of view. */}
			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", background: "#fff" }}>
					<thead>
						<tr style={{ textAlign: "left" }}>
							<th style={{ ...stickyThStyle, width: 44 }}></th>
							<SortableTh label="Product" sortKey="item_name" active={sortKey} dir={sortDir} onClick={toggleSort} />
							<th style={stickyThStyle}>UOM</th>
							<th style={{ ...stickyThStyle, textAlign: "right" }}>Cost</th>
							<SortableTh label="Retail" sortKey="retail_price" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
							<th style={{ ...stickyThStyle, textAlign: "right" }}>Wholesale</th>
							<SortableTh label="Stock Qty" sortKey="stock_qty" active={sortKey} dir={sortDir} onClick={toggleSort} align="center" />
							<th style={{ ...stickyThStyle, width: 44 }}></th>
						</tr>
					</thead>
					<tbody>
						{visibleItems.map((item) => {
							const outOfStock = item.stock_qty <= 0;
							const lowStock = !outOfStock && item.stock_qty <= item.reorder_level;
							// A quiet left-edge accent rather than a text badge - the
							// number itself (still just a plain number, per the
							// earlier "keep numbers only" call) is what you read; this
							// is just enough of a signal to notice a problem row while
							// scanning, without shouting over the rest of the table.
							const accentColor = outOfStock ? "#e0a3a3" : lowStock ? "#f0c47a" : "transparent";
							return (
								<tr key={item.id} style={{ borderBottom: "1px solid var(--neutral-100)", borderLeft: `3px solid ${accentColor}` }}>
									<td style={tdStyle}>
										{item.image_url ? (
											<img src={item.image_url} alt={item.item_name} style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6 }} />
										) : (
											<div style={imagePlaceholderStyle}>📦</div>
										)}
									</td>
									<td style={tdStyle}>
										<div style={{ fontWeight: 600 }}>{item.item_name}</div>
										<div style={{ fontSize: 12, color: "var(--neutral-500)", display: "flex", gap: 6, alignItems: "center" }}>
											<span>{item.barcode}</span>
											{item.category && (
												<>
													<span>·</span>
													<span>{item.category}</span>
												</>
											)}
										</div>
									</td>
									<td style={{ ...tdStyle, color: "var(--neutral-500)" }}>{item.uom}</td>
									<td style={{ ...tdStyle, textAlign: "right", color: "var(--neutral-500)" }}>{formatPrice(item.cost_price)}</td>
									<td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{formatPrice(item.retail_price)}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(item.wholesale_price)}</td>
									<td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: outOfStock ? "#b42318" : lowStock ? "#b45f06" : "var(--neutral-900)" }}>
										{item.stock_qty}
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
								<td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									{search
										? `No items match "${search}".`
										: stockFilter === "low"
											? "No items are low on stock."
											: stockFilter === "out"
												? "No items are out of stock."
												: "No items yet."}
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
				categories={categories.filter((c) => c !== "All")}
				suppliers={suppliers}
			/>
			<StockAdjustModal item={adjusting} onClose={() => setAdjusting(null)} onAdjusted={reload} suppliers={suppliers} />
			<StockHistoryModal item={viewingHistory} onClose={() => setViewingHistory(null)} />
			<SuppliersModal open={suppliersOpen} onClose={() => setSuppliersOpen(false)} suppliers={suppliers} onChanged={reloadSuppliers} />
			<ManageCategoriesModal
				open={managingCategories}
				onClose={() => setManagingCategories(false)}
				categories={categories.filter((c) => c !== "All")}
				onRename={async (oldCategory, newCategory) => {
					await renameItemCategory(oldCategory, newCategory);
					await reload();
				}}
				allowClear
			/>
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
	align?: "right" | "center";
}) {
	const isActive = active === sortKey;
	return (
		<th
			style={{ ...stickyThStyle, textAlign: align ?? "left", cursor: "pointer", userSelect: "none" }}
			onClick={() => onClick(sortKey)}
		>
			{label} {isActive ? (dir === "asc" ? "▲" : "▼") : ""}
		</th>
	);
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const stickyThStyle: React.CSSProperties = {
	...thStyle,
	position: "sticky",
	top: 0,
	background: "#fff",
	boxShadow: "0 1px 0 var(--neutral-200)",
	zIndex: 1,
};
const categoryPillStyle: React.CSSProperties = {
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
const categoryPillActiveStyle: React.CSSProperties = {
	...categoryPillStyle,
	background: "var(--brand)",
	borderColor: "var(--brand)",
	color: "#fff",
};
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
	width: "100%",
	maxWidth: 240,
	boxSizing: "border-box",
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
