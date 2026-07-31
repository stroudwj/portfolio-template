import type { PageConfig, PageSection } from './content';

export const MAIN_SECTION_ID = 'main';
/** UI-only destination understood by block insertion/move commands. */
export const NEW_SECTION_ID = '__new-section__';

export const SECTION_EDITOR_COLORS = [
	'#3157c8',
	'#c44f36',
	'#25836f',
	'#8a4fb0',
	'#b57614',
	'#397eaa',
	'#a84472',
	'#5f7d2d',
] as const;

/** Defensive normalization for typed callers and hand-authored extension data.
 * The schema already guarantees this shape at persistence boundaries. */
export function pageSections(page: PageConfig): PageSection[] {
	const blocks = page.blocks ?? [];
	const validBlockIds = new Set(blocks.map((block) => block.id));
	const assigned = new Set<string>();
	const sections = (page.sections ?? []).flatMap((section, index) => {
		const blockIds = section.blockIds.filter((id) => {
			if (!validBlockIds.has(id) || assigned.has(id)) return false;
			assigned.add(id);
			return true;
		});
		return [{
			...section,
			name: section.name.trim() || 'Untitled section',
			blockIds,
			editorColor:
				section.editorColor ??
				SECTION_EDITOR_COLORS[index % SECTION_EDITOR_COLORS.length],
		}];
	});
	const unassigned = blocks.map((block) => block.id).filter((id) => !assigned.has(id));
	if (!sections.length)
		return [{
			id: MAIN_SECTION_ID,
			name: 'Main section',
			blockIds: unassigned,
			editorColor: SECTION_EDITOR_COLORS[0],
		}];
	if (unassigned.length) {
		const main = sections.find((section) => section.id === MAIN_SECTION_ID) ?? sections[0];
		main.blockIds = [...main.blockIds, ...unassigned];
	}
	return sections;
}

export const sectionPartKey = (sectionId: string): string => `section:${sectionId}`;

export function sectionEditorColor(section: PageSection, index: number): string {
	return section.editorColor ?? SECTION_EDITOR_COLORS[index % SECTION_EDITOR_COLORS.length];
}

export function sectionForBlock(page: PageConfig, blockId: string): PageSection | undefined {
	return pageSections(page).find((section) => section.blockIds.includes(blockId));
}
