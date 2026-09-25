import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon, SearchIcon } from "./icons";

// Same searchable-dropdown shape as CustomerPicker (trigger button + a
// popover with a search box on top and a filtered list below) - but
// local/synchronous, not server-backed, since the category list here is
// already a short array the caller already has in memory. Typing IS the
// value (there's no separate "pick" vs "type a new one" mode to get stuck
// in): it filters the list live, and whatever's currently typed is what
// this field holds - clicking a suggestion just fills the box with it,
// same as clicking an autocomplete suggestion anywhere else.
export default function CategoryPicker({
	value,
	onChange,
	categories,
	placeholder = "Select or type a category...",
}: {
	value: string;
	onChange: (value: string) => void;
	categories: string[];
	placeholder?: string;
}) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	function handleOpen() {
		setOpen(true);
		setTimeout(() => inputRef.current?.select(), 0);
	}

	const q = value.trim().toLowerCase();
	const matches = q ? categories.filter((c) => c.toLowerCase().includes(q)) : categories;
	const isNewCategory = q !== "" && !categories.some((c) => c.toLowerCase() === q);

	return (
		<div ref={containerRef} style={{ position: "relative" }}>
			<button type="button" onClick={handleOpen} style={triggerStyle}>
				<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value ? "var(--neutral-900)" : "var(--neutral-500)" }}>
					{value || placeholder}
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
							value={value}
							onChange={(e) => onChange(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === "Escape") setOpen(false);
							}}
							placeholder="Type to search or add a category..."
							style={searchInputStyle}
						/>
					</div>
					<div style={{ maxHeight: 220, overflowY: "auto" }}>
						{/* onMouseDown + preventDefault, not onClick - selecting an
						    option while the search input still has focus can
						    otherwise cost this its first click: the mousedown
						    shifts focus off the input, which (in this exact
						    "click a list item next to a still-focused text field"
						    shape) can make the browser dispatch the click to a
						    stale target instead of committing it here. Handling
						    the pick on mousedown itself (as most comboboxes do)
						    and blocking the default focus change sidesteps it
						    entirely. */}
						{value !== "" && (
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault();
									onChange("");
									setOpen(false);
								}}
								style={optionStyle(false)}
							>
								<span style={{ color: "var(--neutral-500)" }}>No category</span>
							</button>
						)}
						{matches.map((c) => (
							<button
								key={c}
								type="button"
								onMouseDown={(e) => {
									e.preventDefault();
									onChange(c);
									setOpen(false);
								}}
								style={optionStyle(c.toLowerCase() === q)}
							>
								{c}
							</button>
						))}
						{isNewCategory && (
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault();
									setOpen(false);
								}}
								style={optionStyle(false)}
							>
								<span style={{ color: "var(--brand)", fontWeight: 600 }}>+ Add "{value.trim()}" as a new category</span>
							</button>
						)}
						{matches.length === 0 && !isNewCategory && <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--neutral-500)" }}>No categories yet - type to create one.</div>}
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
