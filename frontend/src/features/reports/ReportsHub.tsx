import { useState } from "react";
import { REPORTS } from "./registry";

export default function ReportsHub() {
	const [activeKey, setActiveKey] = useState(REPORTS[0]?.key);
	const active = REPORTS.find((r) => r.key === activeKey);
	const ActiveComponent = active?.component;

	return (
		<div style={{ display: "flex", gap: 24 }}>
			<div style={{ width: 180, flexShrink: 0 }}>
				{REPORTS.map((report) => (
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
			<div style={{ flex: 1, minWidth: 0 }}>{ActiveComponent ? <ActiveComponent /> : <div>No reports available yet.</div>}</div>
		</div>
	);
}
