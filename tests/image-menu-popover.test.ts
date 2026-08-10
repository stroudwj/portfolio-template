// The per-image "…" menu portals out of the Pages panel so reorder actions
// can't shift the buttons mid-click. Every editor design token (the popover's
// opaque --paper background included) is scoped to the `.editor` element, so a
// portal mounted on bare document.body renders see-through and unstyled over
// the rows behind it (spec 30). These checks lock both halves of that contract.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
	new URL('../src/editor/components/ImageCollectionEditor.tsx', import.meta.url),
	'utf8',
);
const editorCss = readFileSync(new URL('../src/editor/editor.css', import.meta.url), 'utf8');

describe('image card actions menu popover', () => {
	it('mounts its portal inside the editor token scope', () => {
		expect(componentSource).toContain(".closest('.editor') ?? document.body");
		expect(componentSource).toContain('position.host,');
		expect(componentSource).not.toMatch(/createPortal\(\s*<div[\s\S]*?\/div>,\s*document\.body/);
	});

	it('keeps the popover surface opaque via the token background', () => {
		const rule = editorCss.match(/\.image-card-actions-popover\s*\{[^}]+\}/)?.[0];
		expect(rule).toBeDefined();
		expect(rule).toMatch(/position:\s*fixed/);
		expect(rule).toMatch(/background:\s*var\(--paper\)/);
	});
});
