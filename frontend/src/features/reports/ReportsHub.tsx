import { useState } from "react";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { REPORTS } from "./registry";

const GROUPS = ["Reports", "Finance"] as const;

export default function ReportsHub() {
	const [activeKey, setActiveKey] = useState(REPORTS[0]?.key);
	const active = REPORTS.find((r) => r.key === activeKey);
	const ActiveComponent = active?.component;

	return (
		<div>
			<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
				<SidebarToggleButton />
				<h2 style={{ margin: 0 }}>Reports</h2>
			</div>
			<div style={{ display: "flex", gap: 24 }}>
			<div style={{ width: 180, flexShrink: 0 }}>
				{GROUPS.map((group) => (
					<div key={group} style={{ marginBottom: 16 }}>
						<div style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 12px", marginBottom: 6 }}>
							{group}
						</div>
						{REPORTS.filter((r) => r.group === group).map((report) => (
							<button
								key={report.key}
								onClick={() => setActiveKey(report.key)}
								style={{
									display: "block",
									width: "100%",
									textAlign: "left",
									padding: "10px 12px",
									marginBottom: 4,
									borderRadius: 6,
									border: "none",
									cursor: "pointer",
									fontSize: 14,
									fontWeight: 600,
									background: report.key === activeKey ? "var(--brand)" : "transparent",
									color: report.key === activeKey ? "#fff" : "var(--neutral-900)",
								}}
							>
								{report.label}
							</button>
						))}
					</div>
				))}
			</div>
				<div style={{ flex: 1, minWidth: 0 }}>{ActiveComponent ? <ActiveComponent /> : <div>No reports available yet.</div>}</div>
			</div>
		</div>
	);
}
