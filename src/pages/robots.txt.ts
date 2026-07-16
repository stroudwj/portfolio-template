// Robots are only read from the DOMAIN root, so on a project-pages site
// (user.github.io/repo/robots.txt) this file is inert — it becomes effective when a
// buyer moves to a custom domain (base gone, file at root). Cheap to ship, correct
// where applicable. Deliberately NO `Disallow: /editor`: blocking the crawler would
// stop it from ever seeing that page's `noindex` meta, which is what actually works.
import type { APIRoute } from 'astro';
import { withBase } from '../portfolio/types';

export const GET: APIRoute = () => {
	const sitemap = new URL(withBase(import.meta.env.BASE_URL, 'sitemap.xml'), import.meta.env.SITE).href;
	return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
		headers: { 'Content-Type': 'text/plain' },
	});
};
