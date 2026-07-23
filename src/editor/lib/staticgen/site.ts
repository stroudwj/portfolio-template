// Browser static-generation (Direction D, Subsystem 4): turn a PortfolioBundle into
// the complete static file set a Cloudflare-hosted site serves — real per-page HTML
// (SEO-correct), a hydration runtime, assets, favicons, 404/robots/sitemap.
//
// This reproduces, in the browser, what the Astro build does on a machine:
//   * enumerate pages the way [...page].astro's getStaticPaths does;
//   * resolve gallery images the way lib/galleries.ts + resolveImages.ts do — file
//     names under a folder in code-unit order (buildBundle already wrote ordered
//     names), joined with the caption metadata in content.galleries;
//   * renderToString the SAME <Portfolio> component the editor preview renders;
//   * wrap it in the Layout.astro-equivalent shell (staticgen/html.ts) and inline the
//     boot props for /_hw/hydrate.js (built by scripts/build-hydration-runtime.mjs).
//
// One deliberate difference from the Astro build: no image-optimizer pipeline in the
// browser, so pages reference the original uploaded files directly (src == full) and
// skip srcset. Publish once, and the served artifact IS the exportable artifact.
import { createElement } from 'react';
import type { Content, PageConfig } from '../../../lib/content';
import { pageGalleryConfigs } from '../../../lib/content';
import Portfolio from '../../../portfolio/Portfolio';
import { fontFacesCss, themeToRootCss } from '../../../portfolio/theme';
import type { PortfolioData, ResolvedImage } from '../../../portfolio/types';
import type { PortfolioBundle } from '../exporter';
import { contentJsonString } from '../exporter';
import { escapeHtml, pageShell, scriptSafeJson } from './html';

export interface StaticFile {
	/** Site-relative served path, e.g. "index.html", "assets/art/01-piece.jpg". */
	path: string;
	bytes: Uint8Array;
}

export interface StaticSite {
	files: StaticFile[];
	/** Served paths that hold USER content (assets + public files) — the carry-forward
	 *  set the target records in _hw/files.json so any browser can reload the site. */
	assetPaths: string[];
}

export interface StaticSiteOptions {
	/** The site's final origin, no trailing slash — canonical/OG URLs need it. */
	siteUrl: string;
	/** The editor's own base URL ("/" or "/portfolio-template/") for fetching the
	 *  prebuilt hydration runtime + favicons deployed alongside the editor. */
	editorBase: string;
}

/** src/assets/X → assets/X, public/X → X: project paths to served paths. */
export function servedPath(projectPath: string): string {
	if (projectPath.startsWith('src/assets/')) return `assets/${projectPath.slice('src/assets/'.length)}`;
	if (projectPath.startsWith('public/')) return projectPath.slice('public/'.length);
	return projectPath;
}

/** Every asset path the content references without re-uploading (kept from the last
 *  publish). Mirrors referencedAssetPaths in github/target.ts. */
export function referencedAssetPaths(content: Content): string[] {
	const paths: string[] = [];
	if (content.profile.image) paths.push(`src/assets/${content.profile.image}`);
	if (content.site.logoImage) paths.push(`src/assets/${content.site.logoImage}`);
	for (const page of Object.values(content.pages)) if (page.thumbnail) paths.push(`src/assets/${page.thumbnail}`);
	for (const font of content.theme.customFonts ?? []) paths.push(`src/assets/${font.file}`);
	for (const [folder, gallery] of Object.entries(content.galleries))
		for (const filename of Object.keys(gallery.items)) paths.push(`src/assets/${folder}/${filename}`);
	for (const product of content.store?.products ?? [])
		if (product.status !== 'draft' && product.image) paths.push(`src/assets/${product.image}`);
	const resume = content.resume?.url.trim();
	if (resume && !resume.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(resume))
		paths.push(`public/${resume.replace(/^\/+/, '')}`);
	return paths;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;

/** Natural width/height ratios for uploaded images (canvas auto-flow needs them). */
async function computeAspectRatios(bundle: PortfolioBundle): Promise<Map<string, number>> {
	const ratios = new Map<string, number>();
	for (const file of bundle.files) {
		if (!file.path.startsWith('src/assets/') || !IMAGE_EXT.test(file.path)) continue;
		try {
			const bitmap = await createImageBitmap(new Blob([file.bytes as BlobPart]));
			if (bitmap.width && bitmap.height) ratios.set(servedPath(file.path), bitmap.width / bitmap.height);
			bitmap.close();
		} catch {
			/* undecodable/exotic file — auto-flow just measures it client-side instead */
		}
	}
	return ratios;
}

/**
 * Resolve every gallery from the published FILE SET (not just captioned entries —
 * content.galleries[].items only holds files with metadata, exactly like the Astro
 * glob renders every file in the folder).
 */
function resolveGalleries(content: Content, assetPaths: Set<string>, ratios: Map<string, number>): Record<string, ResolvedImage[]> {
	const byFolder = new Map<string, string[]>();
	for (const path of assetPaths) {
		if (!path.startsWith('src/assets/')) continue;
		const rest = path.slice('src/assets/'.length);
		const slash = rest.indexOf('/');
		if (slash <= 0) continue;
		const folder = rest.slice(0, slash);
		const name = rest.slice(slash + 1);
		if (name.includes('/')) continue; // nested (thumbs/, fonts/) never render as galleries
		byFolder.set(folder, [...(byFolder.get(folder) ?? []), name]);
	}

	const galleries: Record<string, ResolvedImage[]> = {};
	for (const page of Object.values(content.pages)) {
		for (const config of pageGalleryConfigs(page)) {
			if (config.folder in galleries) continue;
			const items = content.galleries[config.folder]?.items ?? {};
			// Code-unit sort mirrors the Astro glob's key order; 'desc' reverses it.
			const names = (byFolder.get(config.folder) ?? []).sort();
			if (config.order === 'desc') names.reverse();
			galleries[config.folder] = names.map((name) => {
				const meta = items[name] ?? {};
				const src = `/assets/${config.folder}/${name}`;
				return {
					id: meta.id ?? name,
					src,
					full: src,
					alt: meta.alt || meta.title || config.alt || '',
					title: meta.title,
					description: meta.description,
					link: meta.link,
					w: meta.w,
					h: meta.h,
					layout: meta.layout,
					ar: ratios.get(`assets/${config.folder}/${name}`),
				} satisfies ResolvedImage;
			});
		}
	}
	return galleries;
}

/** Sub-page card images: explicit thumbnail, else the page's first gallery image. */
function resolvePageThumbs(content: Content, galleries: Record<string, ResolvedImage[]>): Record<string, string> {
	const thumbs: Record<string, string> = {};
	for (const [key, page] of Object.entries(content.pages)) {
		if (page.thumbnail) thumbs[key] = `/assets/${page.thumbnail}`;
		else if (page.gallery) {
			const first = galleries[page.gallery.folder]?.[0];
			if (first) thumbs[key] = first.src;
		}
	}
	return thumbs;
}

/** Store catalog images use their stable content paths directly in browser-built sites. */
function resolveProductImageSrcs(content: Content): Record<string, string> {
	const images: Record<string, string> = {};
	for (const product of content.store?.products ?? []) {
		if (product.status !== 'draft' && product.image)
			images[product.id] = `/assets/${product.image}`;
	}
	return images;
}

/** site.ogImage first, else the profile photo, else home's first image (resolveOgImage). */
function resolveOgImage(content: Content, galleries: Record<string, ResolvedImage[]>, siteUrl: string): string | undefined {
	if (content.site.ogImage) return `${siteUrl}/assets/${content.site.ogImage}`;
	if (content.profile.image) return `${siteUrl}/assets/${content.profile.image}`;
	const home = content.pages.home?.gallery;
	const first = home ? galleries[home.folder]?.[0] : undefined;
	return first ? `${siteUrl}${first.src}` : undefined;
}

/** Fetch one of the editor deploy's own static files (hydration runtime, favicons). */
async function fetchEditorAsset(editorBase: string, name: string, required: boolean): Promise<Uint8Array | null> {
	try {
		const res = await fetch(`${editorBase.replace(/\/$/, '')}/${name}`, { cache: 'no-cache' });
		if (!res.ok) throw new Error(String(res.status));
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		if (required)
			throw new Error(
				'The site runtime could not be loaded from the editor. Refresh and try again (or rebuild with `npm run runtime:hydration` in local dev).',
			);
		return null;
	}
}

const textBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Pages the way getStaticPaths enumerates them (drafts are already stripped by buildBundle). */
function publishedPages(content: Content): Array<{ key: string; page: PageConfig; served: string; urlPath: string }> {
	return Object.entries(content.pages).map(([key, page]) => ({
		key,
		page,
		served: key === 'home' ? 'index.html' : `${key}/index.html`,
		urlPath: key === 'home' ? '/' : `/${key}/`,
	}));
}

/** Turn a built bundle into the complete static site file set. */
export async function generateStaticSite(bundle: PortfolioBundle, opts: StaticSiteOptions): Promise<StaticSite> {
	// SSR renderer loaded on demand — publish-time only, never in the editor's hot path.
	const { renderToString } = await import('react-dom/server');
	const content = bundle.contentJson;
	const siteUrl = opts.siteUrl.replace(/\/$/, '');

	const files: StaticFile[] = bundle.files.map((file) => ({ path: servedPath(file.path), bytes: file.bytes }));
	const assetPaths = new Set<string>([...bundle.files.map((f) => f.path), ...referencedAssetPaths(content)]);

	const ratios = await computeAspectRatios(bundle);
	const galleries = resolveGalleries(content, assetPaths, ratios);
	const data: PortfolioData = {
		content,
		galleries,
		profileImageSrc: content.profile.image ? `/assets/${content.profile.image}` : undefined,
		logoImageSrc: content.site.logoImage ? `/assets/${content.site.logoImage}` : undefined,
		pageThumbs: resolvePageThumbs(content, galleries),
		productImageSrcs: resolveProductImageSrcs(content),
		fontFaces: (content.theme.customFonts ?? []).map((font) => ({ name: font.name, url: `/assets/${font.file}` })),
	};

	// Head pieces shared by every page (mirrors Layout.astro's themeCss + bodyCss).
	const bodyCss =
		'html,body{margin:0;padding:0;width:100%;height:100%;background-color:var(--color-bg);font-family:var(--font-family);}';
	const themeCss = fontFacesCss(data.fontFaces ?? []) + themeToRootCss(content.theme) + bodyCss;
	const language = content.site.language || 'en';
	const siteName = content.site.name;
	const ogImageUrl = resolveOgImage(content, galleries, siteUrl);
	const pageTitle = (template: string): string => template.replace('{name}', siteName);

	const pages = publishedPages(content);
	for (const { key, page, served, urlPath } of pages) {
		const bodyHtml = renderToString(createElement(Portfolio, { page: key, base: '/', ...data }));
		files.push({
			path: served,
			bytes: textBytes(
				pageShell({
					title: pageTitle(page.title),
					description: page.description || content.site.description,
					language,
					siteName,
					canonicalUrl: `${siteUrl}${urlPath}`,
					ogImageUrl,
					noindex: page.noindex,
					themeCss,
					bodyHtml,
					bootJson: scriptSafeJson({ page: key, data }),
					faviconSvg: content.site.favicon,
				}),
			),
		});
	}

	// 404 — same shell and theme, no hydration; the serving Worker falls back to it.
	files.push({
		path: '404.html',
		bytes: textBytes(
			pageShell({
				title: pageTitle(content.pages.home?.title ?? '{name}') + ' — Page not found',
				description: content.site.description,
				language,
				siteName,
				noindex: true,
				themeCss,
				bodyHtml: `<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;"><h1 style="font-family:var(--font-heading);font-weight:500;">Page not found</h1><p style="color:var(--color-text-muted);">That page doesn’t exist here (anymore).</p><a href="/" style="color:var(--color-accent);">${escapeHtml(siteName || 'Back to the home page')}</a></div>`,
				faviconSvg: content.site.favicon,
			}),
		),
	});

	// robots.txt + sitemap.xml (noindex pages stay out of the sitemap).
	files.push({ path: 'robots.txt', bytes: textBytes(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`) });
	const sitemapUrls = pages
		.filter(({ page }) => !page.noindex)
		.map(({ urlPath }) => `\t<url><loc>${escapeHtml(siteUrl + urlPath)}</loc></url>`)
		.join('\n');
	files.push({
		path: 'sitemap.xml',
		bytes: textBytes(
			`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`,
		),
	});

	// The editable source of truth, republished with the site so any signed-in device
	// (and any export) can reopen it in the editor.
	files.push({ path: '_hw/content.json', bytes: textBytes(contentJsonString(content)) });

	// The prebuilt hydration runtime + the favicon set, from the editor's own deploy.
	const runtime: Array<[string, string, boolean]> = [
		['_hw/hydrate.js', 'hangwork-runtime/hydrate.js', true],
		['_hw/portfolio.css', 'hangwork-runtime/portfolio.css', true],
		['favicon.ico', 'favicon.ico', false],
		['favicon.svg', 'favicon.svg', false],
		['favicon-16.png', 'favicon-16.png', false],
		['favicon-32.png', 'favicon-32.png', false],
		['apple-touch-icon.png', 'apple-touch-icon.png', false],
	];
	for (const [sitePath, editorPath, required] of runtime) {
		const bytes = await fetchEditorAsset(opts.editorBase, editorPath, required);
		if (bytes) files.push({ path: sitePath, bytes });
	}

	return { files, assetPaths: [...assetPaths].map(servedPath).sort() };
}
