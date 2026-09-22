const colors = require("tailwindcss/colors");

// Design tokens established here in Phase 3, reused as-is by every later
// phase (Boss Mode, Van module, etc.) - see the plan's Design Language
// section. Brand colors taken from the actual BioClean logo (green
// gradient "BIO" + gray "CLEAN" wordmark + navy tagline).
module.exports = {
	content: [
		"./index.html",
		"./src/**/*.{vue,js,ts,jsx,tsx}",
		"./node_modules/frappe-ui/src/components/**/*.{vue,js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			colors: {
				// Primary brand accent - BioClean Green. Exact end-stops
				// (deep -> light gradient) still to be picked precisely off
				// the vector logo file; this mid-tone is the working value.
				brand: {
					DEFAULT: "#5FAF3C",
					deep: "#2E7D32",
					light: "#9ACD32",
				},
				// Neutral gray, taken directly from the "CLEAN" wordmark -
				// the logo's own neutral, not an arbitrary UI gray.
				neutral: colors.zinc,
				// Secondary accent - navy from the "CHEMICALS, LB" tagline.
				// Used sparingly (links, secondary tags), never competing
				// with brand green for primary attention.
				accent: {
					DEFAULT: "#2B4C8C",
				},
			},
			fontFamily: {
				sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
			},
		},
	},
	plugins: [],
};
