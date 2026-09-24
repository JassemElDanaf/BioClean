// One real implementation of the preset-buttons + from/to date-range
// picker used everywhere a report or history list needs one (Dashboard,
// Sales History, Financial Summary, Inventory Audit, Expenses, Income).
// Each of those used to carry its own near-duplicate copy of this same
// UI, each drifting slightly (different padding, some missing the
// active-preset highlight) - this is the one to import instead of
// rewriting it again.

export interface DateRangeValue {
	from_date?: string;
	to_date?: string;
}

export interface DateRangePreset {
	key: string;
	label: string;
	range: () => DateRangeValue;
}

export function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
	return isoDate(new Date());
}

export default function DateRangeFilter({
	presets,
	value,
	onChange,
}: {
	presets: DateRangePreset[];
	value: DateRangeValue;
	onChange: (value: DateRangeValue) => void;
}) {
	// Derived, not stored - comparing the current value against what each
	// preset would itself produce means clicking a preset, hand-editing a
	// date, or switching between presets always highlights correctly (or
	// highlights nothing at all, for a genuinely custom range) with no
	// separate "which one is active" state to keep in sync.
	const activeKey = presets.find((p) => {
		const r = p.range();
		return r.from_date === value.from_date && r.to_date === value.to_date;
	})?.key;

	return (
		<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
			{presets.map((p) => (
				<button key={p.key} onClick={() => onChange(p.range())} style={p.key === activeKey ? presetActiveStyle : presetStyle}>
					{p.label}
				</button>
			))}
			<input
				type="date"
				value={value.from_date ?? ""}
				onChange={(e) => onChange({ ...value, from_date: e.target.value || undefined })}
				style={dateInputStyle}
			/>
			<span style={{ color: "var(--neutral-500)" }}>to</span>
			<input type="date" value={value.to_date ?? ""} onChange={(e) => onChange({ ...value, to_date: e.target.value || undefined })} style={dateInputStyle} />
		</div>
	);
}

const presetStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	cursor: "pointer",
};
const presetActiveStyle: React.CSSProperties = {
	...presetStyle,
	background: "var(--brand)",
	borderColor: "var(--brand)",
	color: "#fff",
};
const dateInputStyle: React.CSSProperties = {
	padding: "7px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
};
