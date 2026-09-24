import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api";
import {
	getExchangeRate,
	getExchangeRateHistory,
	updateExchangeRate,
	getTaxRate,
	updateTaxRate,
	getPrinterSettings,
	updatePrinterSettings,
	testPrinter,
	type ExchangeRateHistoryEntry,
	type PrinterConnectionType,
} from "./api";

export default function SettingsTab() {
	return (
		<div>
			<h2 style={{ marginTop: 0 }}>Settings</h2>
			<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
				<ExchangeRateCard />
				<TaxRateCard />
				<PrinterCard />
			</div>
		</div>
	);
}

function ExchangeRateCard() {
	const [rate, setRate] = useState<number | null>(null);
	const [input, setInput] = useState("");
	const [rounding, setRounding] = useState("1000");
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
			setRounding(String(r.lbp_rounding));
		});
		reloadHistory();
	}, []);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			const result = await updateExchangeRate(Number(input), Number(rounding));
			setRate(result.usd_to_lbp_rate);
			setRounding(String(result.lbp_rounding));
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
			<form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
				<div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
					<label style={labelStyle}>
						1 USD =
						<input type="number" step="1" min="1" value={input} onChange={(e) => setInput(e.target.value)} style={inputStyle} />
					</label>
					<span style={{ paddingBottom: 9, color: "var(--neutral-500)", fontSize: 13 }}>LBP</span>
				</div>
				<label style={labelStyle}>
					Round LBP amounts to the nearest
					<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
						<input type="number" step="1" min="1" value={rounding} onChange={(e) => setRounding(e.target.value)} style={inputStyle} />
						<span style={{ color: "var(--neutral-500)", fontSize: 13 }}>LBP</span>
					</div>
				</label>
				<p style={{ ...cardDescStyle, margin: 0, fontSize: 12 }}>
					Real LBP cash denominations are large - nobody can make change to the nearest lira. Every LBP figure
					shown anywhere in the app (Inventory, receipts) rounds to this increment.
				</p>
				<button type="submit" disabled={saving} style={{ ...buttonStyle, justifySelf: "start" }}>
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

function PrinterCard() {
	const [connectionType, setConnectionType] = useState<PrinterConnectionType>("none");
	const [target, setTarget] = useState("");
	const [saving, setSaving] = useState(false);
	const [savedMsg, setSavedMsg] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

	useEffect(() => {
		getPrinterSettings().then((s) => {
			setConnectionType(s.printer_connection_type);
			setTarget(s.printer_target ?? "");
		});
	}, []);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setTestResult(null);
		try {
			await updatePrinterSettings({ printer_connection_type: connectionType, printer_target: target || null });
			setSavedMsg(true);
			setTimeout(() => setSavedMsg(false), 2000);
		} finally {
			setSaving(false);
		}
	}

	async function handleTestPrint() {
		setTesting(true);
		setTestResult(null);
		try {
			await testPrinter();
			setTestResult({ ok: true, message: "Test receipt sent - check the printer." });
		} catch (err) {
			setTestResult({ ok: false, message: err instanceof ApiError ? err.message : "Couldn't reach the printer." });
		} finally {
			setTesting(false);
		}
	}

	return (
		<div style={cardStyle}>
			<h3 style={cardTitleStyle}>Receipt Printer</h3>
			<p style={cardDescStyle}>
				The small thermal printer at the register - separate from the Letter-size PDF receipt (that one's for
				download/email/backup). Save your connection here, then send a test print to confirm it actually works.
			</p>
			<form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
				<label style={labelStyle}>
					Connection
					<select value={connectionType} onChange={(e) => setConnectionType(e.target.value as PrinterConnectionType)} style={inputStyle}>
						<option value="none">Not connected</option>
						<option value="windows">USB (installed as a Windows printer)</option>
						<option value="network">Network (Ethernet/WiFi, IP address)</option>
					</select>
				</label>

				{connectionType === "windows" && (
					<label style={labelStyle}>
						Windows printer name (leave blank to use the system default)
						<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. POS-80" style={inputStyle} />
					</label>
				)}
				{connectionType === "network" && (
					<label style={labelStyle}>
						Printer address
						<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="192.168.1.50:9100" style={inputStyle} />
					</label>
				)}

				<div style={{ display: "flex", gap: 8 }}>
					<button type="submit" disabled={saving} style={buttonStyle}>
						{saving ? "Saving..." : "Save"}
					</button>
					<button type="button" onClick={handleTestPrint} disabled={testing || connectionType === "none"} style={testButtonStyle}>
						{testing ? "Printing..." : "Send Test Print"}
					</button>
				</div>
			</form>
			{savedMsg && <div style={savedMsgStyle}>Saved.</div>}
			{testResult && <div style={{ ...savedMsgStyle, color: testResult.ok ? "var(--brand)" : "crimson" }}>{testResult.message}</div>}
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
const testButtonStyle: React.CSSProperties = {
	padding: "9px 16px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	color: "var(--neutral-900)",
	fontWeight: 600,
	cursor: "pointer",
};
