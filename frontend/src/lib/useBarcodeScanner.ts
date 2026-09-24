import { useEffect, useRef } from "react";

/**
 * USB barcode scanners plug in as "keyboard emulation" devices - there's no
 * special browser API for them. A scan just types the barcode's characters
 * into whatever has focus, at machine speed, then sends Enter. The only way
 * to tell that apart from a person typing is timing: consecutive keystrokes
 * this close together are never a human, no matter what's focused.
 *
 * MAX_GAP_MS is deliberately generous (not "as fast as possible") - cheap
 * scanners aren't blazing fast, and a false negative (a real scan not
 * recognized) is worse here than a false positive, which MIN_LENGTH already
 * guards against separately.
 */
const MAX_GAP_MS = 80;
const MIN_LENGTH = 4;

/**
 * Fires onScan(barcode) whenever a fast keystroke burst ending in Enter is
 * detected anywhere on the page - works regardless of what's focused (the
 * search box, a quantity input, nothing at all), which is what makes this
 * usable in a real till: the cashier never has to click into a specific
 * field before scanning.
 *
 * If the burst landed in a live text input/textarea (it will, unless
 * nothing was focused), the characters it just typed are stripped back out
 * before onScan fires - otherwise every scan would also dump the barcode
 * into the Search box or whatever else happened to have focus.
 */
export function useBarcodeScanner(onScan: (barcode: string) => void, enabled: boolean = true) {
	const bufferRef = useRef("");
	const lastKeyTimeRef = useRef(0);
	const onScanRef = useRef(onScan);
	onScanRef.current = onScan;

	useEffect(() => {
		if (!enabled) return;

		function handleKeyDown(e: KeyboardEvent) {
			const now = Date.now();
			const elapsed = now - lastKeyTimeRef.current;
			lastKeyTimeRef.current = now;

			if (e.key === "Enter") {
				const candidate = bufferRef.current;
				bufferRef.current = "";
				if (candidate.length < MIN_LENGTH) return;

				// A burst this fast ending in Enter is a scan, not a person
				// pressing Enter - never let it submit a form or add a newline.
				e.preventDefault();
				e.stopPropagation();

				const target = e.target as HTMLElement | null;
				if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
					if (target.value.endsWith(candidate)) {
						target.value = target.value.slice(0, -candidate.length);
						// React owns this input's state via onChange - a raw DOM
						// value assignment above is invisible to it without this.
						target.dispatchEvent(new Event("input", { bubbles: true }));
					}
				}

				onScanRef.current(candidate);
				return;
			}

			if (elapsed > MAX_GAP_MS) {
				bufferRef.current = "";
			}
			// Barcodes are plain single characters (digits, and letters for our
			// own generated SKUs) - ignore modifier/navigation keys (Shift,
			// Tab, arrows, ...), whose e.key is more than one character long.
			if (e.key.length === 1) {
				bufferRef.current += e.key;
			}
		}

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [enabled]);
}
