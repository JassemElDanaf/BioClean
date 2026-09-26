import { useState } from "react";
import { ApiError } from "../../lib/api";
import { login, type UserOut } from "./api";

// Same brand mark/typography as Sidebar.tsx's logo block (BioClean /
// CHEMICALS, LB, var(--brand), var(--font-sans) via the page-wide default)
// and the same card/input/button styling every other form in the app
// uses (see e.g. Settings tabs) - this is the first thing anyone sees, so
// it should read as the same app, not a bolted-on auth screen.
export default function LoginPage({ onLoggedIn }: { onLoggedIn: (user: UserOut) => void }) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const user = await login(username, password);
			onLoggedIn(user);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Something went wrong - try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--neutral-100, #f5f5f5)" }}>
			<form
				onSubmit={handleSubmit}
				style={{
					width: 340,
					maxWidth: "calc(100vw - 32px)",
					background: "#fff",
					borderRadius: 12,
					border: "1px solid var(--neutral-200)",
					boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
					padding: "32px 28px",
				}}
			>
				<div style={{ marginBottom: 28, textAlign: "center" }}>
					<div style={{ fontSize: 26, fontWeight: 800, color: "var(--brand)", letterSpacing: 0.2, lineHeight: 1 }}>BioClean</div>
					<div style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-500)", letterSpacing: 1.2, marginTop: 4 }}>CHEMICALS, LB</div>
				</div>

				<label style={labelStyle}>
					Username
					<input
						autoFocus
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						style={inputStyle}
						autoComplete="username"
					/>
				</label>

				<label style={{ ...labelStyle, marginTop: 14 }}>
					Password
					<input
						type="password"
						inputMode="numeric"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						style={inputStyle}
						autoComplete="current-password"
					/>
				</label>

				{error && <div style={{ marginTop: 14, fontSize: 13, color: "crimson" }}>{error}</div>}

				<button
					type="submit"
					disabled={submitting || !username || !password}
					style={{
						marginTop: 20,
						width: "100%",
						padding: "10px 0",
						borderRadius: 8,
						border: "none",
						background: "var(--brand)",
						color: "#fff",
						fontSize: 14,
						fontWeight: 700,
						cursor: submitting ? "default" : "pointer",
						opacity: submitting || !username || !password ? 0.7 : 1,
					}}
				>
					{submitting ? "Signing in..." : "Sign in"}
				</button>
			</form>
		</div>
	);
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--neutral-500)" };
const inputStyle: React.CSSProperties = {
	padding: "9px 12px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	fontFamily: "inherit",
	color: "var(--neutral-900)",
};
