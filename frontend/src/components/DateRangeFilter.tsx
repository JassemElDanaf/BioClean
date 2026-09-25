// One real implementation of the date-range picker used everywhere a
// report or history list needs one (Dashboard, Sales History, Invoicing,
// Purchases, Quotation, Financial Summary, Inventory Audit, Expenses,
// Income). A single compact trigger button opens a floating panel with
// presets, a custom range, and a Clear option, closing on selection or
// outside click - every page importing this got the same upgrade for
// free with no per-page changes needed.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarIcon, ChevronDownIcon } from "./icons";

export interface DateRangeValue {
	from_date?: string;
	to_date?: string;
}

export interface DateRangePreset {
	key: string;
	label: string;
	range: () => DateRangeValue;
}

// Local calendar date, not toISOString() - that converts through UTC, so
// for anyone east of UTC (Lebanon included) a local midnight can roll back
// to the *previous* day's date once shifted (this was exactly the "click
// the 27th, get the 26th" bug in DatePicker). getFullYear/getMonth/
// getDate all read the local calendar fields directly, no UTC conversion.
export function isoDate(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function todayIso(): string {
	return isoDate(new Date());
}

function formatShort(dateStr: string): string {
	const d = new Date(dateStr + "T00:00:00");
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DateRangeFilter({
	presets,
	value,
	onChange,
}: {
	presets: DateRangePreset[];
	value: DateRangeValue;
	onChange: (value: DateRangeValue) => void;
}) {
	const [open, setOpen] = useState(false);
	// Positioned via a portal straight to <body> with a viewport-measured
	// top/left, rather than CSS-anchored to the trigger - every page wraps
	// this in a scroll container with overflowX hidden (see App.tsx's
	// <main>), which clips a plain position:absolute popover the moment it
	// would run past that container's own edge even though it'd fit the
	// actual screen. Escaping to <body> sidesteps that entirely.
	const [pos, setPos] = useState({ top: -9999, left: -9999 });
	const containerRef = useRef<HTMLDivElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (containerRef.current?.contains(target)) return;
			if (popoverRef.current?.contains(target)) return;
			setOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	useLayoutEffect(() => {
		if (!open) return;
		const trigger = containerRef.current;
		const popover = popoverRef.current;
		if (!trigger || !popover) return;
		const triggerRect = trigger.getBoundingClientRect();
		const popoverWidth = popover.offsetWidth;
		const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - popoverWidth - 8));
		setPos({ top: triggerRect.bottom + 6, left });
	}, [open]);

	// Derived, not stored - comparing the current value against what each
	// preset would itself produce means clicking a preset, hand-editing a
	// date, or switching between presets always highlights correctly (or
	// highlights nothing at all, for a genuinely custom range) with no
	// separate "which one is active" state to keep in sync.
	const activePreset = presets.find((p) => {
		const r = p.range();
		return r.from_date === value.from_date && r.to_date === value.to_date;
	});

	const isEmpty = !value.from_date && !value.to_date;
	const triggerLabel = activePreset
		? activePreset.label
		: !isEmpty
			? `${value.from_date ? formatShort(value.from_date) : "…"} – ${value.to_date ? formatShort(value.to_date) : "…"}`
			: "All Time";

	return (
		<div ref={containerRef} style={{ position: "relative" }}>
			<button type="button" onClick={() => setOpen((v) => !v)} style={triggerStyle}>
				<CalendarIcon size={15} color="var(--neutral-500)" />
				<span>{triggerLabel}</span>
				<span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}>
					<ChevronDownIcon size={14} color="var(--neutral-500)" />
				</span>
			</button>

			{open &&
				createPortal(
					<div ref={popoverRef} style={{ ...popoverStyle, top: pos.top, left: pos.left }}>
						<div style={{ display: "grid", gap: 2 }}>
							{presets.map((p) => {
								const isActive = activePreset?.key === p.key;
								return (
									<button
										key={p.key}
										type="button"
										onClick={() => {
											onChange(p.range());
											setOpen(false);
										}}
										style={isActive ? presetOptionActiveStyle : presetOptionStyle}
									>
										{p.label}
									</button>
								);
							})}
						</div>

						<div style={{ borderTop: "1px solid var(--neutral-100)", marginTop: 8, paddingTop: 10 }}>
							<div style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
								Custom Range
							</div>
							<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
								<input
									type="date"
									value={value.from_date ?? ""}
									onChange={(e) => onChange({ ...value, from_date: e.target.value || undefined })}
									style={dateInputStyle}
								/>
								<span style={{ color: "var(--neutral-500)", fontSize: 12 }}>to</span>
								<input
									type="date"
									value={value.to_date ?? ""}
									onChange={(e) => onChange({ ...value, to_date: e.target.value || undefined })}
									style={dateInputStyle}
								/>
							</div>
						</div>

						<button
							type="button"
							onClick={() => {
								onChange({});
								setOpen(false);
							}}
							disabled={isEmpty}
							style={isEmpty ? clearButtonDisabledStyle : clearButtonStyle}
						>
							Clear
						</button>
					</div>,
					document.body,
				)}
		</div>
	);
}

const triggerStyle: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: 8,
	padding: "9px 14px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
	whiteSpace: "nowrap",
};
const popoverStyle: React.CSSProperties = {
	position: "fixed",
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 10,
	boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
	padding: 12,
	minWidth: 220,
	zIndex: 300,
};
const presetOptionStyle: React.CSSProperties = {
	display: "block",
	width: "100%",
	textAlign: "left",
	padding: "8px 10px",
	borderRadius: 6,
	border: "none",
	background: "transparent",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
	fontFamily: "inherit",
};
const presetOptionActiveStyle: React.CSSProperties = {
	...presetOptionStyle,
	background: "var(--brand-pale)",
	color: "var(--brand)",
};
const dateInputStyle: React.CSSProperties = {
	flex: 1,
	minWidth: 0,
	padding: "7px 8px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	fontSize: 12,
	boxSizing: "border-box",
};
const clearButtonStyle: React.CSSProperties = {
	width: "100%",
	marginTop: 10,
	padding: "8px 10px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 12,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
};
const clearButtonDisabledStyle: React.CSSProperties = {
	...clearButtonStyle,
	color: "var(--neutral-300)",
	cursor: "not-allowed",
};
