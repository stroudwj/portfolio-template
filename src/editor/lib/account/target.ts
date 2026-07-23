// CloudflareTarget — publishes a portfolio to Hangwork hosting (R2 + Workers) through
// the account API. The Cloudflare-flavored mirror of github/target.ts: same
// PublishTarget contract, same manifest-diff discipline, but the "runtime" is the
// browser-generated static site itself (staticgen/) instead of a committed Astro tree.
//
// Flow (see oauth-proxy/publish.js for the server half):
//   1. staticgen: bundle → the full static file set (HTML + hydration runtime + assets)
//   2. hash everything → manifest { path: { hash, size } }, carrying forward entries
//      for assets referenced-but-not-re-uploaded (they already live in R2)
//   3. POST /publish → authz + license + quota checks; upload tickets for CHANGED files
//   4. PUT /upload per changed file (hash-verified server-side)
//   5. POST /publish/complete → deletions + D1/KV bookkeeping → live URL
import { compressImage, imageTypeFromName } from '../compressImage';
import type { PortfolioBundle, PublishProgress, PublishResult, PublishTarget } from '../exporter';
import { generateStaticSite, referencedAssetPaths, servedPath, type StaticFile } from '../staticgen/site';
import { SITES_ROOT_DOMAIN } from '../github/subdomain';
import { AccountClient } from './client';
import type { ManifestEntry, SiteStore } from './site-store';

// Mirrors the Worker's MAX_BLOB_BYTES (oauth-proxy/publish.js).
const MAX_BLOB_BYTES = 18 * 1024 * 1024;

interface PublishResponse {
	siteId: string;
	subdomain: string;
	url: string;
	uploads: Array<{ path: string; ticket: string }>;
	deleted: string[];
	grant: string;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CloudflareTargetOptions {
	client: AccountClient;
	store: SiteStore;
	/** Required only on the first publish (when no site is saved yet). */
	desiredSubdomain?: string;
	/** The editor's base URL, for fetching the prebuilt hydration runtime. */
	editorBase: string;
}

export class CloudflareTarget implements PublishTarget {
	constructor(private opts: CloudflareTargetOptions) {}

	async publish(bundle: PortfolioBundle, onProgress?: (p: PublishProgress) => void): Promise<PublishResult> {
		const { client, store } = this.opts;
		const report = (step: string, detail?: string) => onProgress?.({ step, detail });

		const saved = store.load();
		const subdomain = saved?.subdomain ?? this.opts.desiredSubdomain?.trim();
		if (!subdomain) throw new Error('A website name is required for the first publish.');
		const siteUrl = `https://${subdomain}.${SITES_ROOT_DOMAIN}`;

		// 1. Browser static-gen: the bundle becomes the exact file set the site serves.
		report('Building your site…');
		const { files, assetPaths } = await generateStaticSite(bundle, { siteUrl, editorBase: this.opts.editorBase });

		// Keep single files under the publish cap, shrinking oversized images in place
		// (same behavior GitHubTarget applied to Git blobs).
		const oversized: string[] = [];
		for (const file of files) {
			if (file.bytes.length <= MAX_BLOB_BYTES) continue;
			const name = file.path.split('/').pop() ?? file.path;
			const type = imageTypeFromName(name);
			const shrunk = type
				? await compressImage(new File([file.bytes as unknown as BlobPart], name, { type }), { keepType: true })
				: null;
			if (shrunk && shrunk.size <= MAX_BLOB_BYTES) file.bytes = new Uint8Array(await shrunk.arrayBuffer());
			else oversized.push(name);
		}
		if (oversized.length) {
			throw new Error(
				`Too large to publish: ${oversized.join(', ')}. Files over ${MAX_BLOB_BYTES / (1024 * 1024)} MB can't be published — please use a smaller version.`,
			);
		}

		// 2. Manifest: hash what we generated, then carry forward referenced assets that
		// weren't re-uploaded this session — their bytes already live in R2 and keeping
		// their old hash/size in the manifest is what tells the Worker to preserve them.
		report('Checking what changed…');
		const manifest: Record<string, ManifestEntry> = {};
		const byPath = new Map<string, StaticFile>();
		for (const file of files) {
			manifest[file.path] = { hash: await sha256Hex(file.bytes), size: file.bytes.length };
			byPath.set(file.path, file);
		}
		const missing = new Set<string>();
		for (const projectPath of referencedAssetPaths(bundle.contentJson)) {
			const path = servedPath(projectPath);
			if (manifest[path]) continue;
			const carried = saved?.lastManifest?.[path];
			if (carried) manifest[path] = carried;
			// Drop the leading "assets/" so the message reads as a page-relative path
			// (e.g. "selected-works/placeholder.png") instead of a bare filename —
			// several sample images share the name "placeholder.png".
			else missing.add(path.replace(/^assets\//, ''));
		}
		if (missing.size) {
			const list = [...missing];
			throw new Error(
				`Still using the sample image${list.length === 1 ? '' : 's'} for: ${list.join(', ')}. Replace ${list.length === 1 ? 'it' : 'them'} with your own before publishing.`,
			);
		}

		// _hw/files.json — the user-content inventory (path → hash/size). Any signed-in
		// browser reads it (with _hw/content.json) to reload the site for editing, which
		// is what replaces GitHub's tree listing in the load-published flow.
		const inventory = Object.fromEntries(
			assetPaths.filter((path) => manifest[path]).map((path) => [path, manifest[path]]),
		);
		const inventoryFile: StaticFile = {
			path: '_hw/files.json',
			bytes: new TextEncoder().encode(JSON.stringify(inventory)),
		};
		files.push(inventoryFile);
		byPath.set(inventoryFile.path, inventoryFile);
		manifest[inventoryFile.path] = { hash: await sha256Hex(inventoryFile.bytes), size: inventoryFile.bytes.length };

		// 3. Ask to publish: the Worker enforces the license + ownership + quotas and
		// answers with tickets for changed files only.
		report('Claiming your web address…', subdomain);
		const { data: grant } = await client.request<PublishResponse>('/publish', {
			body: {
				siteId: saved?.siteId,
				subdomain: saved ? undefined : subdomain,
				manifest,
			},
		});

		// 4. Upload only what changed, straight into R2 via the Worker.
		const total = grant.uploads.length;
		for (let i = 0; i < total; i++) {
			const { path, ticket } = grant.uploads[i];
			report('Uploading your files…', `${i + 1} of ${total}`);
			const file = byPath.get(path);
			if (!file) throw new Error(`The publish plan referenced an unknown file (${path}). Please try again.`);
			await client.request(`/upload?ticket=${encodeURIComponent(ticket)}`, { method: 'PUT', bytes: file.bytes });
		}

		// 5. Commit: deletions + bookkeeping happen server-side in one step.
		report('Publishing your website…');
		const { data: done } = await client.request<{ url: string }>('/publish/complete', {
			body: { grant: grant.grant, manifest },
		});

		store.save({
			siteId: grant.siteId,
			subdomain: grant.subdomain,
			url: done.url,
			customDomain: saved?.customDomain,
			lastManifest: manifest,
			lastPublishedAt: new Date().toISOString(),
		});

		return { url: done.url };
	}
}
