// Builds the published site's client runtime (hydrate.js + portfolio.css) from
// src/portfolio/hydrate-entry.tsx into public/hangwork-runtime/, where the deployed
// editor serves it and CloudflareTarget fetches it at publish time.
//
// Runs in prebuild (package.json) so every editor deploy carries a runtime built from
// the exact same component code the editor previews with — the browser-static-gen
// version of the old pinned-Astro-runtime discipline. Run manually after portfolio
// component changes during local dev: `npm run runtime:hydration`.
//
// Uses Astro's own bundled Vite (no extra dependency); esbuild handles the TSX.
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
	configFile: false,
	root,
	publicDir: false, // outDir lives INSIDE public/ — never copy public into itself
	logLevel: 'warn',
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
		// Mirror the flags astro.config defines so shared modules keep compiling.
		'import.meta.env.PUBLIC_HANGWORK_IS_PRODUCT_SITE': JSON.stringify('false'),
		'import.meta.env.PUBLIC_HANGWORK_RUNTIME_COMMIT': JSON.stringify('hydration-runtime'),
	},
	esbuild: { jsx: 'automatic' },
	build: {
		outDir: 'public/hangwork-runtime',
		emptyOutDir: true,
		cssCodeSplit: false, // one stylesheet with every component's CSS
		rollupOptions: {
			input: 'src/portfolio/hydrate-entry.tsx',
			output: {
				format: 'es',
				entryFileNames: 'hydrate.js',
				chunkFileNames: 'chunk-[hash].js',
				assetFileNames: (info) =>
					(info.names?.[0] ?? info.name ?? '').endsWith('.css') ? 'portfolio.css' : 'asset-[hash][extname]',
			},
		},
	},
});

console.log('hydration runtime → public/hangwork-runtime/ (hydrate.js + portfolio.css)');
