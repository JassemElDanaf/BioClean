import { MenuIcon } from "./icons";
import { useSidebar } from "./SidebarContext";

// The sidebar collapse/expand toggle, rendered inline immediately before a
// page's own <h2> heading rather than floating over the page - every tab
// puts one of these at the start of its title row so it reads as part of
// the title, not a separate header. The "sidebar-toggle-btn" class lets
// Sidebar's click-outside-collapses handler recognize and skip clicks on
// any of these (there's one per page, not one shared instance).
export default function SidebarToggleButton() {
	const { collapsed, toggle } = useSidebar();
	return (
		<button
			className="sidebar-toggle-btn"
			type="button"
			onClick={toggle}
			title={collapsed ? "Show sidebar" : "Hide sidebar"}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 30,
				height: 30,
				borderRadius: 8,
				border: "1px solid var(--neutral-200)",
				background: "#fff",
				cursor: "pointer",
				padding: 0,
				flexShrink: 0,
			}}
		>
			<MenuIcon size={18} color="var(--brand)" />
		</button>
	);
}
