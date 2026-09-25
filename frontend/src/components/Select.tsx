import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "./icons";

export interface SelectOption<T extends string | number> {
	value: T;
	label: string;
}

// One reusable dropdown, styled to match DateRangeFilter's popover (white
// card, rounded corners, brand-pale active highlight, portal-positioned so
// it can't get clipped by a scrolling ancestor) - used in place of a plain
// native <select> everywhere, since the browser's own select menu renders
// with OS chrome (a flat blue highlight, system font, square corners) that
// doesn't match the rest of the app.
export default function Select<T extends string | number>({
	value,
	onChange,
	options,
	placeholder,
	disabled,
	required,
	style,
}: {
	value: T | "";
	onChange: (value: T) => void;
	options: SelectOption<T>[];
	placeholder?: string;
	disabled?: boolean;
	required?: boolean;
	style?: React.CSSProperties;
}) {
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState({ top: -9999, left: -9999, width: 0 });
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
		const popoverWidth = Math.max(popover.offsetWidth, triggerRect.width);
		const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - popoverWidth - 8));
		setPos({ top: triggerRect.bottom + 6, left, width: triggerRect.width });
	}, [open]);

	const active = options.find((o) => o.value === value);
	const label = active ? active.label : (placeholder ?? "Select...");

	return (
		<div ref={containerRef} style={{ position: "relative", display: "inline-block", width: style?.width ?? "auto" }}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				style={{ ...triggerStyle, ...(disabled ? triggerDisabledStyle : null), ...style }}
			>
				<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
				<span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms", flexShrink: 0 }}>
					<ChevronDownIcon size={14} color="var(--neutral-500)" />
				</span>
			</button>

			{open &&
				createPortal(
					<div ref={popoverRef} style={{ ...popoverStyle, top: pos.top, left: pos.left, minWidth: pos.width }}>
						{!active && placeholder && !required && (
							<div style={{ ...optionStyle, color: "var(--neutral-500)", cursor: "default" }}>{placeholder}</div>
						)}
						{options.map((o) => {
							const isActive = o.value === value;
							return (
								<button
									key={String(o.value)}
									type="button"
									onClick={() => {
										onChange(o.value);
										setOpen(false);
									}}
									style={isActive ? optionActiveStyle : optionStyle}
								>
									{o.label}
								</button>
							);
						})}
					</div>,
					document.body,
				)}
		</div>
	);
}

const triggerStyle: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "space-between",
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
const triggerDisabledStyle: React.CSSProperties = {
	background: "var(--neutral-100)",
	color: "var(--neutral-500)",
	cursor: "not-allowed",
};
const popoverStyle: React.CSSProperties = {
	position: "fixed",
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 10,
	boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
	padding: 6,
	zIndex: 300,
	display: "grid",
	gap: 2,
	maxHeight: 280,
	overflowY: "auto",
};
const optionStyle: React.CSSProperties = {
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
const optionActiveStyle: React.CSSProperties = {
	...optionStyle,
	background: "var(--brand-pale)",
	color: "var(--brand)",
};
