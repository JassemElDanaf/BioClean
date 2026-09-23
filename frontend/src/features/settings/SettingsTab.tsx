import { useEffect, useState } from "react";
import { getExchangeRate, updateExchangeRate } from "./api";

export default function SettingsTab() {
	const [rate, setRate] = useState<number | null>(null);
	const [input, setInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(false);

	useEffect(() => {
		getExchangeRate().then((r) => {
			setRate(r.usd_to_lbp_rate);
			setInput(String(r.usd_to_lbp_rate));
		});
	}, []);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			const result = await updateExchangeRate(Number(input));
			setRate(result.usd_to_lbp_rate);
			setSavedMsg(true);
			setTimeout(() => setSavedMsg(false), 2000);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div>
			<h2 style={{ marginTop: 0 }}>Settings</h2>

			<div style={{ background: "#fff", borderRadius: 8, padding: 20, maxWidth: 420 }}>
				<h3 style={{ marginTop: 0, fontSize: 15 }}>USD → LBP Exchange Rate</h3>
				<p style={{ fontSize: 13, color: "var(--neutral-500)" }}>
					Every price in the system is stored in USD. This rate is what every USD amount converts to LBP with,
					everywhere in the app - update it whenever the market rate changes.
				</p>
				<form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
					<label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--neutral-500)", flex: 1 }}>
						1 USD =
						<input
							type="number"
							step="1"
							min="1"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							style={inputStyle}
						/>
					</label>
					<span style={{ paddingBottom: 8, color: "var(--neutral-500)" }}>LBP</span>
					<button type="submit" disabled={saving} style={buttonStyle}>
						{saving ? "Saving..." : "Save"}
					</button>
				</form>
				{savedMsg && <div style={{ color: "var(--brand)", fontSize: 13, marginTop: 8 }}>Saved.</div>}
				{rate != null && (
					<div style={{ marginTop: 12, fontSize: 13, color: "var(--neutral-500)" }}>
						Current rate: 1 USD = {rate.toLocaleString()} LBP
					</div>
				)}
			</div>
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	padding: "8px 10px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};
const buttonStyle: React.CSSProperties = {
	padding: "9px 16px",
	borderRadius: 6,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 600,
	cursor: "pointer",
};
