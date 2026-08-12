// Spec 34: the page is the only place text content is edited. The panel card
// keeps the settings and hands the caret back; the floating chrome has to be
// there whenever a text box is selected; and nothing may rewrite the words
// under a live caret. Each check below locks a failure that was reproduced in
// the running editor before it was fixed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TextBlock from '../src/portfolio/TextBlock';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pageEditor = source('src/editor/components/PageEditor.tsx');
const previewEditLayer = source('src/editor/components/PreviewEditLayer.tsx');
const previewPanel = source('src/editor/components/PreviewPanel.tsx');
const richTextEditor = source('src/editor/components/RichTextEditor.tsx');
const inlineTextEditor = source('src/portfolio/InlineTextEditor.tsx');

describe('A: the text card carries settings, not a copy of the words', () => {
	it('has no content editor of its own', () => {
		// A second editable bound to the same block is a second writer: while the
		// caret was live on the page, every keystroke in the panel re-seeded the
		// page's editable from the store.
		expect(pageEditor).not.toContain('RichTextEditor');
		expect(pageEditor).not.toContain('updateRichTextBlock');
	});

	it('points at the page instead, and keeps the block settings', () => {
		const card = pageEditor.slice(
			pageEditor.indexOf("case 'text': {"),
			pageEditor.indexOf("case 'embed': {"),
		);
		expect(card).toContain('editTextOnPage(pageKey, block.id)');
		expect(card).toContain('Edit text on the page');
		for (const setting of ['setTextFont', 'setTextBackground', 'setTextKinetic', 'setTextLink'])
			expect(card).toContain(setting);
	});

	it('no longer tells the artist to select words "above"', () => {
		expect(pageEditor).not.toContain('select them above');
	});
});

describe('B: a selected text box always has its floating chrome', () => {
	it('measures the selected block by any marker, not only a flow boundary', () => {
		// Every text block is created pinned to the canvas, and pinned blocks have
		// no `.preview-block-boundary` — measuring only that left the toolbar
		// unrendered for the whole class.
		expect(previewEditLayer).toContain('anyBlockRect(selectedBlock.id)');
		expect(previewEditLayer).not.toMatch(/selectedBlock \? blockRect\(/);
	});

	it('keeps the selection outside the layer, which unmounts constantly', () => {
		expect(previewEditLayer).not.toMatch(/const \[selectedId, setSelectedId\] = useState/);
		expect(previewEditLayer).toContain('onSelectedIdChange: setSelectedId');
		expect(previewPanel).toContain('const [selectedBlockId, setSelectedBlockId] = useState');
		expect(previewPanel).toContain('selectedId={selectedBlockId}');
		expect(previewPanel).toContain('onSelectedIdChange={setSelectedBlockId}');
	});

	it('gives an empty text box a footprint in the editor, and none once published', () => {
		const published = renderToStaticMarkup(<TextBlock text="" />);
		expect(published).toBe('');

		const inEditor = renderToStaticMarkup(<TextBlock text="" editorPreview />);
		expect(inEditor).toContain('text-block-empty');
		expect(inEditor).toContain('double-click to write');

		// Words always win over the placeholder, in both builds.
		expect(renderToStaticMarkup(<TextBlock text="Hung" editorPreview />)).not.toContain(
			'text-block-empty',
		);
	});
});

describe('C: nothing rewrites the words under a live caret', () => {
	it('announces the toolbar’s own rewrite so the editable records it', () => {
		// execCommand fires `input`; the size tools then keep editing the DOM
		// afterwards. An editable that never hears about that second edit treats
		// the resulting model as somebody else's and re-seeds itself from it.
		const applyPointSize = richTextEditor.slice(
			richTextEditor.indexOf('const applyPointSize'),
			richTextEditor.indexOf('const editLink'),
		);
		expect(applyPointSize).toContain("dispatchEvent(new view.Event('input', { bubbles: true }))");
		// Built in the editable's own realm — the in-place editor lives in the
		// preview iframe, where a parent-realm event reaches no listener.
		expect(applyPointSize).toContain('editor.ownerDocument.defaultView');
		expect(applyPointSize.indexOf('dispatchEvent')).toBeLessThan(applyPointSize.indexOf('onEmit()'));
	});

	it('puts the caret back when a re-seed does land mid-edit', () => {
		const seed = inlineTextEditor.slice(
			inlineTextEditor.indexOf('useEffect(() => {'),
			inlineTextEditor.indexOf('// Entering edit mode'),
		);
		expect(seed).toContain('caretOffsetsIn(editor)');
		expect(seed).toContain('restoreCaretIn(editor, caret)');
		// Measured before the rewrite, restored after it.
		expect(seed.indexOf('caretOffsetsIn')).toBeLessThan(seed.indexOf('editor.innerHTML ='));
		expect(seed.indexOf('editor.innerHTML =')).toBeLessThan(seed.indexOf('restoreCaretIn'));
		// The echo guard stays: our own edits must not re-seed at all.
		expect(seed).toContain('lastEmittedRef.current === signature');
	});
});
