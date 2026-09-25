import { useEffect, useRef, useState } from "react";
import { listCustomers } from "../features/customers/api";
import type { Customer } from "../features/customers/types";
import { ChevronRightIcon, SearchIcon } from "./icons";

const RESULT_LIMIT = 20;
const DEBOUNCE_MS = 250;

// A searchable stand-in for a plain <select>, backed by the server rather
// than a full customer list pulled into the browser up front - once the
// customer table is in the thousands, "fetch everyone, filter in React"
// stops being viable (a bigger payload every time this loads, and no
// upper bound on it), so this queries GET /customers?q=... itself,
// debounced, the same way a real search box should. The caller only ever
// holds the one selected Customer, never the whole table.
export default function CustomerPicker({
	value,
	onChange,
	noneLabel = "Walk-in / no customer",
}: {
	value: Customer | null;
	onChange: (customer: Customer | null) => void;
	noneLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [results, setResults] = useState<Customer[]>([]);
	const [loading, setLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestIdRef = useRef(0);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
				setSearch("");
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (!open) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		const requestId = ++requestIdRef.current;
		debounceRef.current = setTimeout(() => {
			setLoading(true);
			listCustomers(search || undefined, RESULT_LIMIT)
				.then((customers) => {
					// A slower earlier request landing after a newer one would
					// otherwise flash stale results back onto the screen.
					if (requestId === requestIdRef.current) setResults(customers);
				})
				.finally(() => {
					if (requestId === requestIdRef.current) setLoading(false);
				});
		}, DEBOUNCE_MS);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [open, search]);

	function handleSelect(customer: Customer | null) {
		onChange(customer);
		setOpen(false);
		setSearch("");
	}

	function handleOpen() {
		setOpen(true);
		setTimeout(() => inputRef.current?.focus(), 0);
	}

	return (
		<div ref={containerRef} style={{ position: "relative" }}>
			<button type="button" onClick={handleOpen} style={triggerStyle}>
				<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
					{value ? `${value.name}${value.is_wholesale ? " (wholesale)" : ""}` : noneLabel}
				</span>
				<span style={{ display: "inline-flex", transform: "rotate(90deg)", flexShrink: 0 }}>
					<ChevronRightIcon size={13} color="var(--neutral-500)" />
				</span>
			</button>

			{open && (
				<div style={dropdownStyle}>
					<div style={{ position: "relative", padding: 8 }}>
						<span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-500)" }}>
							<SearchIcon size={13} />
						</span>
						<input
							ref={inputRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search name or phone..."
							style={searchInputStyle}
						/>
					</div>
					<div style={{ maxHeight: 220, overflowY: "auto" }}>
						<button type="button" onClick={() => handleSelect(null)} style={optionStyle(value === null)}>
							{noneLabel}
						</button>
						{loading ? (
							<div style={{ padding: "12px 14px", fontSize: 13, color: "var(--neutral-500)" }}>Searching...</div>
						) : (
							<>
								{results.map((c) => (
									<button key={c.id} type="button" onClick={() => handleSelect(c)} style={optionStyle(value?.id === c.id)}>
										<div style={{ fontWeight: 600 }}>
											{c.name} {c.is_wholesale ? <span style={{ fontWeight: 500, color: "var(--neutral-500)" }}>(wholesale)</span> : null}
										</div>
										{c.phone && <div style={{ fontSize: 12, color: "var(--neutral-500)" }}>{c.phone}</div>}
									</button>
								))}
								{results.length === 0 && <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--neutral-500)" }}>No customers match.</div>}
								{results.length === RESULT_LIMIT && (
									<div style={{ padding: "8px 14px", fontSize: 11, color: "var(--neutral-500)" }}>Showing the first {RESULT_LIMIT} - keep typing to narrow it down.</div>
								)}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function optionStyle(active: boolean): React.CSSProperties {
	return {
		display: "block",
		width: "100%",
		textAlign: "left",
		padding: "8px 14px",
		border: "none",
		background: active ? "var(--brand-pale)" : "transparent",
		cursor: "pointer",
		fontSize: 13,
		fontFamily: "inherit",
		color: "var(--neutral-900)",
	};
}

const triggerStyle: React.CSSProperties = {
	width: "100%",
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: 8,
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 14,
	fontFamily: "inherit",
	cursor: "pointer",
	boxSizing: "border-box",
};
const dropdownStyle: React.CSSProperties = {
	position: "absolute",
	top: "calc(100% + 4px)",
	left: 0,
	right: 0,
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 10,
	boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
	zIndex: 200,
	overflow: "hidden",
};
const searchInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "7px 10px 7px 30px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
	boxSizing: "border-box",
};
