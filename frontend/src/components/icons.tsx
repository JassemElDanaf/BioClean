// Small inline-SVG line icons, sized/stroked to match each other - kept
// here instead of pulling in an icon library for a handful of glyphs.
// Every icon takes the same {size, color} props so callers don't need to
// think about viewBox/stroke-width per icon.

import type { ReactNode } from "react";

type IconProps = { size?: number; color?: string };

function Svg({ size = 18, color = "currentColor", children }: IconProps & { children: ReactNode }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
			{children}
		</svg>
	);
}

export function DashboardIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="3" y="3" width="7" height="9" rx="1.5" />
			<rect x="14" y="3" width="7" height="5" rx="1.5" />
			<rect x="14" y="12" width="7" height="9" rx="1.5" />
			<rect x="3" y="16" width="7" height="5" rx="1.5" />
		</Svg>
	);
}

export function POSIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="9" cy="20" r="1.4" fill={props.color ?? "currentColor"} stroke="none" />
			<circle cx="18" cy="20" r="1.4" fill={props.color ?? "currentColor"} stroke="none" />
			<path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6.2" />
		</Svg>
	);
}

export function ReceiptIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" />
			<path d="M9 8h6M9 12h6M9 16h3" />
		</Svg>
	);
}

export function InvoiceIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
			<path d="M15 3v4h4" />
			<path d="M9 12h6M9 16h6M9 8h2" />
		</Svg>
	);
}

export function QuoteIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
			<path d="M15 3v4h4" />
			<path d="M9 13c0-1.1.9-2 2-2M9 17c0-1.1.9-2 2-2" />
		</Svg>
	);
}

export function InventoryIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 7l9-4 9 4-9 4-9-4Z" />
			<path d="M3 7v10l9 4 9-4V7" />
			<path d="M12 11v10" />
		</Svg>
	);
}

export function CustomersIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="9" cy="8" r="3.2" />
			<path d="M2.5 20c.7-3.4 3.3-5.5 6.5-5.5s5.8 2.1 6.5 5.5" />
			<circle cx="17.5" cy="8.5" r="2.6" />
			<path d="M15.5 3.5c1.7.3 3 1.8 3 3.6" />
			<path d="M16 14.7c2.4.5 4.3 2.3 4.9 5.3" />
		</Svg>
	);
}

export function PurchasesIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Z" />
			<path d="M8 7V5.5a4 4 0 0 1 8 0V7" />
		</Svg>
	);
}

export function ExpensesIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 17 9 11l4 4 8-8" />
			<path d="M15 6h6v6" transform="translate(0 1)" />
		</Svg>
	);
}

export function IncomeIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 13 9 19l4-4 8-8" />
			<path d="M15 7h6v6" />
		</Svg>
	);
}

export function ReportsIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M4 20V10M11 20V4M18 20v-7" />
			<path d="M2 20h20" />
		</Svg>
	);
}

export function SettingsIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="12" cy="12" r="3.2" />
			<path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.7a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 3.3 12.46H3.2a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.3A1.7 1.7 0 0 0 10.46 3.3V3.2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08c.24.7.82 1.2 1.56 1.36h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" />
		</Svg>
	);
}

export function SearchIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="11" cy="11" r="7" />
			<path d="m20 20-3.2-3.2" />
		</Svg>
	);
}

export function CartIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="9" cy="20" r="1.4" fill={props.color ?? "currentColor"} stroke="none" />
			<circle cx="18" cy="20" r="1.4" fill={props.color ?? "currentColor"} stroke="none" />
			<path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6.2" />
		</Svg>
	);
}

export function UserIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="12" cy="8" r="3.6" />
			<path d="M4 20c.9-4 3.9-6.4 8-6.4S19.1 16 20 20" />
		</Svg>
	);
}

export function CashIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="2.5" y="6" width="19" height="12" rx="1.5" />
			<circle cx="12" cy="12" r="2.6" />
			<path d="M6 6v0M18 18v0" />
		</Svg>
	);
}

export function CardIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="2.5" y="5" width="19" height="14" rx="2" />
			<path d="M2.5 10h19" />
		</Svg>
	);
}

export function OtherPaymentIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 8v4l2.6 2.6" />
		</Svg>
	);
}

export function TrashIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M4 7h16" />
			<path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
			<path d="M6 7l1 13.5A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
		</Svg>
	);
}

export function MinusIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M5 12h14" />
		</Svg>
	);
}

export function PlusIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 5v14M5 12h14" />
		</Svg>
	);
}

export function TrendUpIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 17l6-6 4 4 8-8" />
			<path d="M15 7h6v6" />
		</Svg>
	);
}

export function TrendDownIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 7l6 6 4-4 8 8" />
			<path d="M15 17h6v-6" />
		</Svg>
	);
}

export function AlertIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 3 2 20h20L12 3Z" />
			<path d="M12 10v4" />
			<circle cx="12" cy="17.2" r="0.15" fill={props.color ?? "currentColor"} stroke="none" />
		</Svg>
	);
}

export function WalletIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V8H5.5A2.5 2.5 0 0 1 3 5.5" />
			<rect x="3" y="8" width="18" height="12" rx="2" />
			<circle cx="16" cy="14" r="1.4" />
		</Svg>
	);
}

export function BoxStackIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="4" y="4" width="7" height="7" rx="1.2" />
			<rect x="13" y="4" width="7" height="7" rx="1.2" />
			<rect x="4" y="13" width="7" height="7" rx="1.2" />
			<rect x="13" y="13" width="7" height="7" rx="1.2" />
		</Svg>
	);
}

export function ChevronRightIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M9 5l7 7-7 7" />
		</Svg>
	);
}

export function BuildingIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="4" y="3" width="12" height="18" rx="1" />
			<path d="M8 7h1M8 11h1M8 15h1M12 7h1M12 11h1M12 15h1" />
			<path d="M16 10h3a1 1 0 0 1 1 1v10h-4" />
			<path d="M9 21v-3h2v3" />
		</Svg>
	);
}

export function DatabaseIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
			<path d="M4.5 5.5V18c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5" />
			<path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
		</Svg>
	);
}

export function PrinterIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M6 9V3h12v6" />
			<rect x="4" y="9" width="16" height="8" rx="1.5" />
			<path d="M6 14h12v7H6Z" />
		</Svg>
	);
}

export function CheckCircleIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="12" cy="12" r="9" />
			<path d="m8.5 12.3 2.4 2.4 4.6-5.2" />
		</Svg>
	);
}

export function CalendarIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="3.5" y="5" width="17" height="16" rx="2" />
			<path d="M3.5 9.5h17M8 3v4M16 3v4" />
		</Svg>
	);
}

export function ChevronDownIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M6 9l6 6 6-6" />
		</Svg>
	);
}

export function MenuIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
		</Svg>
	);
}
