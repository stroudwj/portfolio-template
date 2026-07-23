// The HTML shell for browser-static-generated pages — a string-template reproduction
// of Layout.astro (head/meta/OG, theme CSS, favicons) around a server-rendered
// <Portfolio> body. Kept dumb on purpose: everything dynamic arrives as arguments so
// site.ts stays the one place that decides what a page contains.

/** Escape text destined for an HTML attribute or element body. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** JSON safe to inline inside a <script> element (no </script> or line-sep breakout). */
export function scriptSafeJson(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

export interface PageShellOptions {
	title: string;
	description: string;
	language: string;
	siteName: string;
	/** Absolute canonical URL for this page (siteUrl + path). */
	canonicalUrl?: string;
	/** Absolute og:image URL, if the site has a usable social-card image. */
	ogImageUrl?: string;
	noindex?: boolean;
	/** :root theme variables + @font-face + html/body rules (mirrors Layout.astro). */
	themeCss: string;
	/** Server-rendered <Portfolio> markup. */
	bodyHtml: string;
	/** When set, the page hydrates: window.__HW__ boot data for /_hw/hydrate.js. */
	bootJson?: string;
	/** The SVG favicon file name at the site root (site.favicon). */
	faviconSvg?: string;
}

/** One published page. Paths are root-absolute — every site serves from its own domain root. */
export function pageShell(o: PageShellOptions): string {
	const head = [
		'<meta charset="UTF-8" />',
		`<meta name="description" content="${escapeHtml(o.description)}" />`,
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		...(o.noindex ? ['<meta name="robots" content="noindex" />'] : []),
		'<link rel="icon" href="/favicon.ico" sizes="any" />',
		`<link rel="icon" type="image/svg+xml" href="/${escapeHtml(o.faviconSvg || 'favicon.svg')}" />`,
		'<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
		'<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />',
		'<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
		'<meta property="og:type" content="website" />',
		`<meta property="og:site_name" content="${escapeHtml(o.siteName)}" />`,
		`<meta property="og:title" content="${escapeHtml(o.title)}" />`,
		`<meta property="og:description" content="${escapeHtml(o.description)}" />`,
		...(o.canonicalUrl
			? [
					`<meta property="og:url" content="${escapeHtml(o.canonicalUrl)}" />`,
					`<link rel="canonical" href="${escapeHtml(o.canonicalUrl)}" />`,
				]
			: []),
		...(o.ogImageUrl ? [`<meta property="og:image" content="${escapeHtml(o.ogImageUrl)}" />`] : []),
		`<meta name="twitter:card" content="${o.ogImageUrl ? 'summary_large_image' : 'summary'}" />`,
		...(o.ogImageUrl ? [`<meta name="twitter:image" content="${escapeHtml(o.ogImageUrl)}" />`] : []),
		'<link rel="stylesheet" href="/_hw/portfolio.css" />',
		`<style>${o.themeCss}</style>`,
		`<title>${escapeHtml(o.title)}</title>`,
	].join('\n\t\t');

	const scripts = o.bootJson
		? `\n\t\t<script>window.__HW__=${o.bootJson};</script>\n\t\t<script type="module" src="/_hw/hydrate.js"></script>`
		: '';

	return `<!doctype html>
<html lang="${escapeHtml(o.language)}">
	<head>
		${head}
	</head>
	<body>
		<div id="hw-root">${o.bodyHtml}</div>${scripts}
	</body>
</html>
`;
}
