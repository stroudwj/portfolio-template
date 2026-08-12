// The accessible name of an image that opens the lightbox.
//
// Spec 36: a renderer fallback must not stand in for artist content. The artist's
// words (image title, then alt, then the gallery's shared alt) name the image when
// they exist; when they are all empty the label falls back to the *function* of the
// control, not to any template copy — "Open image in image viewer" — so the label
// never announces with a hole in it (`Open  in image viewer`, spec 35 row E2).
export function imageViewerLabel(...candidates: (string | undefined)[]): string {
	const name = candidates.map((c) => (c ?? '').trim()).find(Boolean);
	return name ? `Open ${name} in image viewer` : 'Open image in image viewer';
}
