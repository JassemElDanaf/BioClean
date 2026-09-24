export interface Customer {
	id: number;
	name: string;
	phone: string | null;
	email: string | null;
	address: string | null;
	is_wholesale: boolean;
	created_at: string;
}

export interface CustomerFormValues {
	name: string;
	phone: string;
	email: string;
	address: string;
	is_wholesale: boolean;
}
