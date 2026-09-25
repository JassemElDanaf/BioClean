import { useEffect, useState } from "react";
import {
	BuildingIcon,
	CheckCircleIcon,
	DatabaseIcon,
	InvoiceIcon,
	PrinterIcon,
	ReceiptIcon,
	WalletIcon,
} from "../../components/icons";
import Select from "../../components/Select";
import SidebarToggleButton from "../../components/SidebarToggleButton";
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

type SectionKey = "general" | "currency" | "sales-tax" | "pos-receipts" | "documents" | "system";

const SECTIONS: { key: SectionKey; label: string; icon: typeof WalletIcon }[] = [
	{ key: "general", label: "General", icon: BuildingIcon },
	{ key: "currency", label: "Currency & Pricing", icon: WalletIcon },
	{ key: "sales-tax", label: "Sales & Tax", icon: ReceiptIcon },
	{ key: "pos-receipts", label: "POS & Receipts", icon: PrinterIcon },
	{ key: "documents", label: "Documents", icon: InvoiceIcon },
	{ key: "system", label: "System", icon: DatabaseIcon },
];

export default function SettingsTab() {
	const [active, setActive] = useState<SectionKey>("general");

	return (
		<div>
			<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
				<SidebarToggleButton />
				<h2 style={{ margin: 0 }}>Settings</h2>
			</div>
			<div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
				<div style={{ width: 200, flexShrink: 0 }}>
					{SECTIONS.map((s) => (
						<button key={s.key} onClick={() => setActive(s.key)} style={s.key === active ? navButtonActiveStyle : navButtonStyle}>
							<s.icon size={16} color={s.key === active ? "var(--brand)" : "var(--neutral-500)"} />
							{s.label}
						</button>
					))}
				</div>

				<div style={{ flex: 1, minWidth: 0, display: "grid", gap: 16 }}>
					{active === "general" && (
						<ComingSoonCard
							icon={BuildingIcon}
							title="Company Profile"
							description="Company name, logo, address, phone, email, and default currency. Not configurable yet - this section is reserved for when that's built."
						/>
					)}

					{active === "currency" && <ExchangeRateCard />}

					{active === "sales-tax" && (
						<>
							<TaxRateCard />
							<ComingSoonCard
								icon={ReceiptIcon}
								title="Payment Terms & Numbering"
								description="Default payment terms and custom invoice/quotation number formats. Not configurable yet - documents currently use INV-{id}/QUO-{id}."
							/>
						</>
					)}

					{active === "pos-receipts" && <PrinterCard />}

					{active === "documents" && (
						<InfoCard
							icon={InvoiceIcon}
							title="Invoices, Quotations & Purchase Orders"
							description="Every PDF (invoice, quotation, purchase order, POS receipt) already shares one branded template - your logo, BioClean green, and the same layout everywhere. Per-document customization (custom numbering, terms text, footer notes) isn't configurable yet."
						/>
					)}

					{active === "system" && (
						<InfoCard
							icon={DatabaseIcon}
							title="Document Backups"
							description="Every generated PDF and CSV export automatically saves a copy to this device's Documents folder, organized by type and date - a running backup with zero setup, in addition to what's stored in the database."
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof WalletIcon; title: string; description: string }) {
	return (
		<div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
			<div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--brand-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
				<Icon size={18} color="var(--brand)" />
			</div>
			<div>
				<h3 style={cardTitleStyle}>{title}</h3>
				<p style={cardDescStyle}>{description}</p>
			</div>
		</div>
	);
}

function ComingSoonCard({ icon, title, description }: { icon: typeof WalletIcon; title: string; description: string }) {
	return (
		<div style={{ ...cardStyle, opacity: 0.75 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
				<SectionHeader icon={icon} title={title} description={description} />
				<span style={comingSoonPillStyle}>Coming soon</span>
			</div>
		</div>
	);
}

function InfoCard({ icon, title, description }: { icon: typeof WalletIcon; title: string; description: string }) {
	return (
		<div style={cardStyle}>
			<SectionHeader icon={icon} title={title} description={description} />
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
			<SectionHeader
				icon={WalletIcon}
				title="USD → LBP Exchange Rate"
				description="Converts every USD price to LBP throughout the app. Past sales and invoices keep whichever rate was live when created - changing this never rewrites history."
			/>

			<form onSubmit={handleSave} style={{ marginTop: 16, display: "grid", gap: 12 }}>
				<SettingRow label="1 USD equals" description="Current market rate.">
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<input type="number" step="1" min="1" value={input} onChange={(e) => setInput(e.target.value)} style={inputStyle} />
						<span style={{ color: "var(--neutral-500)", fontSize: 13 }}>LBP</span>
					</div>
				</SettingRow>
				<SettingRow label="Round LBP to nearest" description="Real cash denominations are large - nobody makes change to the lira.">
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<input type="number" step="1" min="1" value={rounding} onChange={(e) => setRounding(e.target.value)} style={inputStyle} />
						<span style={{ color: "var(--neutral-500)", fontSize: 13 }}>LBP</span>
					</div>
				</SettingRow>

				<CardFooter saving={saving} savedMsg={savedMsg} currentValue={rate != null ? `1 USD = ${rate.toLocaleString()} LBP` : undefined} />
			</form>

			<button type="button" onClick={() => setShowHistory((v) => !v)} style={historyToggleStyle}>
				{showHistory ? "Hide" : "Show"} rate history ({history.length})
			</button>
			{showHistory && (
				<div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", border: "1px solid var(--neutral-200)", borderRadius: 8 }}>
					{history.length === 0 && <div style={{ padding: 12, fontSize: 12, color: "var(--neutral-500)" }}>No rate changes recorded yet.</div>}
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
			<SectionHeader
				icon={ReceiptIcon}
				title="Sales Tax Rate"
				description="Applied to every POS sale at checkout, snapshotted onto the receipt so a later change never alters a past sale's total."
			/>
			<form onSubmit={handleSave} style={{ marginTop: 16, display: "grid", gap: 12 }}>
				<SettingRow label="Tax rate" description="Set to 0 to charge no tax.">
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<input type="number" step="0.1" min="0" max="100" value={input} onChange={(e) => setInput(e.target.value)} style={inputStyle} />
						<span style={{ color: "var(--neutral-500)", fontSize: 13 }}>%</span>
					</div>
				</SettingRow>
				<CardFooter saving={saving} savedMsg={savedMsg} currentValue={rate != null ? `Current rate: ${rate}%` : undefined} />
			</form>
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
			<SectionHeader
				icon={PrinterIcon}
				title="Thermal Receipt Printer"
				description="The small till-side printer - separate from the Letter-size PDF receipt, which is for download/email/backup."
			/>
			<form onSubmit={handleSave} style={{ marginTop: 16, display: "grid", gap: 12 }}>
				<SettingRow label="Connection" description="How the printer is reached.">
					<Select
						value={connectionType}
						onChange={setConnectionType}
						options={[
							{ value: "none", label: "Not connected" },
							{ value: "windows", label: "USB (Windows printer)" },
							{ value: "network", label: "Network (Ethernet/WiFi)" },
						]}
					/>
				</SettingRow>

				{connectionType === "windows" && (
					<SettingRow label="Printer name" description="Leave blank to use the system default.">
						<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. POS-80" style={inputStyle} />
					</SettingRow>
				)}
				{connectionType === "network" && (
					<SettingRow label="Printer address" description="IP address and port.">
						<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="192.168.1.50:9100" style={inputStyle} />
					</SettingRow>
				)}

				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--neutral-100)", paddingTop: 12, marginTop: 4 }}>
					<div style={{ display: "flex", gap: 8 }}>
						<button type="submit" disabled={saving} style={buttonStyle}>
							{saving ? "Saving..." : "Save"}
						</button>
						<button type="button" onClick={handleTestPrint} disabled={testing || connectionType === "none"} style={testButtonStyle}>
							{testing ? "Printing..." : "Send Test Print"}
						</button>
					</div>
					{savedMsg && <FeedbackMsg ok text="Saved" />}
				</div>
				{testResult && <FeedbackMsg ok={testResult.ok} text={testResult.message} />}
			</form>
		</div>
	);
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
			<div style={{ minWidth: 160 }}>
				<div style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-900)" }}>{label}</div>
				{description && <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 1 }}>{description}</div>}
			</div>
			<div style={{ flexShrink: 0 }}>{children}</div>
		</div>
	);
}

function CardFooter({ saving, savedMsg, currentValue }: { saving: boolean; savedMsg: boolean; currentValue?: string }) {
	return (
		<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--neutral-100)", paddingTop: 12, marginTop: 4, flexWrap: "wrap", gap: 8 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<button type="submit" disabled={saving} style={buttonStyle}>
					{saving ? "Saving..." : "Save"}
				</button>
				{savedMsg && <FeedbackMsg ok text="Saved" />}
			</div>
			{currentValue && <div style={{ fontSize: 12, color: "var(--neutral-500)" }}>{currentValue}</div>}
		</div>
	);
}

function FeedbackMsg({ ok, text }: { ok: boolean; text: string }) {
	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: ok ? "var(--brand)" : "crimson" }}>
			{ok && <CheckCircleIcon size={14} color="var(--brand)" />}
			{text}
		</span>
	);
}

const navButtonStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	width: "100%",
	textAlign: "left",
	padding: "10px 12px",
	marginBottom: 2,
	borderRadius: 8,
	border: "none",
	background: "transparent",
	cursor: "pointer",
	fontSize: 14,
	fontWeight: 600,
	color: "var(--neutral-900)",
	fontFamily: "inherit",
};
const navButtonActiveStyle: React.CSSProperties = {
	...navButtonStyle,
	background: "var(--brand-pale)",
	color: "var(--brand)",
};
const cardStyle: React.CSSProperties = {
	background: "#fff",
	borderRadius: 12,
	border: "1px solid var(--neutral-200)",
	padding: 20,
};
const cardTitleStyle: React.CSSProperties = { margin: 0, fontSize: 15 };
const cardDescStyle: React.CSSProperties = { fontSize: 13, color: "var(--neutral-500)", lineHeight: 1.5, margin: "4px 0 0" };
const historyToggleStyle: React.CSSProperties = {
	marginTop: 14,
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
const comingSoonPillStyle: React.CSSProperties = {
	fontSize: 11,
	fontWeight: 700,
	padding: "3px 8px",
	borderRadius: 999,
	background: "var(--neutral-100)",
	color: "var(--neutral-500)",
	whiteSpace: "nowrap",
};
const inputStyle: React.CSSProperties = {
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
	width: 160,
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
