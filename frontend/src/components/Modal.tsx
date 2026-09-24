import type { ReactNode } from "react";

export default function Modal({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	if (!open) return null;
	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.4)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 50,
			}}
			onClick={onClose}
		>
			<div
				style={{
					background: "#fff",
					borderRadius: 12,
					padding: 24,
					width: "min(480px, 90vw)",
					maxHeight: "85vh",
					overflowY: "auto",
					overflowX: "hidden",
					boxSizing: "border-box",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
					<h3 style={{ margin: 0 }}>{title}</h3>
					<button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>
						✕
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
