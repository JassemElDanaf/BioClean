import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		host: "127.0.0.1",
		port: 3000,
		allowedHosts: ["sp01b01zz7469j.tailb446a6.ts.net"],
		proxy: {
			"/api": "http://127.0.0.1:3001",
		},
	},
});
