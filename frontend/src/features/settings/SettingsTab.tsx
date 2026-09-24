import { useEffect, useState } from "react";
import { getExchangeRate, getExchangeRateHistory, updateExchangeRate, getTaxRate, updateTaxRate, type ExchangeRateHistoryEntry } from "./api";

export default function SettingsTab() {
	return (
		<div>
			<h2 style={{ marginTop: 0 }}>Settings</h2>
			<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
				<ExchangeRateCard />
				<TaxRateCard />
			</div>
		</div>
	);
}

function ExchangeRateCard() {
	const [rate, setRate] = useState<number | null>(null);
	const [input, setInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(false);
	const [history, setHistory] = useState<ExchangeRateHistoryEntry[]>([]);
	const [showHistory, setShowHistory] = useState(false);

	function reloadHistory() {
		getExchangeRateHistory().then(setHistory);
	}

	useEffect(() => {
		getExchangeRate().then((r) => {
			setRate(r.usd_to_lbp_rate);
			setInput(String(r.usd_to_lbp_rate));
		});
		reloadHistory();
	}, []);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			const result = await updateExchangeRate(Number(input));
			setRate(result.usd_to_lbp_rate);
			setSavedMsg(true);
			setTimeout(() => setSavedMsg(false), 2000);
			reloadHistory();
		} finally {
			setSaving(false);
		}
	}

	return (
		<div style={cardStyle}>
			<h3 style={cardTitleStyle}>USD → LBP Exchange Rate</h3>
			<p style={cardDescStyle}>
				Every price in the system is stored in USD. This rate is what every USD amount converts to LBP with,
				everywhere in the app - update it whenever the market rate changes. Past sales and invoices keep
				whichever rate was live when they were created, so changing this never rewrites history.
			</p>
			<form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
				<label style={labelStyle}>
					1 USD =
					<input type="number" step="1" min="1" value={input} onChange={(e) => setInput(e.target.value)} style={inputStyle} />
				</label>
				<span style={{ paddingBottom: 9, color: "var(--neutral-500)", fontSize: 13 }}>LBP</span>
				<button type="submit" disabled={saving} style={buttonStyle}>
					{saving ? "Saving..." : "Save"}
				</button>
			</form>
			{savedMsg && <div style={savedMsgStyle}>Saved.</div>}
			{rate != null && <div style={currentValueStyle}>Current rate: 1 USD = {rate.toLocaleString()} LBP</div>}

			<button type="button" onClick={() => setShowHistory((v) => !v)} style={historyToggleStyle}>
				{showHistory ? "Hide" : "Show"} rate history ({history.length})
			</button>
			{showHistory && (
				<div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", border: "1px solid var(--neutral-200)", borderRadius: 8 }}>
					{history.map((h) => (
						<div key={h.id} style={historyRowStyle}>
							<span>{new Date(h.effective_at).toLocaleString()}</span>
							<span style={{ fontWeight: 600 }}>{h.usd_to_lbp_rate.toLocaleString()} LBP</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function TaxRateCard() {
	const [rate, setRate] = useState<number | null>(null);
	const [input, setInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(false);

	useEffect(() => {
		getTaxRate().then((r) => {
			setRate(r.tax_rate);
			setInput(String(r.tax_rate));
		});
	}, []);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			const result = await updateTaxRate(Number(input));
			setRate(result.tax_rate);
			setSavedMsg(true);
			setTimeout(() => setSavedMsg(false), 2000);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div style={cardStyle}>
			<h3 style={cardTitleStyle}>Sales Tax Rate</h3>
			<p style={cardDescStyle}>
				Applied to every POS sale at checkout, snapshotted onto the receipt so a later rate change never alters a
				past sale's total. Set to 0 to charge no tax.
			</p>
			<form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
				<label style={labelStyle}>
					Tax rate
					<input type="number" step="0.1" min="0" max="100" value={input} onChange={(e) => setInput(e.target.value)} style={inputStyle} />
				</label>
				<span style={{ paddingBottom: 9, color: "var(--neutral-500)", fontSize: 13 }}>%</span>
				<button type="submit" disabled={saving} style={buttonStyle}>
					{saving ? "Saving..." : "Save"}
				</button>
			</form>
			{savedMsg && <div style={savedMsgStyle}>Saved.</div>}
			{rate != null && <div style={currentValueStyle}>Current rate: {rate}%</div>}
		</div>
	);
}

const cardStyle: React.CSSProperties = {
	background: "#fff",
	borderRadius: 12,
	border: "1px solid var(--neutral-200)",
	padding: 20,
	maxWidth: 420,
};
const cardTitleStyle: React.CSSProperties = { marginTop: 0, fontSize: 15 };
const historyToggleStyle: React.CSSProperties = {
	marginTop: 12,
	background: "none",
	border: "none",
	color: "var(--brand)",
	fontSize: 12,
	fontWeight: 600,
	cursor: "pointer",
	padding: 0,
};
const historyRowStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	padding: "6px 10px",
	fontSize: 12,
	borderBottom: "1px solid var(--neutral-100)",
};
const cardDescStyle: React.CSSProperties = { fontSize: 13, color: "var(--neutral-500)", lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 13, color: "var(--neutral-500)", flex: 1 };
const savedMsgStyle: React.CSSProperties = { color: "var(--brand)", fontSize: 13, marginTop: 8 };
const currentValueStyle: React.CSSProperties = { marginTop: 12, fontSize: 13, color: "var(--neutral-500)" };
const inputStyle: React.CSSProperties = {
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};
const buttonStyle: React.CSSProperties = {
	padding: "9px 16px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 600,
	cursor: "pointer",
};
