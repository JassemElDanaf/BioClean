import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isoDate, todayIso } from "./DateRangeFilter";
import { CalendarIcon, ChevronRightIcon } from "./icons";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Native Date.getDay() is Sunday-first (0=Sun..6=Sat); the grid below reads
// Monday-first to match DateRangeFilter's own calendar-adjacent look.
function mondayIndex(d: Date): number {
	return (d.getDay() + 6) % 7;
}

// A single-date picker styled to match DateRangeFilter/Select (white card,
// rounded corners, brand-green selection, portal-positioned) - stands in
// for a plain <input type="date">, whose native calendar popup is drawn by
// the OS/browser and can't be restyled at all.
export default function DatePicker({
	value,
	onChange,
	placeholder = "Select date...",
	style,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	style?: React.CSSProperties;
}) {
	const [open, setOpen] = useState(false);
	const [viewMonth, setViewMonth] = useState(() => startOfMonth(value ? new Date(value + "T00:00:00") : new Date()));
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
		setViewMonth(startOfMonth(value ? new Date(value + "T00:00:00") : new Date()));
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
	}, [open, viewMonth]);

	const days = useMemo(() => {
		const total = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
		const leading = mondayIndex(viewMonth);
		const cells: (Date | null)[] = [];
		for (let i = 0; i < leading; i++) cells.push(null);
		for (let d = 1; d <= total; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
		while (cells.length % 7 !== 0) cells.push(null);
		return cells;
	}, [viewMonth]);

	const label = value ? new Date(value + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : placeholder;
	const today = todayIso();

	return (
		<div ref={containerRef} style={{ position: "relative", width: style?.width ?? "100%" }}>
			<button type="button" onClick={() => setOpen((v) => !v)} style={{ ...triggerStyle, ...style }}>
				<CalendarIcon size={15} color="var(--neutral-500)" />
				<span
					style={{
						flex: 1,
						textAlign: "left",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						color: value ? "var(--neutral-900)" : "var(--neutral-500)",
					}}
				>
					{label}
				</span>
			</button>

			{open &&
				createPortal(
					<div ref={popoverRef} style={{ ...popoverStyle, top: pos.top, left: pos.left }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
							<button
								type="button"
								onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
								style={navButtonStyle}
							>
								<span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
									<ChevronRightIcon size={14} color="var(--neutral-500)" />
								</span>
							</button>
							<div style={{ fontSize: 13, fontWeight: 700 }}>
								{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
							</div>
							<button
								type="button"
								onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
								style={navButtonStyle}
							>
								<ChevronRightIcon size={14} color="var(--neutral-500)" />
							</button>
						</div>

						<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
							{WEEKDAYS.map((w) => (
								<div key={w} style={{ fontSize: 10, fontWeight: 700, color: "var(--neutral-500)", textAlign: "center", padding: "4px 0" }}>
									{w}
								</div>
							))}
						</div>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
							{days.map((d, i) => {
								if (!d) return <div key={i} />;
								const iso = isoDate(d);
								const isSelected = iso === value;
								const isToday = iso === today;
								return (
									<button
										key={i}
										type="button"
										onClick={() => {
											onChange(iso);
											setOpen(false);
										}}
										style={isSelected ? dayActiveStyle : isToday ? dayTodayStyle : dayStyle}
									>
										{d.getDate()}
									</button>
								);
							})}
						</div>

						<div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--neutral-100)" }}>
							<button
								type="button"
								onClick={() => {
									onChange("");
									setOpen(false);
								}}
								style={linkButtonStyle}
							>
								Clear
							</button>
							<button
								type="button"
								onClick={() => {
									onChange(today);
									setOpen(false);
								}}
								style={linkButtonStyle}
							>
								Today
							</button>
						</div>
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
	width: "100%",
	boxSizing: "border-box",
	fontFamily: "inherit",
};
const popoverStyle: React.CSSProperties = {
	position: "fixed",
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 10,
	boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
	padding: 14,
	zIndex: 300,
	width: 260,
};
const navButtonStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: 26,
	height: 26,
	borderRadius: 6,
	border: "none",
	background: "transparent",
	cursor: "pointer",
	padding: 0,
};
const dayStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	height: 30,
	borderRadius: 6,
	border: "none",
	background: "transparent",
	fontSize: 12,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
	fontFamily: "inherit",
};
const dayTodayStyle: React.CSSProperties = {
	...dayStyle,
	background: "var(--brand-pale)",
	color: "var(--brand)",
	fontWeight: 800,
};
const dayActiveStyle: React.CSSProperties = {
	...dayStyle,
	background: "var(--brand)",
	color: "#fff",
};
const linkButtonStyle: React.CSSProperties = {
	border: "none",
	background: "transparent",
	color: "var(--brand)",
	fontSize: 12,
	fontWeight: 700,
	cursor: "pointer",
	padding: 4,
	fontFamily: "inherit",
};
