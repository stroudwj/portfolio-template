// Turns a pasted YouTube/Vimeo link into an embeddable player URL. Host-allowlisted
// and id-validated so arbitrary URLs can never become an iframe src on the published
// site — anything unrecognized returns null and the caller falls back to a plain link.

const YT_EMBED = 'https://www.youtube-nocookie.com/embed/';
const VIMEO_EMBED = 'https://player.vimeo.com/video/';

const ytId = (value: string | null | undefined): string | null =>
	value && /^[\w-]{6,20}$/.test(value) ? value : null;

/** Embeddable player URL for a YouTube/Vimeo link, or null if it isn't one. */
export function videoEmbedSrc(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const segs = url.pathname.split('/').filter(Boolean);

	if (host === 'youtu.be') {
		const id = ytId(segs[0]);
		return id ? YT_EMBED + id : null;
	}
	if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
		if (segs[0] === 'watch') {
			const id = ytId(url.searchParams.get('v'));
			return id ? YT_EMBED + id : null;
		}
		if (['embed', 'shorts', 'live', 'v'].includes(segs[0])) {
			const id = ytId(segs[1]);
			return id ? YT_EMBED + id : null;
		}
		return null;
	}
	if (host === 'vimeo.com' || host === 'player.vimeo.com') {
		const start = segs[0] === 'video' ? 1 : 0;
		const id = segs[start];
		if (!id || !/^\d+$/.test(id)) return null;
		// Unlisted videos carry an access hash as the next path segment.
		const hash = segs[start + 1];
		const suffix = hash && /^[0-9a-f]+$/i.test(hash) ? `?h=${hash}` : '';
		return VIMEO_EMBED + id + suffix;
	}
	return null;
}
