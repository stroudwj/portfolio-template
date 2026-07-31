import type { EditorDoc } from './types';

export const WORKBENCH_FOLDER = '__hangwork_workbench__';
export const IMAGE_TRANSFER_TYPE = 'application/x-hangwork-image';

export interface ImageTransferPayload {
	sourceFolder: string;
	entryId: string;
	/** Workbench drags copy; image-group drags move unless the caller overrides it. */
	move: boolean;
}

export interface ImageGroupTarget {
	folder: string;
	label: string;
}

export function writeImageTransfer(
	dataTransfer: DataTransfer,
	payload: ImageTransferPayload,
): void {
	dataTransfer.effectAllowed = payload.move ? 'move' : 'copy';
	dataTransfer.setData(IMAGE_TRANSFER_TYPE, JSON.stringify(payload));
	dataTransfer.setData('text/plain', payload.entryId);
}

export function readImageTransfer(
	dataTransfer: DataTransfer,
): ImageTransferPayload | null {
	const raw = dataTransfer.getData(IMAGE_TRANSFER_TYPE);
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<ImageTransferPayload>;
		if (
			typeof value.sourceFolder !== 'string' ||
			typeof value.entryId !== 'string'
		)
			return null;
		return {
			sourceFolder: value.sourceFolder,
			entryId: value.entryId,
			move: value.move === true,
		};
	} catch {
		return null;
	}
}

/** Every published image group, named by page and block so destinations are clear. */
export function imageGroupTargets(doc: EditorDoc): ImageGroupTarget[] {
	const targets: ImageGroupTarget[] = [];
	const seen = new Set<string>();
	for (const [pageKey, page] of Object.entries(doc.content.pages)) {
		const pageName = page.label || (pageKey === 'home' ? 'Home' : pageKey);
		if (page.gallery && !seen.has(page.gallery.folder)) {
			seen.add(page.gallery.folder);
			targets.push({ folder: page.gallery.folder, label: `${pageName} — Main images` });
		}
		for (const block of page.blocks ?? []) {
			if (block.type !== 'images' || seen.has(block.gallery.folder)) continue;
			seen.add(block.gallery.folder);
			targets.push({
				folder: block.gallery.folder,
				label: `${pageName} — ${block.name || 'Image group'}`,
			});
		}
	}
	return targets;
}
