// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import react from '@astrojs/react';

const project = JSON.parse(readFileSync(new URL('./.hangwork/project.json', import.meta.url), 'utf8'));
const isProductSite = process.env.HANGWORK_IS_PRODUCT_SITE
	? process.env.HANGWORK_IS_PRODUCT_SITE === 'true'
	: project.isProductSite;
// The template studio (dev-only admin tooling) lives outside src/ and may be
// absent from a user's runtime install — a missing module means no studio,
// never a broken config.
let templateStudio;
try {
	({ templateStudio } = await import('./scripts/template-studio/dev-api.mjs'));
} catch {
	templateStudio = undefined;
}

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
	integrations: [react(), ...(templateStudio ? [templateStudio()] : [])],
	vite: {
		define: {
			'import.meta.env.PUBLIC_HANGWORK_RUNTIME_COMMIT': JSON.stringify(runtimeCommit),
			'import.meta.env.PUBLIC_HANGWORK_IS_PRODUCT_SITE': JSON.stringify(String(isProductSite)),
		},
	},
});
