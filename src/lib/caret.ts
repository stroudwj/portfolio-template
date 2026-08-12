// Caret bookkeeping for contenteditable surfaces. A rich-text editable is
// seeded from the model by writing innerHTML, which throws away the text node
// the caret lives in — so the caret lands back at the start of the box and the
// next keystrokes appear in front of the words. Measuring the caret as a plain
// character offset survives that rewrite: the offset means the same thing
// before and after, as long as the words do.

/** How many characters of `root` come before this DOM point. */
export function caretOffsetOf(root: Node, node: Node, offset: number): number {
	const doc = root.ownerDocument ?? (root as Document);
	const range = doc.createRange();
	range.selectNodeContents(root);
	try {
		range.setEnd(node, offset);
	} catch {
		// A point outside root (a stale node) measures as the whole box.
		return range.toString().length;
	}
	return range.toString().length;
}

export interface CaretOffsets {
	start: number;
	end: number;
}

/** The live selection as character offsets, or null when it is not inside root. */
export function caretOffsetsIn(root: HTMLElement): CaretOffsets | null {
	const selection = root.ownerDocument.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
	return {
		start: caretOffsetOf(root, range.startContainer, range.startOffset),
		end: caretOffsetOf(root, range.endContainer, range.endOffset),
	};
}

/** The DOM point that sits `offset` characters into root, clamped to its end. */
function pointAt(root: HTMLElement, offset: number): { node: Node; offset: number } {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let seen = 0;
	let last: { node: Node; offset: number } = { node: root, offset: 0 };
	let text = walker.nextNode();
	while (text) {
		const length = text.textContent?.length ?? 0;
		if (offset <= seen + length) return { node: text, offset: offset - seen };
		seen += length;
		last = { node: text, offset: length };
		text = walker.nextNode();
	}
	return last;
}

/** Put the selection back where `caretOffsetsIn` found it. */
export function restoreCaretIn(root: HTMLElement, offsets: CaretOffsets): void {
	const doc = root.ownerDocument;
	const selection = doc.getSelection();
	if (!selection) return;
	const from = pointAt(root, offsets.start);
	const to = offsets.end === offsets.start ? from : pointAt(root, offsets.end);
	const range = doc.createRange();
	range.setStart(from.node, from.offset);
	range.setEnd(to.node, to.offset);
	selection.removeAllRanges();
	selection.addRange(range);
}
