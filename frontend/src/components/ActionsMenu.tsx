import { useEffect, useRef, useState } from "react";

export interface ActionItem {
	label: string;
	onClick: () => void;
	danger?: boolean;
}

// Reusable "Actions ▾" dropdown - any table row anywhere in the app that
// needs more than 2-3 inline buttons should use this instead of piling
// up text links, which is what Inventory's row actions used to do.
export default function ActionsMenu({ actions }: { actions: ActionItem[] }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div ref={ref} style={{ position: "relative", display: "inline-block" }}>
			<button onClick={() => setOpen((o) => !o)} style={triggerStyle}>
				Actions ▾
			</button>
			{open && (
				<div style={menuStyle}>
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
				</div>
			)}
		</div>
	);
}

const triggerStyle: React.CSSProperties = {
	padding: "6px 12px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
};

const menuStyle: React.CSSProperties = {
	position: "absolute",
	right: 0,
	top: "calc(100% + 4px)",
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 8,
	boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
	minWidth: 150,
	zIndex: 20,
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
