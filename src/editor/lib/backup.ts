import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { EditorDoc } from './types';
import { getAssetBlob, restoreAsset, uid } from './assets';
import { deletePersistedAssetBlob, persistAssetBlob } from './persistence';
import { parseAndMigrateEditorDoc } from './doc-schema';

const BACKUP_FORMAT = 'hangwork-editor-backup';
const BACKUP_VERSION = 1;

interface BackupAsset {
	id: string;
	filename: string;
	type: string;
	path: string;
}

interface BackupManifest {
	format: typeof BACKUP_FORMAT;
	version: typeof BACKUP_VERSION;
	savedAt: string;
	doc: EditorDoc;
	assets: BackupAsset[];
}

export interface PreparedEditorBackup {
	doc: EditorDoc;
	assets: Array<{ id: string; filename: string; blob: Blob }>;
}

function assetSlots(doc: EditorDoc): Array<{ id: string; filename: string }> {
	const slots: Array<{ id: string; filename: string }> = [];
	for (const entries of Object.values(doc.galleries))
		for (const entry of entries) if (entry.assetId) slots.push({ id: entry.assetId, filename: entry.filename });
	for (const slot of [
		doc.profileImage,
		doc.logoImage,
		doc.resumeFile,
		...Object.values(doc.pageThumbs),
		...Object.values(doc.productImages),
		...Object.values(doc.fonts),
	])
		if (slot?.assetId) slots.push({ id: slot.assetId, filename: slot.filename });
	return [...new Map(slots.map((slot) => [slot.id, slot])).values()];
}

function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a portable copy of the complete editable document. Kept separate from
 * the browser download so the archive format can be regression-tested. */
export async function buildEditorBackup(doc: EditorDoc): Promise<Uint8Array> {
	const tree: Record<string, Uint8Array> = {};
	const assets: BackupAsset[] = [];
	const slots = assetSlots(doc);
	for (let index = 0; index < slots.length; index++) {
		const slot = slots[index];
		const blob = getAssetBlob(slot.id);
		if (!blob)
			throw new Error(`“${slot.filename || 'An uploaded file'}” is missing from this browser. Re-upload it before making a backup.`);
		const path = `assets/${index + 1}`;
		tree[path] = new Uint8Array(await blob.arrayBuffer());
		assets.push({ id: slot.id, filename: slot.filename, type: blob.type, path });
	}
	const manifest: BackupManifest = {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		savedAt: new Date().toISOString(),
		doc: JSON.parse(JSON.stringify(doc)) as EditorDoc,
		assets,
	};
	tree['hangwork-backup.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
	return zipSync(tree, { level: 6 });
}

/** Download the complete editable document, including drafts and every browser-backed asset. */
export async function downloadEditorBackup(doc: EditorDoc): Promise<void> {
	const zipped = await buildEditorBackup(doc);
	const date = new Date().toISOString().slice(0, 10);
	download(new Blob([zipped as BlobPart], { type: 'application/zip' }), `hangwork-backup-${date}.zip`);
}

/** Read and fully validate a portable backup without changing browser storage or
 * the open document. The caller can create its safety version before importing. */
export async function readEditorBackup(file: File): Promise<PreparedEditorBackup> {
	let tree: Record<string, Uint8Array>;
	try {
		tree = unzipSync(new Uint8Array(await file.arrayBuffer()));
	} catch {
		throw new Error('That file is not a readable Hangwork backup ZIP.');
	}
	const manifestBytes = tree['hangwork-backup.json'];
	if (!manifestBytes) throw new Error('That ZIP does not contain a Hangwork backup.');
	let manifest: BackupManifest;
	try {
		manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
	} catch {
		throw new Error('The backup information is damaged and could not be read.');
	}
	if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION || !Array.isArray(manifest.assets))
		throw new Error('This backup format is not supported by this editor.');
	const doc = parseAndMigrateEditorDoc(manifest.doc);
	const expectedAssets = new Map(assetSlots(doc).map((slot) => [slot.id, slot.filename]));
	const seenAssets = new Set<string>();
	const seenPaths = new Set<string>();
	const restored: PreparedEditorBackup['assets'] = [];
	for (const asset of manifest.assets) {
		if (
			!asset ||
			typeof asset.id !== 'string' ||
			typeof asset.filename !== 'string' ||
			typeof asset.path !== 'string' ||
			typeof asset.type !== 'string'
		)
			throw new Error('The backup contains invalid file information.');
		if (seenAssets.has(asset.id)) throw new Error(`The backup lists “${asset.filename || 'a file'}” more than once.`);
		if (!/^assets\/[1-9]\d*$/.test(asset.path) || seenPaths.has(asset.path))
			throw new Error('The backup contains an invalid or repeated file location.');
		const expectedFilename = expectedAssets.get(asset.id);
		if (expectedFilename === undefined) throw new Error('The backup contains a file that is not used by its site document.');
		if (asset.filename !== expectedFilename) throw new Error('A file name in the backup does not match its site document.');
		seenAssets.add(asset.id);
		seenPaths.add(asset.path);
		const bytes = tree[asset.path];
		if (!bytes) throw new Error(`The backup is missing “${asset.filename}”.`);
		restored.push({
			id: asset.id,
			filename: asset.filename,
			blob: new Blob([bytes as BlobPart], { type: asset.type || 'application/octet-stream' }),
		});
	}
	for (const id of expectedAssets.keys())
		if (!seenAssets.has(id)) throw new Error('The backup is missing one or more uploaded files used by this site.');
	const allowedPaths = new Set(['hangwork-backup.json', ...seenPaths]);
	if (Object.keys(tree).some((path) => !allowedPaths.has(path)))
		throw new Error('The backup contains an unexpected file and was not opened.');
	return { doc, assets: restored };
}

function remapAssetIds(doc: EditorDoc, ids: ReadonlyMap<string, string>): EditorDoc {
	const next = JSON.parse(JSON.stringify(doc)) as EditorDoc;
	const remap = (id: string | null): string | null => (id ? (ids.get(id) ?? id) : null);
	for (const entries of Object.values(next.galleries))
		for (const entry of entries) entry.assetId = remap(entry.assetId);
	for (const slot of [
		next.profileImage,
		next.logoImage,
		next.resumeFile,
		...Object.values(next.pageThumbs),
		...Object.values(next.productImages),
		...Object.values(next.fonts),
	])
		if (slot) slot.assetId = remap(slot.assetId);
	return next;
}

/** Store a validated backup under fresh asset ids, then reveal all blobs to the
 * editor at once. Fresh ids ensure the current draft and its saved safety version
 * can never have their pixels replaced by an imported archive. */
export async function importEditorBackup(prepared: PreparedEditorBackup): Promise<EditorDoc> {
	const ids = new Map(prepared.assets.map((asset) => [asset.id, uid('backup')]));
	const staged: string[] = [];
	try {
		for (const asset of prepared.assets) {
			const id = ids.get(asset.id)!;
			await persistAssetBlob(id, asset.blob, asset.filename);
			staged.push(id);
		}
	} catch (error) {
		await Promise.allSettled(staged.map((id) => deletePersistedAssetBlob(id)));
		throw error;
	}
	for (const asset of prepared.assets)
		restoreAsset(ids.get(asset.id)!, asset.blob, asset.filename);
	return remapAssetIds(prepared.doc, ids);
}
