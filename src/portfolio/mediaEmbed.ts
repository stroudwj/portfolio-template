import { videoEmbedSrc } from './videoEmbed';

export type EmbedKind = 'video' | 'audio' | 'map';
export type EmbedProvider = 'YouTube' | 'Vimeo' | 'SoundCloud' | 'Bandcamp' | 'Google Maps';

export interface EmbedSpec {
	kind: EmbedKind;
	provider: EmbedProvider;
	src: string;
	title: string;
	aspectRatio: number;
	allow?: string;
	allowFullScreen?: boolean;
}

const decodeHtmlEntities = (value: string): string =>
	value
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;|&apos;/gi, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
		.replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)));

/** Pull the safe-to-validate src value out of provider iframe code. */
export function iframeSrcFromInput(raw: string): string | null {
	const match = /<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(raw);
	const value = match?.[1] ?? match?.[2] ?? match?.[3];
	return value ? decodeHtmlEntities(value.trim()) : null;
}

const candidateUrl = (raw: string): string => iframeSrcFromInput(raw) ?? raw.trim();

const parseWebUrl = (value: string): URL | null => {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
	} catch {
		return null;
	}
};

const iframeAspectRatio = (raw: string): number | null => {
	const tag = /<iframe\b[^>]*>/i.exec(raw)?.[0];
	if (!tag) return null;
	const width =
		Number(/\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/i.exec(tag)?.[1]) ||
		Number(/\bwidth\s*:\s*(\d+(?:\.\d+)?)px/i.exec(tag)?.[1]);
	const height =
		Number(/\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/i.exec(tag)?.[1]) ||
		Number(/\bheight\s*:\s*(\d+(?:\.\d+)?)px/i.exec(tag)?.[1]);
	if (!width || !height) return null;
	const ratio = width / height;
	return ratio >= 0.4 && ratio <= 8 ? ratio : null;
};

const soundCloudSpec = (raw: string): EmbedSpec | null => {
	const source = parseWebUrl(candidateUrl(raw));
	if (!source) return null;
	const host = source.hostname.toLowerCase().replace(/^www\./, '');
	source.protocol = 'https:';
	let src: string;
	if (host === 'w.soundcloud.com' && source.pathname.startsWith('/player')) {
		const track = parseWebUrl(source.searchParams.get('url') ?? '');
		const trackHost = track?.hostname.toLowerCase() ?? '';
		if (!track || !(trackHost === 'soundcloud.com' || trackHost.endsWith('.soundcloud.com'))) return null;
		src = source.toString();
	} else if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
		if (source.pathname === '/' || !source.pathname) return null;
		const player = new URL('https://w.soundcloud.com/player/');
		player.searchParams.set('url', source.toString());
		player.searchParams.set('auto_play', 'false');
		player.searchParams.set('hide_related', 'false');
		player.searchParams.set('show_comments', 'true');
		player.searchParams.set('show_user', 'true');
		player.searchParams.set('show_reposts', 'false');
		player.searchParams.set('visual', 'false');
		src = player.toString();
	} else {
		return null;
	}
	return {
		kind: 'audio',
		provider: 'SoundCloud',
		src,
		title: 'SoundCloud audio player',
		aspectRatio: iframeAspectRatio(raw) ?? 5.4,
		allow: 'autoplay',
	};
};

const bandcampSpec = (raw: string): EmbedSpec | null => {
	const source = parseWebUrl(candidateUrl(raw));
	if (!source) return null;
	const host = source.hostname.toLowerCase().replace(/^www\./, '');
	if (host !== 'bandcamp.com' || !/^\/EmbeddedPlayer\//i.test(source.pathname)) return null;
	if (!/(?:^|\/)(?:album|track)=\d+(?:\/|$)/i.test(source.pathname)) return null;
	source.protocol = 'https:';
	const compact = /\/size=small(?:\/|$)/i.test(source.pathname);
	const artworkSmall = /\/artwork=small(?:\/|$)/i.test(source.pathname);
	return {
		kind: 'audio',
		provider: 'Bandcamp',
		src: source.toString(),
		title: 'Bandcamp audio player',
		aspectRatio: iframeAspectRatio(raw) ?? (compact ? 8 : artworkSmall ? 5.4 : 0.75),
		allow: 'autoplay',
	};
};

const isGoogleHost = (host: string): boolean =>
	/(^|\.)google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})$/i.test(host);

const googleMapsSpec = (raw: string): EmbedSpec | null => {
	const source = parseWebUrl(candidateUrl(raw));
	if (!source || !isGoogleHost(source.hostname) || !source.pathname.startsWith('/maps')) return null;
	source.protocol = 'https:';
	if (
		source.pathname.includes('/embed') ||
		source.pathname.endsWith('/embed/') ||
		source.searchParams.get('output') === 'embed'
	) {
		return {
			kind: 'map',
			provider: 'Google Maps',
			src: source.toString(),
			title: 'Google Map',
			aspectRatio: iframeAspectRatio(raw) ?? 4 / 3,
			allowFullScreen: true,
		};
	}

	let query = source.searchParams.get('q') ?? source.searchParams.get('query');
	if (!query) {
		const place = /^\/maps\/(?:place|search)\/([^/]+)/i.exec(source.pathname)?.[1];
		if (place) {
			try {
				query = decodeURIComponent(place.replace(/\+/g, ' '));
			} catch {
				query = place.replace(/\+/g, ' ');
			}
		}
	}
	if (!query) {
		const coordinates = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(source.pathname);
		if (coordinates) query = `${coordinates[1]},${coordinates[2]}`;
	}
	if (!query) return null;
	const embed = new URL('https://www.google.com/maps');
	embed.searchParams.set('q', query);
	embed.searchParams.set('output', 'embed');
	return {
		kind: 'map',
		provider: 'Google Maps',
		src: embed.toString(),
		title: 'Google Map',
		aspectRatio: iframeAspectRatio(raw) ?? 4 / 3,
		allowFullScreen: true,
	};
};

/** Safely resolve a supported player or map without ever framing an arbitrary host. */
export function embedSpec(raw: string): EmbedSpec | null {
	const video = videoEmbedSrc(candidateUrl(raw));
	if (video) {
		return {
			kind: 'video',
			provider: video.includes('youtube.com') ? 'YouTube' : 'Vimeo',
			src: video,
			title: 'Embedded video',
			aspectRatio: iframeAspectRatio(raw) ?? 16 / 9,
			allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
			allowFullScreen: true,
		};
	}
	return soundCloudSpec(raw) ?? bandcampSpec(raw) ?? googleMapsSpec(raw);
}

/** Preserve the module the artist chose while input is incomplete or malformed. */
export function embedKindForInput(raw: string): EmbedKind | undefined {
	const resolved = embedSpec(raw);
	if (resolved) return resolved.kind;
	const source = parseWebUrl(candidateUrl(raw));
	const host = source?.hostname.toLowerCase() ?? '';
	if (host.includes('soundcloud.com') || host.includes('bandcamp.com')) return 'audio';
	if ((source && isGoogleHost(host) && source.pathname.startsWith('/maps')) || host === 'maps.app.goo.gl') return 'map';
	if (host.includes('youtube.com') || host === 'youtu.be' || host.includes('vimeo.com')) return 'video';
	return undefined;
}

export const embedKindLabel = (kind: EmbedKind): string =>
	kind === 'audio' ? 'Music player' : kind === 'map' ? 'Google Map' : 'Video';
