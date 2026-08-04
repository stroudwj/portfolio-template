export interface WorkbenchSelectionModifiers {
	shiftKey?: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
}

/**
 * Finder-style card selection shared by the full workbench and its image-group
 * picker. Shift adds, Command/Ctrl toggles, and an unmodified click starts a
 * fresh selection.
 */
export const selectWorkbenchItem = (
	current: ReadonlySet<string>,
	id: string,
	modifiers: WorkbenchSelectionModifiers,
) => {
	if (modifiers.shiftKey) {
		const next = new Set(current);
		next.add(id);
		return next;
	}
	if (modifiers.metaKey || modifiers.ctrlKey) {
		const next = new Set(current);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}
	return new Set([id]);
};

/** Select the inclusive Finder-style range between an anchor and a target. */
export const selectWorkbenchRange = (
	current: ReadonlySet<string>,
	orderedIds: readonly string[],
	anchorId: string,
	targetId: string,
	additive = false,
) => {
	const anchorIndex = orderedIds.indexOf(anchorId);
	const targetIndex = orderedIds.indexOf(targetId);
	if (anchorIndex < 0 || targetIndex < 0)
		return selectWorkbenchItem(current, targetId, { shiftKey: true });
	const next = additive ? new Set(current) : new Set<string>();
	const start = Math.min(anchorIndex, targetIndex);
	const end = Math.max(anchorIndex, targetIndex);
	for (let index = start; index <= end; index += 1) next.add(orderedIds[index]);
	return next;
};

/** Shift/Command/Ctrl-drag adds the marquee hits to the existing selection. */
export const workbenchMarqueeBase = (
	current: ReadonlySet<string>,
	modifiers: WorkbenchSelectionModifiers,
) =>
	modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey
		? new Set(current)
		: new Set<string>();
