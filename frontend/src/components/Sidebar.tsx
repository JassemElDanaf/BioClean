import { NavLink } from "react-router-dom";
import { useEffect, useRef, useState, type ComponentType } from "react";

export interface NavTab {
	path: string;
	label: string;
	icon: ComponentType<{ size?: number; color?: string }>;
}

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
// Dragged narrower than this and it snaps shut instead of shrinking
// further - same "drag past the resistance point and it collapses"
// behavior as VS Code's own sidebar splitter.
const COLLAPSE_THRESHOLD = 120;

export default function Sidebar({ tabs, settingsTab }: { tabs: NavTab[]; settingsTab: NavTab }) {
	const [width, setWidth] = useState(() => Number(localStorage.getItem("bioclean-sidebar-width")) || DEFAULT_WIDTH);
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem("bioclean-sidebar-collapsed") === "true");
	const [menuOpen, setMenuOpen] = useState(false);
	const draggingRef = useRef(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [menuOpen]);

	useEffect(() => {
		localStorage.setItem("bioclean-sidebar-width", String(width));
	}, [width]);

	useEffect(() => {
		localStorage.setItem("bioclean-sidebar-collapsed", String(collapsed));
	}, [collapsed]);

	function handleDragStart(e: React.MouseEvent) {
		e.preventDefault();
		draggingRef.current = true;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		function handleMouseMove(ev: MouseEvent) {
			if (!draggingRef.current) return;
			// The sidebar always starts at x=0, so the pointer's x position
			// while dragging its right edge IS the target width directly.
			if (ev.clientX < COLLAPSE_THRESHOLD) {
				setCollapsed(true);
			} else {
				setCollapsed(false);
				setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX)));
			}
		}
		function handleMouseUp() {
			draggingRef.current = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		}
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	}

	if (collapsed) {
		return (
			<button
				onClick={() => setCollapsed(false)}
				title="Show sidebar"
				style={{
					width: 18,
					flexShrink: 0,
					height: "100vh",
					background: "#fff",
					border: "none",
					borderRight: "1px solid var(--neutral-200)",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 0,
				}}
			>
				<span style={{ color: "var(--neutral-300)", fontSize: 11 }}>▶</span>
			</button>
		);
	}

	return (
		<aside
			style={{
				width,
				flexShrink: 0,
				background: "#fff",
				borderRight: "1px solid var(--neutral-200)",
				display: "flex",
				flexDirection: "column",
				height: "100vh",
				position: "relative",
			}}
		>
			<div style={{ padding: "20px 20px 16px" }}>
				<div style={{ fontSize: 22, fontWeight: 800, color: "var(--brand)", letterSpacing: 0.2, lineHeight: 1 }}>BioClean</div>
				<div style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-500)", letterSpacing: 1.2, marginTop: 2 }}>CHEMICALS, LB</div>
			</div>

			<nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 12px" }}>
				{tabs.map((tab) => (
					<NavLink
						key={tab.path}
						to={`/${tab.path}`}
						style={({ isActive }) => ({
							display: "flex",
							alignItems: "center",
							gap: 10,
							padding: "10px 12px",
							marginBottom: 2,
							borderRadius: 8,
							textDecoration: "none",
							fontSize: 14,
							fontWeight: 600,
							color: isActive ? "var(--brand)" : "var(--neutral-900)",
							background: isActive ? "var(--brand-pale)" : "transparent",
							whiteSpace: "nowrap",
						})}
					>
						{({ isActive }) => (
							<>
								<tab.icon size={18} color={isActive ? "var(--brand)" : "var(--neutral-500)"} />
								{tab.label}
							</>
						)}
					</NavLink>
				))}
			</nav>

			{/* Single-operator system (confirmed - Admin only, see backend
			    settings.current_user) - shown here as a fixed identity rather
			    than a real logged-in-user switcher, since there isn't one.
			    Doubles as the way to reach Settings, which deliberately isn't
			    in the main tab list above - click to open the flyout. */}
			<div ref={menuRef} style={{ position: "relative", borderTop: "1px solid var(--neutral-200)" }}>
				{menuOpen && (
					<div style={flyoutStyle}>
						<NavLink to={`/${settingsTab.path}`} onClick={() => setMenuOpen(false)} style={flyoutItemStyle}>
							<settingsTab.icon size={16} color="var(--neutral-500)" />
							{settingsTab.label}
						</NavLink>
					</div>
				)}
				<button onClick={() => setMenuOpen((v) => !v)} style={adminButtonStyle}>
					<div
						style={{
							width: 34,
							height: 34,
							borderRadius: "50%",
							background: "var(--brand-pale)",
							color: "var(--brand)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontWeight: 700,
							fontSize: 14,
							flexShrink: 0,
						}}
					>
						A
					</div>
					<div style={{ minWidth: 0, textAlign: "left" }}>
						<div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Admin</div>
						<div style={{ fontSize: 12, color: "var(--neutral-500)" }}>Administrator</div>
					</div>
				</button>
			</div>

			{/* Drag handle - straddles the border (-3..+3px) so it's easy to
			    grab without needing pixel-perfect aim on the 1px border itself. */}
			<div
				onMouseDown={handleDragStart}
				style={{
					position: "absolute",
					top: 0,
					right: -3,
					width: 6,
					height: "100%",
					cursor: "col-resize",
					zIndex: 10,
				}}
			/>
		</aside>
	);
}

const adminButtonStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	width: "100%",
	padding: "16px 20px",
	background: "none",
	border: "none",
	cursor: "pointer",
	font: "inherit",
	color: "inherit",
};
const flyoutStyle: React.CSSProperties = {
	position: "absolute",
	bottom: "100%",
	left: 12,
	right: 12,
	marginBottom: 6,
	background: "#fff",
	border: "1px solid var(--neutral-200)",
	borderRadius: 8,
	boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
	padding: 4,
};
const flyoutItemStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	padding: "10px 12px",
	borderRadius: 6,
	textDecoration: "none",
	fontSize: 14,
	fontWeight: 600,
	color: "var(--neutral-900)",
};
