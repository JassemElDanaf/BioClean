import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDownIcon } from "./icons";
import { useSidebar } from "./SidebarContext";

export interface NavTab {
	path: string;
	label: string;
	icon: ComponentType<{ size?: number; color?: string }>;
}

// A collapsible section (e.g. "Sales" grouping Quotations/Invoicing/Sales
// History) - visually one sidebar row that expands to reveal its own
// leaf tabs, instead of every module getting its own top-level slot.
export interface NavGroup {
	group: true;
	label: string;
	icon: ComponentType<{ size?: number; color?: string }>;
	children: NavTab[];
}

export type NavItem = NavTab | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
	return "group" in item && item.group === true;
}

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
// Dragged narrower than this and it snaps shut instead of shrinking
// further - same "drag past the resistance point and it collapses"
// behavior as VS Code's own sidebar splitter.
const COLLAPSE_THRESHOLD = 120;

export default function Sidebar({ tabs, flyoutTabs }: { tabs: NavItem[]; flyoutTabs: NavTab[] }) {
	const { collapsed, setCollapsed } = useSidebar();
	const [width, setWidth] = useState(() => Number(localStorage.getItem("bioclean-sidebar-width")) || DEFAULT_WIDTH);
	const [menuOpen, setMenuOpen] = useState(false);
	const draggingRef = useRef(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const asideRef = useRef<HTMLElement>(null);
	const location = useLocation();

	// Groups start collapsed, except whichever one contains the page you're
	// already on (so landing on /invoicing, say, doesn't hide the very
	// group that shows where you are). Independently toggleable - opening
	// one has no effect on any other, confirmed over the single-open
	// accordion this briefly was: several groups can stay open side by side.
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
		const initial: Record<string, boolean> = {};
		for (const item of tabs) {
			if (isGroup(item) && item.children.some((child) => location.pathname === `/${child.path}`)) initial[item.label] = true;
		}
		return initial;
	});

	function toggleGroup(label: string) {
		setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
	}

	useEffect(() => {
		if (!menuOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [menuOpen]);

	// Clicking anywhere outside the open panel (the main content area, most
	// often) tucks it away, the same way a mobile nav drawer would - keeps
	// it from just sitting open over the page once you've clicked past it.
	// Every page's own inline toggle button (see SidebarToggleButton) is
	// excluded via its shared class, not a single ref, since there's one
	// per page rather than one global instance.
	useEffect(() => {
		if (collapsed) return;
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (asideRef.current?.contains(target)) return;
			if (target.closest?.(".sidebar-toggle-btn")) return;
			setCollapsed(true);
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [collapsed, setCollapsed]);

	useEffect(() => {
		localStorage.setItem("bioclean-sidebar-width", String(width));
	}, [width]);

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

	return (
		<>
			{/* Mobile only (see index.css) - dims the page behind the drawer and
			    gives a large, obvious tap target to dismiss it, on top of the
			    existing click-outside handler above. */}
			{!collapsed && <div className="sidebar-backdrop" onClick={() => setCollapsed(true)} />}
			<aside
				ref={asideRef}
				className="sidebar-aside"
				style={{
					width: collapsed ? 0 : width,
					flexShrink: 0,
					overflow: "hidden",
					transition: "width 220ms ease",
					background: "#fff",
					borderRight: collapsed ? "none" : "1px solid var(--neutral-200)",
					height: "100vh",
					position: "relative",
				}}
			>
				{/* Fixed to the expanded width regardless of the animating
				    parent, so the panel slides shut instead of its contents
				    reflowing/wrapping mid-transition. */}
				<div style={{ width, height: "100%", display: "flex", flexDirection: "column" }}>
			<Link to="/dashboard" onClick={() => setCollapsed(true)} style={{ display: "block", padding: "20px 20px 16px", textDecoration: "none" }}>
				<div style={{ fontSize: 22, fontWeight: 800, color: "var(--brand)", letterSpacing: 0.2, lineHeight: 1 }}>BioClean</div>
				<div style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-500)", letterSpacing: 1.2, marginTop: 2 }}>CHEMICALS, LB</div>
			</Link>

			<nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 12px" }}>
				{tabs.map((item) => {
					if (isGroup(item)) {
						const expanded = !!expandedGroups[item.label];
						const groupActive = item.children.some((child) => location.pathname === `/${child.path}`);
						return (
							<div key={item.label}>
								<button
									onClick={() => toggleGroup(item.label)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										width: "100%",
										padding: "10px 12px",
										marginBottom: 2,
										borderRadius: 8,
										border: "none",
										background: groupActive ? "var(--brand-pale)" : "transparent",
										color: groupActive ? "var(--brand)" : "var(--neutral-900)",
										fontSize: 14,
										fontWeight: 600,
										fontFamily: "inherit",
										cursor: "pointer",
										whiteSpace: "nowrap",
									}}
								>
									<item.icon size={18} color={groupActive ? "var(--brand)" : "var(--neutral-500)"} />
									<span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
									<span style={{ display: "flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 120ms" }}>
										<ChevronDownIcon size={14} color="var(--neutral-500)" />
									</span>
								</button>
								{expanded && (
									<div style={{ marginBottom: 2 }}>
										{item.children.map((child) => (
											<NavLink
												key={child.path}
												to={`/${child.path}`}
												onClick={() => setCollapsed(true)}
												style={({ isActive }) => ({
													display: "flex",
													alignItems: "center",
													gap: 10,
													padding: "9px 12px 9px 34px",
													marginBottom: 2,
													borderRadius: 8,
													textDecoration: "none",
													fontSize: 13,
													fontWeight: 600,
													color: isActive ? "var(--brand)" : "var(--neutral-500)",
													background: isActive ? "var(--brand-pale)" : "transparent",
													whiteSpace: "nowrap",
												})}
											>
												{child.label}
											</NavLink>
										))}
									</div>
								)}
							</div>
						);
					}
					return (
						<NavLink
							key={item.path}
							to={`/${item.path}`}
							onClick={() => setCollapsed(true)}
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
									<item.icon size={18} color={isActive ? "var(--brand)" : "var(--neutral-500)"} />
									{item.label}
								</>
							)}
						</NavLink>
					);
				})}
			</nav>

			{/* Single-operator system (confirmed - Admin only, see backend
			    settings.current_user) - shown here as a fixed identity rather
			    than a real logged-in-user switcher, since there isn't one.
			    Doubles as the way to reach Reports/Settings, which deliberately
			    aren't in the main tab list above - click to open the flyout. */}
			<div ref={menuRef} style={{ position: "relative", borderTop: "1px solid var(--neutral-200)" }}>
				{menuOpen && (
					<div style={flyoutStyle}>
						{flyoutTabs.map((tab) => (
							<NavLink
								key={tab.path}
								to={`/${tab.path}`}
								onClick={() => {
									setMenuOpen(false);
									setCollapsed(true);
								}}
								style={flyoutItemStyle}
							>
								<tab.icon size={16} color="var(--neutral-500)" />
								{tab.label}
							</NavLink>
						))}
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
				</div>
			</aside>
		</>
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
