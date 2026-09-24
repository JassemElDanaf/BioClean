import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ActionItem {
	label: string;
	onClick: () => void;
	danger?: boolean;
}

// Reusable "Actions ▾" dropdown - any table row anywhere in the app that
// needs more than 2-3 inline buttons should use this instead of piling
// up text links, which is what Inventory's row actions used to do.
//
// Renders the open menu into a portal on document.body, positioned via
// `fixed` coordinates measured from the trigger button - every table this
// sits in scrolls horizontally in a container with overflow-y: hidden
// (so the x-scrollbar doesn't also grow a stray y-scrollbar), and an
// absolutely-positioned menu nested inside that container gets clipped by
// that overflow, cutting off exactly the items near the bottom (this is
// what was reported: "Delete" invisible under the next row). A portal
// escapes that ancestor entirely regardless of any table's overflow/
// scroll settings.
export default function ActionsMenu({ actions }: { actions: ActionItem[] }) {
	const [open, setOpen] = useState(false);
	const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	function handleToggle() {
		if (!open && triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
		}
		setOpen((o) => !o);
	}

	useEffect(() => {
		if (!open) return;

		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (triggerRef.current?.contains(target)) return;
			if (menuRef.current?.contains(target)) return;
			setOpen(false);
		}
		// The menu tracks the trigger's position only at open time - rather
		// than wire up a scroll listener to keep it glued in place, just
		// close it if the page scrolls (same UX any native <select> uses).
		function handleScroll() {
			setOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		window.addEventListener("scroll", handleScroll, true);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			window.removeEventListener("scroll", handleScroll, true);
		};
	}, [open]);

	return (
		<div style={{ display: "inline-block" }}>
			<button ref={triggerRef} onClick={handleToggle} style={triggerStyle}>
				Actions ▾
			</button>
			{open &&
				coords &&
				createPortal(
					<div ref={menuRef} style={{ ...menuStyle, top: coords.top, right: coords.right }}>
						{actions.map((action) => (
							<button
								key={action.label}
								className="actions-menu-item"
								onClick={() => {
									setOpen(false);
									action.onClick();
								}}
								style={{ ...itemStyle, color: action.danger ? "crimson" : "var(--neutral-900)" }}
							>
								{action.label}
							</button>
						))}
					</div>,
					document.body
				)}
		</div>
	);
}

const triggerStyle: React.CSSProperties = {
	padding: "6px 12px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
};

const menuStyle: React.CSSProperties = {
	position: "fixed",
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 8,
	boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
	minWidth: 150,
	zIndex: 1000,
	display: "flex",
	flexDirection: "column",
	padding: 4,
};

const itemStyle: React.CSSProperties = {
	textAlign: "left",
	padding: "8px 10px",
	border: "none",
	background: "none",
	fontSize: 13,
	fontWeight: 500,
	cursor: "pointer",
	borderRadius: 4,
	whiteSpace: "nowrap",
};
