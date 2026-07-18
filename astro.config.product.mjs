// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// Config for the PRODUCT SITE build only (`npm run build:product`), used by the
// Cloudflare Pages deploy of the sales page + editor. It lives in its own file
// because the publisher rewrites the `site:`/`base:` literals in astro.config.mjs
// for buyer repos (rewriteSiteAndBase) and that file must keep its exact shape.
//
// If you generated your portfolio from the template: ignore this file — your site
// builds with astro.config.mjs.
//
// Keep `site` in sync with the Worker's ALLOWED_ORIGIN in oauth-proxy/wrangler.toml.
export default defineConfig({
	site: 'https://simpleportfolioeditor.pages.dev',
	// No `base`: Cloudflare Pages serves the site at the domain root.
	integrations: [react()],
});
