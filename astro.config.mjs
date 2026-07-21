// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import react from '@astrojs/react';

const project = JSON.parse(readFileSync(new URL('./.hangwork/project.json', import.meta.url), 'utf8'));
const isProductSite = process.env.HANGWORK_IS_PRODUCT_SITE
	? process.env.HANGWORK_IS_PRODUCT_SITE === 'true'
	: project.isProductSite;
let runtimeCommit = process.env.HANGWORK_RUNTIME_COMMIT || project.sourceCommit;
if (runtimeCommit === 'development') {
	try {
		runtimeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	} catch {
		// A source archive or deployment may not contain .git. Publishing stays safely
		// disabled until an exact release commit is supplied.
	}
}

// https://astro.build/config
//
// Project-specific values live outside this system-owned file so compatible runtime
// upgrades can replace the config without overwriting the site's address.
export default defineConfig({
	site: project.siteUrl,
	base: project.basePath,
	integrations: [react()],
	vite: {
		define: {
			'import.meta.env.PUBLIC_HANGWORK_RUNTIME_COMMIT': JSON.stringify(runtimeCommit),
			'import.meta.env.PUBLIC_HANGWORK_IS_PRODUCT_SITE': JSON.stringify(String(isProductSite)),
		},
	},
});
