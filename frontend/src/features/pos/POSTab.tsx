import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { CardIcon, CartIcon, CashIcon, MinusIcon, OtherPaymentIcon, PlusIcon, SearchIcon, TrashIcon } from "../../components/icons";
import StockBadge from "../../components/StockBadge";
import { ApiError } from "../../lib/api";
import { useBarcodeScanner } from "../../lib/useBarcodeScanner";
import { useTaxRate } from "../../lib/currency";
import { pickProductEmoji } from "../../lib/productEmoji";
import { listItems } from "../inventory/api";
import type { Item } from "../inventory/types";
import { checkout, printSaleReceipt, type Sale } from "./api";

interface CartLine {
	item: Item;
	qty: number;
	unitPrice: number;
}

type PaymentMethod = "cash" | "whish" | "other";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof CashIcon }[] = [
	{ value: "cash", label: "Cash", icon: CashIcon },
	{ value: "whish", label: "Whish", icon: CardIcon },
	{ value: "other", label: "Other", icon: OtherPaymentIcon },
];

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// crypto.randomUUID() only exists in a secure context (HTTPS or
// localhost) - this app is routinely opened over plain HTTP via its
// Tailscale address (http://jassem.tailb446a6.ts.net:3000), which is
// neither, so relying on it directly would crash POS on every device
// except localhost. Uniqueness (not cryptographic randomness) is all this
// needs, so a plain fallback is fine when the real thing isn't available.
function generateId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function POSTab() {
	const [items, setItems] = useState<Item[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("All");
	const [cart, setCart] = useState<CartLine[]>([]);
	const [discount, setDiscount] = useState(0);
	const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
	const [amountTendered, setAmountTendered] = useState<number | "">("");
	const [checkingOut, setCheckingOut] = useState(false);
	const [checkoutError, setCheckoutError] = useState<string | null>(null);
	const [completedSale, setCompletedSale] = useState<Sale | null>(null);
	const [printing, setPrinting] = useState(false);
	const [printError, setPrintError] = useState<string | null>(null);
	const [scanError, setScanError] = useState<string | null>(null);
	const scanErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// One id per checkout attempt - a double-click or a retried request
	// after a dropped response reuses this same value, so the backend can
	// tell "this is the same sale again" from "this is a new sale" and
	// never deduct stock twice. Only replaced once a sale actually
	// completes (see resetForNextSale) - a failed attempt keeps its key so
	// retrying it is safe by construction, not by accident.
	const checkoutKeyRef = useRef(generateId());

	useEffect(() => {
		listItems()
			.then(({ items }) => setItems(items))
			.catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load products"))
			.finally(() => setLoading(false));
	}, []);

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

	const taxRate = useTaxRate();
	const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.qty * line.unitPrice, 0), [cart]);
	const discountAmount = Math.min(Math.max(discount, 0), subtotal);
	const taxableAmount = subtotal - discountAmount;
	const taxAmount = round2((taxableAmount * taxRate) / 100);
	const total = round2(taxableAmount + taxAmount);
	const tenderedNum = typeof amountTendered === "number" ? amountTendered : 0;
	const changeDue = paymentMethod === "cash" ? round2(tenderedNum - total) : null;

	function cartQtyFor(itemId: number): number {
		return cart.find((l) => l.item.id === itemId)?.qty ?? 0;
	}

	function addToCart(item: Item) {
		if (item.stock_qty <= 0) return;
		setCart((lines) => {
			const existing = lines.find((l) => l.item.id === item.id);
			if (existing) {
				if (existing.qty >= item.stock_qty) return lines;
				return lines.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
			}
			return [...lines, { item, qty: 1, unitPrice: item.retail_price }];
		});
	}

	function flashScanError(message: string) {
		if (scanErrorTimeoutRef.current) clearTimeout(scanErrorTimeoutRef.current);
		setScanError(message);
		scanErrorTimeoutRef.current = setTimeout(() => setScanError(null), 3000);
	}

	function handleScan(barcode: string) {
		const item = items.find((i) => i.barcode === barcode);
		if (!item) {
			flashScanError(`No item found for barcode "${barcode}"`);
			return;
		}
		if (item.stock_qty <= 0) {
			flashScanError(`"${item.item_name}" is out of stock`);
			return;
		}
		addToCart(item);
	}

	// Works no matter what's focused on this tab (the search box, a qty
	// input, nothing) - see useBarcodeScanner's docstring for why that's
	// safe. Disabled while the completed-sale modal is up so a scan can't
	// silently modify a cart the cashier is done looking at.
	useBarcodeScanner(handleScan, !completedSale);

	function changeQty(itemId: number, delta: number) {
		setCart((lines) =>
			lines
				.map((l) => (l.item.id === itemId ? { ...l, qty: Math.min(Math.max(l.qty + delta, 1), l.item.stock_qty) } : l))
				.filter((l) => l.qty > 0)
		);
	}

	function removeLine(itemId: number) {
		setCart((lines) => lines.filter((l) => l.item.id !== itemId));
	}

	function resetForNextSale() {
		setCart([]);
		setDiscount(0);
		setAmountTendered("");
		setPaymentMethod("cash");
		setCheckoutError(null);
		setCompletedSale(null);
		setPrintError(null);
		// A new sale starting fresh gets its own id - the one that just
		// completed keeps its key retired forever, matching one key per Sale.
		checkoutKeyRef.current = generateId();
	}

	async function handlePrintReceipt(saleId: number) {
		// A failed/unconfigured printer is never allowed to affect the sale
		// itself (it's already committed) - this is a standalone, freely
		// retryable action, same reasoning as the PDF download link.
		setPrinting(true);
		setPrintError(null);
		try {
			await printSaleReceipt(saleId);
		} catch (err) {
			setPrintError(err instanceof ApiError ? err.message : "Couldn't print - check the printer connection.");
		} finally {
			setPrinting(false);
		}
	}

	async function handleCheckout() {
		if (cart.length === 0) return;
		setCheckingOut(true);
		setCheckoutError(null);
		try {
			// Discount is a flat dollar amount off the whole sale, but the
			// backend only knows per-line unit_price - scaling every line's
			// price down by the same ratio keeps "unit_price = what was
			// actually charged" true on each SaleLine (same invariant the
			// backend already relies on for unit_cost), while still summing
			// to exactly `total`. A few cents of per-line rounding drift is
			// the accepted tradeoff, same as any real register.
			const ratio = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 1;
			const sale = await checkout({
				lines: cart.map((line) => ({
					item_id: line.item.id,
					qty: line.qty,
					unit_price: round2(line.unitPrice * ratio),
				})),
				payment_method: paymentMethod,
				amount_tendered: paymentMethod === "cash" && amountTendered !== "" ? amountTendered : undefined,
				idempotency_key: checkoutKeyRef.current,
			});
			setCompletedSale(sale);
			setCart([]);
			// Stock just changed under every sold item - refresh so the grid
			// (and stock badges/qty caps) reflect it immediately.
			listItems().then(({ items }) => setItems(items));
		} catch (err) {
			setCheckoutError(err instanceof ApiError ? err.message : "Checkout failed - please try again.");
		} finally {
			setCheckingOut(false);
		}
	}

	const canComplete = cart.length > 0 && !checkingOut && (paymentMethod !== "cash" || amountTendered === "" || tenderedNum >= total);

	if (loading) return <div>Loading products...</div>;
	if (loadError) return <div style={{ color: "crimson" }}>Couldn't load products: {loadError}</div>;

	return (
		<div className="pos-layout" style={{ display: "flex", gap: 24, height: "100%" }}>
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
			<div className="pos-products" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
					<SidebarToggleButton />
					<div style={{ position: "relative", flex: 1 }}>
						<span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-500)" }}>
							<SearchIcon size={18} />
						</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search by product name or barcode..."
							style={searchInputStyle}
						/>
					</div>
				</div>

				<div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 4 }}>
					{categories.map((c) => (
						<button key={c} onClick={() => setCategory(c)} style={c === category ? pillActiveStyle : pillStyle}>
							{c}
						</button>
					))}
				</div>

				<div className="pos-products-scroll" style={{ flex: 1, overflowY: "auto", paddingTop: 8 }}>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
						{visibleItems.map((item) => (
							<ProductCard key={item.id} item={item} inCartQty={cartQtyFor(item.id)} onAdd={() => addToCart(item)} />
						))}
					</div>
					{visibleItems.length === 0 && <div style={{ color: "var(--neutral-500)", padding: 32, textAlign: "center" }}>No products match.</div>}
				</div>
			</div>

			<div className="pos-cart" style={{ width: 360, flexShrink: 0, background: "#fff", borderRadius: 12, border: "1px solid var(--neutral-200)", display: "flex", flexDirection: "column" }}>
				<div style={{ padding: "18px 20px 14px" }}>
					<h2 style={{ margin: 0, fontSize: 16 }}>Current Sale</h2>
					<div style={{ fontSize: 13, color: "var(--neutral-500)" }}>{cart.length} item{cart.length === 1 ? "" : "s"}</div>
				</div>

				<div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid var(--neutral-200)" }}>
					{cart.length === 0 ? (
						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--neutral-500)", gap: 10 }}>
							<CartIcon size={40} color="var(--neutral-300)" />
							<span>Cart is empty</span>
						</div>
					) : (
						<div style={{ padding: "8px 16px" }}>
							{cart.map((line) => (
								<div key={line.item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--neutral-100)" }}>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.item.item_name}</div>
										<div style={{ fontSize: 12, color: "var(--neutral-500)" }}>${line.unitPrice.toFixed(2)} each</div>
									</div>
									<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
										<button onClick={() => changeQty(line.item.id, -1)} style={qtyButtonStyle}>
											<MinusIcon size={13} />
										</button>
										<span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{line.qty}</span>
										<button onClick={() => changeQty(line.item.id, 1)} disabled={line.qty >= line.item.stock_qty} style={qtyButtonStyle}>
											<PlusIcon size={13} />
										</button>
									</div>
									<div style={{ fontSize: 13, fontWeight: 700, width: 52, textAlign: "right" }}>${(line.qty * line.unitPrice).toFixed(2)}</div>
									<button onClick={() => removeLine(line.item.id)} style={{ ...qtyButtonStyle, color: "crimson", border: "none" }}>
										<TrashIcon size={15} />
									</button>
								</div>
							))}
						</div>
					)}
				</div>

				<div style={{ padding: "16px 20px", borderTop: "1px solid var(--neutral-200)" }}>
					<SummaryRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
						<span style={{ fontSize: 13, color: "var(--neutral-500)" }}>Discount</span>
						<input
							type="number"
							min={0}
							step="0.01"
							value={discount || ""}
							onChange={(e) => setDiscount(Number(e.target.value) || 0)}
							placeholder="0.00"
							style={discountInputStyle}
						/>
					</div>
					{taxRate > 0 && <SummaryRow label={`Tax (${taxRate}%)`} value={`$${taxAmount.toFixed(2)}`} />}

					{/* Above Total, not below it - Total should always sit the same
					    fixed distance above the (always-present) payment buttons, not
					    jump around depending on which payment method happens to add
					    its own extra field. */}
					{paymentMethod === "cash" && (
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
							<label style={{ fontSize: 13, color: "var(--neutral-500)" }}>Amount Tendered</label>
							<input
								type="number"
								min={0}
								step="0.01"
								value={amountTendered}
								onChange={(e) => setAmountTendered(e.target.value === "" ? "" : Number(e.target.value))}
								placeholder="0.00"
								style={discountInputStyle}
							/>
						</div>
					)}
					{paymentMethod === "cash" && amountTendered !== "" && (
						<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", color: changeDue !== null && changeDue < 0 ? "crimson" : "var(--neutral-900)" }}>
							<span>Change Due</span>
							<span style={{ fontWeight: 700 }}>${(changeDue ?? 0).toFixed(2)}</span>
						</div>
					)}

					<div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", borderTop: "1px solid var(--neutral-200)", marginTop: 6 }}>
						<span style={{ fontSize: 15, fontWeight: 700 }}>Total</span>
						<span style={{ fontSize: 18, fontWeight: 800 }}>${total.toFixed(2)}</span>
					</div>

					<div style={{ display: "flex", gap: 8, margin: "10px 0 10px" }}>
						{PAYMENT_METHODS.map((m) => (
							<button key={m.value} onClick={() => setPaymentMethod(m.value)} style={m.value === paymentMethod ? paymentActiveStyle : paymentStyle}>
								<m.icon size={15} />
								{m.label}
							</button>
						))}
					</div>

					{checkoutError && <div style={{ color: "crimson", fontSize: 13, marginBottom: 10 }}>{checkoutError}</div>}

					<button onClick={handleCheckout} disabled={!canComplete} style={canComplete ? completeButtonStyle : completeButtonDisabledStyle}>
						{checkingOut ? "Processing..." : "Complete Sale"}
					</button>
				</div>
			</div>

			<Modal open={!!completedSale} onClose={resetForNextSale} title="Sale Complete">
				{completedSale && (
					<div style={{ display: "grid", gap: 10 }}>
						<div style={{ fontSize: 14 }}>
							Sale <strong>#{completedSale.id}</strong> - {completedSale.lines.length} item{completedSale.lines.length === 1 ? "" : "s"}
						</div>
						<SummaryRow label="Subtotal" value={`$${completedSale.subtotal.toFixed(2)}`} />
						{completedSale.tax_amount > 0 && <SummaryRow label="Tax" value={`$${completedSale.tax_amount.toFixed(2)}`} />}
						<SummaryRow label="Total" value={`$${completedSale.total.toFixed(2)}`} bold />
						{completedSale.payment_method === "cash" && completedSale.amount_tendered != null && (
							<>
								<SummaryRow label="Tendered" value={`$${completedSale.amount_tendered.toFixed(2)}`} />
								<SummaryRow label="Change Due" value={`$${(completedSale.change_due ?? 0).toFixed(2)}`} />
							</>
						)}
						{printError && <div style={{ color: "crimson", fontSize: 13 }}>{printError}</div>}
						<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
							<button onClick={() => handlePrintReceipt(completedSale.id)} disabled={printing} style={{ ...smallButtonStyle, flex: 1, padding: "10px 0" }}>
								{printing ? "Printing..." : "Print Receipt"}
							</button>
							<button onClick={resetForNextSale} style={{ ...completeButtonStyle, flex: 1 }}>
								New Sale
							</button>
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}

function ProductCard({ item, inCartQty, onAdd }: { item: Item; inCartQty: number; onAdd: () => void }) {
	const outOfStock = item.stock_qty <= 0;
	const atCap = inCartQty >= item.stock_qty && !outOfStock;

	return (
		<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column" }}>
			{item.image_url ? (
				<img src={item.image_url} alt={item.item_name} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
			) : (
				<div style={{ width: "100%", height: 90, borderRadius: 8, background: "var(--brand-pale)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 10 }}>
					{pickProductEmoji(item.item_name)}
				</div>
			)}
			<div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{item.item_name}</div>
			<div style={{ fontSize: 12, color: "var(--neutral-500)", marginBottom: 8 }}>
				{item.stock_qty} {item.uom}
			</div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
				<span style={{ fontSize: 15, fontWeight: 800 }}>${item.retail_price.toFixed(2)}</span>
				<StockBadge stockQty={item.stock_qty} reorderLevel={item.reorder_level} />
			</div>
			<button onClick={onAdd} disabled={outOfStock || atCap} style={outOfStock || atCap ? addButtonDisabledStyle : addButtonStyle}>
				{inCartQty > 0 ? `+ Add (${inCartQty} in cart)` : "+ Add"}
			</button>
		</div>
	);
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
	return (
		<div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400, color: bold ? "var(--neutral-900)" : "var(--neutral-500)" }}>
			<span>{label}</span>
			<span style={{ color: "var(--neutral-900)", fontWeight: bold ? 800 : 600 }}>{value}</span>
		</div>
	);
}

const searchInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "12px 14px 12px 40px",
	borderRadius: 10,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	background: "#fff",
	boxSizing: "border-box",
};
const pillStyle: React.CSSProperties = {
	padding: "8px 16px",
	borderRadius: 999,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	whiteSpace: "nowrap",
	cursor: "pointer",
	flexShrink: 0,
};
const pillActiveStyle: React.CSSProperties = {
	...pillStyle,
	background: "var(--brand)",
	borderColor: "var(--brand)",
	color: "#fff",
};
const addButtonStyle: React.CSSProperties = {
	padding: "9px 0",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 13,
	fontWeight: 700,
	cursor: "pointer",
};
const addButtonDisabledStyle: React.CSSProperties = {
	...addButtonStyle,
	background: "var(--neutral-200)",
	color: "var(--neutral-500)",
	cursor: "not-allowed",
};
const qtyButtonStyle: React.CSSProperties = {
	width: 24,
	height: 24,
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
	padding: 0,
};
const discountInputStyle: React.CSSProperties = {
	width: 90,
	padding: "6px 8px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
	textAlign: "right",
};
const paymentStyle: React.CSSProperties = {
	flex: 1,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 6,
	padding: "10px 0",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	cursor: "pointer",
};
const paymentActiveStyle: React.CSSProperties = {
	...paymentStyle,
	border: "1px solid var(--brand)",
	background: "var(--brand-pale)",
	color: "var(--brand)",
};
const smallButtonStyle: React.CSSProperties = {
	borderRadius: 10,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	color: "var(--neutral-900)",
	fontSize: 14,
	fontWeight: 700,
	cursor: "pointer",
};
const completeButtonStyle: React.CSSProperties = {
	width: "100%",
	padding: "14px 0",
	borderRadius: 10,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 15,
	fontWeight: 700,
	cursor: "pointer",
};
const completeButtonDisabledStyle: React.CSSProperties = {
	...completeButtonStyle,
	background: "var(--brand-pale)",
	color: "#fff",
	cursor: "not-allowed",
};
