// Just opens the PDF in a new tab. The backend already mirrors every
// generated PDF to disk itself the moment it's rendered (see
// shared/archive.py - Documents/<category>/<year>/<month>/<day>/...,
// right under the project folder), so there's no need for the browser's
// own separate download-to-Downloads action (and the visible download
// popup/toast that comes with it) on top of that.
export function viewPdf(url: string): void {
	window.open(url, "_blank");
}
