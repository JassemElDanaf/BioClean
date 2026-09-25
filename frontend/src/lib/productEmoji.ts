// Cosmetic only (matches the reference design's per-product icon, used
// wherever a product tile has no real photo) - first keyword found in the
// item name wins, falls back to a generic bottle. Shared between POS and
// the Quotation/Invoicing/Purchases product grids so they all pick the
// same icon for the same item.
const EMOJI_RULES: [RegExp, string][] = [
	[/dish/i, "🧽"],
	[/laundry|fabric|softener/i, "🧺"],
	[/glass/i, "🪟"],
	[/floor/i, "🧹"],
	[/bleach|descaler|acid/i, "🧪"],
	[/paper|tissue/i, "🧻"],
	[/apron|glove|disposable/i, "🧤"],
	[/toilet|bathroom/i, "🚽"],
	[/antiseptic|dettol|sanitiz/i, "🧴"],
];

export function pickProductEmoji(name: string): string {
	for (const [pattern, emoji] of EMOJI_RULES) {
		if (pattern.test(name)) return emoji;
	}
	return "🧴";
}
