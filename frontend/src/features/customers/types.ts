export interface Customer {
	id: number;
	name: string;
	phone: string | null;
	email: string | null;
	address: string | null;
	is_wholesale: boolean;
	created_at: string;
	// Accounts receivable - sum of this customer's unpaid invoice totals,
	// computed by the backend (never editable here).
	balance: number;
}

export interface CustomerFormValues {
	name: string;
	phone: string;
	email: string;
	address: string;
	is_wholesale: boolean;
}
