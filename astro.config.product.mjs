// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import react from '@astrojs/react';

const project = JSON.parse(readFileSync(new URL('./.hangwork/project.json', import.meta.url), 'utf8'));
let runtimeCommit = process.env.CF_PAGES_COMMIT_SHA || process.env.HANGWORK_RUNTIME_COMMIT || project.sourceCommit;
if (runtimeCommit === 'development') {
	try {
		runtimeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch {
		// See astro.config.mjs: without a verifiable commit, publishing fails closed.
	}
}

// Config for the PRODUCT SITE build only (`npm run build:product`), used by the
// Cloudflare Pages deploy of the sales page + editor. It lives in its own file
// because published projects get their address from .hangwork/project.json while the
// product site always builds at the canonical domain below.
//
// If you generated your portfolio from the template: ignore this file — your site
// builds with astro.config.mjs.
//
// Keep `site` in sync with the first entry of the Worker's ALLOWED_ORIGIN in
// oauth-proxy/wrangler.toml. This is the canonical URL used in sitemap/robots/og tags.
export default defineConfig({
	site: 'https://hangwork.art',
	// No `base`: Cloudflare Pages serves the site at the domain root.
	integrations: [react()],
	vite: {
		define: {
			'import.meta.env.PUBLIC_HANGWORK_RUNTIME_COMMIT': JSON.stringify(runtimeCommit),
			'import.meta.env.PUBLIC_HANGWORK_IS_PRODUCT_SITE': JSON.stringify('true'),
		},
	},
});
