import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import path from "path";

// Matches the pattern official Frappe apps (Helpdesk/CRM/Gameplan) use:
// build output lands in the bioclean app's own `public` folder, served by
// Frappe itself (confirmed decision - custom frontend, served by the same
// server as the ERP backend, no separate hosting).
export default defineConfig({
	// Frappe serves this app's public assets at /assets/bioclean/... - the
	// built index.html needs to reference its JS/CSS from there, not from
	// site root, since Frappe's own assets already live at site root.
	base: "/assets/bioclean/frontend/",
	plugins: [vue(), Icons({ compiler: "vue3", autoInstall: true })],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	server: {
		port: 8080,
		proxy: {
			"^/(app|api|assets|files|private)": {
				target: "http://localhost:8000",
				ws: true,
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "../bioclean/public/frontend",
		emptyOutDir: true,
		target: "es2015",
	},
});
