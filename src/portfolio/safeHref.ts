const WEB_PROTOCOL = /^https?:$/;
const EXPLICIT_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const BARE_WEB_HOST = /^(?:www\.)?(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#].*)?$/i;

/** Turn an absolute or scheme-less web address into a safe, fully qualified href. */
export function safeWebHref(url: string | undefined | null): string | undefined {
	const value = url?.trim();
	if (!value) return undefined;
	const candidate = !EXPLICIT_SCHEME.test(value) && BARE_WEB_HOST.test(value) ? `https://${value}` : value;
	try {
		return WEB_PROTOCOL.test(new URL(candidate).protocol) ? candidate : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Last line of defense for user-supplied links rendered as `href` on the published site.
 * The editor's validation already rejects non-web URLs, but content.json can also arrive
 * hand-edited or loaded straight from a repo — so the renderer independently refuses any
 * scheme that could execute script (javascript:, data:, …). Returns undefined for anything
 * that isn't a plain web/mailto link, which renders the <a> inert.
 */
export function safeHref(url: string | undefined | null): string | undefined {
	const value = url?.trim();
	if (!value) return undefined;
	const web = safeWebHref(value);
	if (web) return web;
	try {
		return new URL(value).protocol === 'mailto:' ? value : undefined;
	} catch {
		// Didn't parse as an absolute URL → it's a relative path (e.g. the resume link,
		// `withBase(base, 'resume.pdf')`). Relative refs can't smuggle a scheme: any input
		// the browser would treat as scheme-qualified also parses in `new URL`, so anything
		// that lands here resolves against the page and is safe.
		return value;
	}
}
