export const SAMPLE_UNAVAILABLE_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23dedbd5'/%3E%3Ctext x='50%25' y='48%25' fill='%235d5a54' font-family='sans-serif' font-size='34' text-anchor='middle'%3ESample unavailable%3C/text%3E%3Ctext x='50%25' y='56%25' fill='%23706d67' font-family='sans-serif' font-size='22' text-anchor='middle'%3EConnect to view this image%3C/text%3E%3C/svg%3E";

/** A network-only sample should fail as a deliberate neutral card, not as a
 * browser broken-image icon. Uploaded work never uses this fallback. */
export function showSampleUnavailable(
	image: Pick<HTMLImageElement, 'src' | 'srcset'>,
): void {
	if (image.src === SAMPLE_UNAVAILABLE_IMAGE) return;
	image.srcset = '';
	image.src = SAMPLE_UNAVAILABLE_IMAGE;
}
