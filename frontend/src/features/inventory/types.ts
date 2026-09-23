export interface Item {
	id: number;
	item_name: string;
	category: string | null;
	uom: string;
	shelf_location: string | null;
	barcode: string;
	image_url: string | null;
	cost_price: number;
	retail_price: number;
	wholesale_price: number;
	reorder_level: number;
	supplier_id: number | null;
	supplier_name: string | null;
	stock_qty: number;
	created_at: string;
	updated_at: string;
}

export interface ItemFormValues {
	item_name: string;
	category: string;
	uom: string;
	shelf_location: string;
	barcode: string;
	cost_price: number;
	retail_price: number;
	wholesale_price: number;
	// Not shown in the form (confirmed: don't need to set these per item
	// at creation time) but still carried through create/edit round-trips
	// so they don't get silently reset to a default on every save.
	reorder_level: number;
	supplier_id: number | null;
	initial_stock_qty: number;
}

export interface Supplier {
	id: number;
	name: string;
	phone: string | null;
	email: string | null;
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
