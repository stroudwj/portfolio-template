/**
 * Last line of defense for user-supplied links rendered as `href` on the published site.
 * The editor's validation already rejects non-web URLs, but content.json can also arrive
 * hand-edited or loaded straight from a repo — so the renderer independently refuses any
 * scheme that could execute script (javascript:, data:, …). Returns undefined for anything
 * that isn't a plain web/mailto link, which renders the <a> inert.
 */
export function safeHref(url: string | undefined | null): string | undefined {
	if (!url) return undefined;
	try {
		const { protocol } = new URL(url);
		return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' ? url : undefined;
	} catch {
		// Didn't parse as an absolute URL → it's a relative path (e.g. the resume link,
		// `withBase(base, 'resume.pdf')`). Relative refs can't smuggle a scheme: any input
		// the browser would treat as scheme-qualified also parses in `new URL`, so anything
		// that lands here resolves against the page and is safe.
		return url;
	}
}
