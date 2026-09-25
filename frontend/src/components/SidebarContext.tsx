import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
	collapsed: boolean;
	setCollapsed: (collapsed: boolean) => void;
	toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

// Lifted out of Sidebar.tsx itself so the toggle button can be rendered
// inline in each page's own heading row (see SidebarToggleButton) instead
// of the sidebar owning a single, separately-positioned button.
export function SidebarProvider({ children }: { children: ReactNode }) {
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem("bioclean-sidebar-collapsed") === "true");

	useEffect(() => {
		localStorage.setItem("bioclean-sidebar-collapsed", String(collapsed));
	}, [collapsed]);

	return <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle: () => setCollapsed((v) => !v) }}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
	const ctx = useContext(SidebarContext);
	if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
	return ctx;
}
