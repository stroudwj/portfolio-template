// Spec 26: an open block card in the Pages panel caps its body at roughly the
// panel height available and scrolls inside itself — one clear scroll region
// under a head that stays in reach — with a keyboard-reachable grip at the
// card's foot to resize it, remembered per browser session. These checks lock
// that contract: every renderBlock card wraps its body in BlockBody, the body
// is the capped scroll region, the spec 16 Compact/Details heading re-anchors
// to the body's own scrollport, and the grip stays quiet (--wall-2 at rest,
// Klein only under pointer or focus).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
	new URL('../src/editor/components/PageEditor.tsx', import.meta.url),
	'utf8',
);
const editorCss = readFileSync(new URL('../src/editor/editor.css', import.meta.url), 'utf8');

describe('block editor sizing (spec 26)', () => {
	it('wraps every block card body in BlockBody', () => {
		const cardOpens = componentSource.match(
			/<div className="block(?: [\w-]+)*" key=\{block\.id\}>/g,
		);
		const bodyOpens = componentSource.match(/<BlockBody blockId=\{block\.id\}/g);
		const bodyCloses = componentSource.match(/<\/BlockBody>/g);
		expect(cardOpens?.length ?? 0).toBeGreaterThan(0);
		expect(bodyOpens?.length ?? 0).toBe(cardOpens?.length ?? 0);
		expect(bodyCloses?.length ?? 0).toBe(cardOpens?.length ?? 0);
	});

	it('caps the body as the one scroll region', () => {
		const rule = editorCss.match(/\.block-body\s*\{[^}]+\}/)?.[0];
		expect(rule).toBeDefined();
		expect(rule).toMatch(/max-height:/);
		expect(rule).toMatch(/overflow-y:\s*auto/);
	});

	it('re-anchors the sticky Compact/Details heading inside the body scrollport', () => {
		expect(editorCss).toMatch(/\.block-body \.image-list-heading\s*\{[^}]*top:\s*0/);
	});

	it('keeps the resize grip quiet and keyboard-reachable', () => {
		const rest = editorCss.match(/\.block-body-resizer::after\s*\{[^}]+\}/)?.[0];
		expect(rest).toBeDefined();
		expect(rest).toMatch(/var\(--wall-2\)/);
		expect(rest).not.toMatch(/--klein/);
		const active = editorCss.match(
			/\.block-body-resizer:hover::after,\s*\.block-body-resizer:focus-visible::after\s*\{[^}]+\}/,
		)?.[0];
		expect(active).toMatch(/var\(--klein\)/);
		expect(componentSource).toMatch(
			/className="block-body-resizer"[\s\S]{0,400}?role="separator"/,
		);
		expect(componentSource).toMatch(/className="block-body-resizer"[\s\S]{0,600}?tabIndex=\{0\}/);
	});

	it('remembers a chosen size for the session only', () => {
		expect(componentSource).toContain("'portfolio-editor.block-body-heights'");
		expect(componentSource).toMatch(/sessionStorage\.setItem\(\s*BLOCK_BODY_HEIGHT_STORE/);
		// Chrome, not document: block heights must never be written into the doc.
		expect(componentSource).not.toMatch(/commitDoc\([^)]*blockBodyHeight/);
	});
});
