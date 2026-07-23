// The reverse of publishing, Cloudflare edition: pull a live Hangwork-hosted site back
// into the editor from ANY signed-in browser. The published site carries its own
// editable source (`_hw/content.json`) and a user-content inventory (`_hw/files.json`,
// path → hash/size, written by CloudflareTarget), and the serving Worker answers GETs
// with `Access-Control-Allow-Origin: *` — so this needs no API at all, just the site.
//
// Mirrors github/load.ts: gallery membership and order live in the FILE LIST (NN-
// prefixes give the order); content.json only supplies optional captions on top.
import { pageGalleryConfigs, parseAndMigrateContent } from '../../../lib/content';
import type { Content, EditorDoc, ImageEntry } from '../types';
import type { PublishProgress } from '../exporter';
import { initDocFromContent } from '../content-init';
import { registerAsset, uid } from '../assets';
import { stripOrderPrefix } from '../github/load';
import type { AccountSiteSummary } from './session';
import { SITES_ROOT_DOMAIN } from '../github/subdomain';
import { saveSiteInfo, type ManifestEntry } from './site-store';

function mimeFromName(name: string): string {
	const ext = name.toLowerCase().split('.').pop() ?? '';
	const map: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		avif: 'image/avif',
		svg: 'image/svg+xml',
		woff2: 'font/woff2',
		woff: 'font/woff',
		ttf: 'font/ttf',
		otf: 'font/otf',
		pdf: 'application/pdf',
	};
	return map[ext] ?? 'application/octet-stream';
}

async function fetchBytes(siteUrl: string, path: string): Promise<Uint8Array | null> {
	try {
		const res = await fetch(`${siteUrl}/${path}`, { cache: 'no-cache' });
		if (!res.ok) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		return null;
	}
}

/** Fetch the live site's content + files and rebuild the EditorDoc. */
export async function loadPublishedSite(
	site: AccountSiteSummary,
	onProgress?: (p: PublishProgress) => void,
): Promise<EditorDoc> {
	if (!site.subdomain) {
		throw new Error('This account hasn’t published a site yet. Publish once, then you can edit it from anywhere.');
	}
	const siteUrl = `https://${site.subdomain}.${SITES_ROOT_DOMAIN}`;

	onProgress?.({ step: 'Finding your published site…' });
	const contentBytes = await fetchBytes(siteUrl, '_hw/content.json');
	if (!contentBytes) {
		throw new Error('Your site couldn’t be reached right now. Check your connection and try again.');
	}
	let rawContent: unknown;
	try {
		rawContent = JSON.parse(new TextDecoder().decode(contentBytes));
	} catch {
		throw new Error('Your site’s content file couldn’t be read. Try publishing again from the browser you built it in.');
	}
	const content: Content = parseAndMigrateContent(rawContent);

	onProgress?.({ step: 'Downloading your content…' });
	const inventoryBytes = await fetchBytes(siteUrl, '_hw/files.json');
	const inventory: Record<string, ManifestEntry> = inventoryBytes
		? ((JSON.parse(new TextDecoder().decode(inventoryBytes)) ?? {}) as Record<string, ManifestEntry>)
		: {};
	const servedPaths = Object.keys(inventory);

	// Gallery membership from the file list (code-unit order = display order).
	const folders = Object.keys(content.galleries);
	for (const page of Object.values(content.pages)) {
		for (const config of pageGalleryConfigs(page)) if (!folders.includes(config.folder)) folders.push(config.folder);
	}
	const folderFiles: Record<string, string[]> = {};
	for (const folder of folders) {
		const prefix = `assets/${folder}/`;
		folderFiles[folder] = servedPaths.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).sort();
	}

	// Everything to download: gallery images, thumbnails, profile, logo, fonts, résumé.
	const wanted: string[] = folders.flatMap((f) => folderFiles[f]);
	const has = (p: string) => servedPaths.includes(p);
	const thumbPathByPage = new Map<string, string>();
	for (const [key, page] of Object.entries(content.pages)) {
		if (page.thumbnail && has(`assets/${page.thumbnail}`)) {
			thumbPathByPage.set(key, `assets/${page.thumbnail}`);
			wanted.push(`assets/${page.thumbnail}`);
		}
	}
	const productPathById = new Map<string, string>();
	for (const product of content.store?.products ?? []) {
		if (!product.image) continue;
		const path = `assets/${product.image}`;
		if (has(path)) {
			productPathById.set(product.id, path);
			wanted.push(path);
		}
	}
	const profilePath = content.profile.image ? `assets/${content.profile.image}` : '';
	if (profilePath && has(profilePath)) wanted.push(profilePath);
	const logoPath = content.site.logoImage ? `assets/${content.site.logoImage}` : '';
	if (logoPath && has(logoPath)) wanted.push(logoPath);
	const fontPathByName = new Map<string, string>();
	for (const font of content.theme.customFonts ?? []) {
		const path = `assets/${font.file}`;
		if (has(path)) {
			fontPathByName.set(font.name, path);
			wanted.push(path);
		}
	}
	const resumePath = content.resume?.url ? content.resume.url.replace(/^\//, '') : '';
	const hasResume = !!resumePath && has(resumePath);
	if (hasResume) wanted.push(resumePath);

	const downloadPaths = [...new Set(wanted)];
	const assetIdByPath = new Map<string, string>();
	const total = downloadPaths.length;
	for (let i = 0; i < downloadPaths.length; i++) {
		onProgress?.({ step: 'Downloading your images…', detail: `${i} of ${total}` });
		const path = downloadPaths[i];
		const bytes = await fetchBytes(siteUrl, path);
		if (!bytes) continue; // a missing file renders as a placeholder, not a dead end
		const filename = path.slice(path.lastIndexOf('/') + 1);
		const blob = new Blob([bytes as BlobPart], { type: mimeFromName(filename) });
		assetIdByPath.set(path, registerAsset(blob, filename));
	}
	if (total) onProgress?.({ step: 'Downloading your images…', detail: `${total} of ${total}` });

	// Rebuild the document (same overlay logic as the GitHub loader).
	const doc = initDocFromContent(content);
	const galleries: Record<string, ImageEntry[]> = {};
	for (const folder of folders) {
		const prefix = `assets/${folder}/`;
		galleries[folder] = folderFiles[folder].map((path) => {
			const fullName = path.slice(prefix.length);
			const meta = content.galleries[folder]?.items?.[fullName] ?? {};
			return {
				id: meta.id || uid('e'),
				filename: stripOrderPrefix(fullName),
				meta: {
					...meta,
					title: meta.title ?? '',
					alt: meta.alt ?? '',
					description: meta.description ?? '',
					link: meta.link ?? '',
					w: meta.w,
					h: meta.h,
					layout: meta.layout,
				},
				assetId: assetIdByPath.get(path) ?? null,
			};
		});
	}
	doc.galleries = galleries;
	doc.profileImage = { filename: content.profile.image || '', assetId: assetIdByPath.get(profilePath) ?? null };
	doc.logoImage = { filename: content.site.logoImage || '', assetId: assetIdByPath.get(logoPath) ?? null };
	for (const [key, path] of thumbPathByPage) {
		doc.pageThumbs[key] = { filename: path.slice(path.lastIndexOf('/') + 1), assetId: assetIdByPath.get(path) ?? null };
	}
	for (const product of content.store?.products ?? []) {
		if (!product.image) continue;
		const path = productPathById.get(product.id) ?? `assets/${product.image}`;
		doc.productImages[product.id] = {
			filename: path.slice(path.lastIndexOf('/') + 1),
			assetId: assetIdByPath.get(path) ?? null,
		};
	}
	for (const [name, path] of fontPathByName) {
		doc.fonts[name] = { filename: path.slice(path.lastIndexOf('/') + 1), assetId: assetIdByPath.get(path) ?? null };
	}
	if (hasResume) {
		doc.resumeFile = { filename: resumePath.slice(resumePath.lastIndexOf('/') + 1), assetId: assetIdByPath.get(resumePath) ?? null };
	}

	// Remember the site so the next publish UPDATES it — the inventory seeds the local
	// manifest, so unchanged assets are carried forward instead of re-uploaded.
	saveSiteInfo({
		siteId: site.siteId,
		subdomain: site.subdomain,
		url: siteUrl,
		lastManifest: inventory,
		lastPublishedAt: site.lastPublishedAt ?? undefined,
	});

	return doc;
}
