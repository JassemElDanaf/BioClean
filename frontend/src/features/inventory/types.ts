export interface Item {
	id: number;
	item_name: string;
	category: string | null;
	uom: string;
	barcode: string;
	image_url: string | null;
	cost_price: number;
	retail_price: number;
	wholesale_price: number;
	reorder_level: number;
	stock_qty: number;
	created_at: string;
	updated_at: string;
}

export interface ItemFormValues {
	item_name: string;
	category: string;
	uom: string;
	barcode: string;
	cost_price: number;
	retail_price: number;
	wholesale_price: number;
	// Reorder level isn't shown in the form (confirmed: don't need to tune
	// this per item today) but is still carried through create/edit
	// round-trips so saving an edit doesn't silently reset it to a default.
	reorder_level: number;
	initial_stock_qty: number;
	// Who this opening stock was actually bought from - optional, but when
	// set (alongside initial_stock_qty) the backend records it as a real
	// received Purchase Order so it shows up in Purchase History, since we
	// did actually pay someone for it (see backend ItemCreate.supplier_id's
	// docstring).
	supplier_id: number | "";
}

export interface Supplier {
	id: number;
	name: string;
	phone: string | null;
	email: string | null;
	// Accounts payable - sum of received-but-unpaid purchase order totals
	// owed to this supplier, computed by the backend.
	balance: number;
}

export interface SupplierFormValues {
	name: string;
	phone: string;
	email: string;
}

export interface StockMovement {
	id: number;
	qty_before: number;
	delta: number;
	qty_after: number;
	reason: string;
	unit_cost: number | null;
	user: string;
	reference: string | null;
	created_at: string;
}

export interface AuditReportRow {
	id: number;
	created_at: string;
	barcode: string;
	item_name: string;
	warehouse_name: string;
	reason: string;
	qty_before: number;
	delta: number;
	qty_after: number;
	unit_cost: number | null;
	user: string;
	reference: string | null;
}

export interface Warehouse {
	id: number;
	name: string;
	is_default: boolean;
}

export interface AuditFilters {
	from_date?: string;
	to_date?: string;
	item_id?: number;
	warehouse_id?: number;
	reason?: string;
}
