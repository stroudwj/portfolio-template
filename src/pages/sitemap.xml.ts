// Hand-rolled sitemap instead of @astrojs/sitemap: astro.config.mjs stays untouched
// (the publish pipeline regex-rewrites its site/base lines, so we avoid editing it),
// and the noindex /editor page is excluded for free — it isn't in content.nav.
// SITE/BASE_URL are baked in at build time, so each published repo (whose config the
// publisher rewrote before this build ran) emits its own correct absolute URLs.
import type { APIRoute } from 'astro';
import { content } from '../lib/content';
import { withBase } from '../portfolio/types';
import { IS_PRODUCT_SITE } from '../lib/productSite';
import { SEO_ARTICLES } from '../lib/seoArticles';

export const GET: APIRoute = () => {
	const site = import.meta.env.SITE;
	const base = import.meta.env.BASE_URL;
	// Product site: the landing, examples, guides, and FAQ — /demo and /editor are noindex.
	// Published sites: every page, including nested sub-pages (keys are paths).
	const pagePaths = Object.keys(content.pages).map((key) => (key === 'home' ? '' : key));
	const locs = IS_PRODUCT_SITE
		? [
				new URL(withBase(base), site).href,
				new URL(withBase(base, 'examples'), site).href,
				new URL(withBase(base, 'guide'), site).href,
				new URL(withBase(base, 'faq'), site).href,
				...SEO_ARTICLES.map((article) => new URL(withBase(base, `learn/${article.slug}`), site).href),
			]
		: pagePaths.map((path) => new URL(withBase(base, path && `${path}/`), site).href);
	const urls = locs.map((loc) => `\t<url><loc>${loc}</loc></url>`).join('\n');
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
