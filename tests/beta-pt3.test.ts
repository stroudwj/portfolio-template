// Spec 33 — three beta findings, one contract each.
//
// A. Text added to a brand-new section was invisible in the editor canvas: the
//    motion runtime scans `[data-motion-effect]` once, and a section that
//    mounts after that scan is never observed, so the reveal rule holds it at
//    opacity 0 forever. The runtime now adopts late arrivals as already
//    entered. (Published pages never insert sections, so their choreography is
//    unchanged — the markup assertions below hold that line.)
// B. The section-boundary toggle defaults ON, and an explicit off still sticks.
// C. Layers and Add block live in the preview toolbar, not floating over the
//    site's own navigation.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Content } from '../src/lib/content';
import { blankContent, cloneContent } from '../src/editor/lib/content-init';
import Portfolio from '../src/portfolio/Portfolio';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const motionRuntime = read('src/portfolio/SectionMotion.tsx');
const motionCss = read('src/portfolio/SectionMotion.css');
const editLayer = read('src/editor/components/PreviewEditLayer.tsx');
const previewPanel = read('src/editor/components/PreviewPanel.tsx');
const controls = read('src/editor/components/ui/controls.tsx');
const editorCss = read('src/editor/editor.css');

describe('A — sections that arrive after the motion runtime started (spec 33)', () => {
	it('hides a reveal section only while the runtime owns it', () => {
		// The bug's mechanism: this rule is what an unobserved section is stuck
		// behind. It must stay gated on the runtime-ready class and .motion-visible
		// so the adoption below is the only thing standing between a late section
		// and being seen.
		const hide = motionCss.match(
			/\.motion-runtime-ready \.motion-effect-reveal:not\(\.motion-disabled\) > \.motion-section-inner \{[^}]+\}/,
		)?.[0];
		expect(hide).toBeDefined();
		expect(hide).toMatch(/opacity:\s*0/);
		expect(motionCss).toMatch(
			/\.motion-runtime-ready \.motion-effect-reveal\.motion-visible > \.motion-section-inner \{[^}]*opacity:\s*1/,
		);
	});

	it('watches the page root for sections that mount later', () => {
		expect(motionRuntime).toMatch(/const adopt = new win\.MutationObserver\(/);
		expect(motionRuntime).toMatch(/adopt\.observe\(root, \{ childList: true, subtree: true \}\)/);
	});

	it('adopts each late arrival as entered, guarded, and scheduled', () => {
		const adopt = motionRuntime.match(/const adopt = new win\.MutationObserver\([\s\S]*?\n\t\t\}\);/)?.[0];
		expect(adopt).toBeDefined();
		// Visible immediately — an insertion into a live page is an edit, not a
		// scroll entrance — plus the class guard and the continuous-scene pass.
		expect(adopt).toMatch(/markEntered\(arrival\)/);
		expect(adopt).toMatch(/watch\(arrival\)/);
		expect(adopt).toMatch(/schedule\(\)/);
		expect(adopt).toMatch(/tracked\.has\(arrival\)/);
	});

	it('stops tracking sections the editor removed', () => {
		expect(motionRuntime).toMatch(/root\.contains\(sections\[i\]\)/);
	});

	it('never leaves the observer running after the page changes', () => {
		const cleanup = motionRuntime.match(/return \(\) => \{[\s\S]*?\n\t\t\};/)?.[0];
		expect(cleanup).toMatch(/adopt\.disconnect\(\)/);
		expect(cleanup).toMatch(/classGuard\.disconnect\(\)/);
	});

	it('keeps scanning even when the page starts with no motion sections', () => {
		// A page can gain its first motion section (an empty page, then one added).
		// The old early return left nothing behind to notice.
		expect(motionRuntime).not.toMatch(/if \(!sections\.length\) return;/);
	});

	it('publishes the new section like any other — the runtime scans it on load', () => {
		// The published path (staticgen renders this same <Portfolio> with
		// renderToString) never inserts a section after mount, so the first scan
		// covers it. What must hold is that the section reaches the HTML at all,
		// carrying its scene and its words, with nothing pre-hidden.
		const content = withSecondSection();
		const markup = renderToStaticMarkup(
			createElement(Portfolio, {
				page: 'home',
				base: '/',
				content,
				galleries: { 'selected-works': [], art: [], photography: [] },
			}),
		);
		expect(markup).toContain('A brand new section');
		expect(markup).toContain('data-preview-part="section:added"');
		expect(markup.match(/data-motion-effect="reveal"/g)?.length).toBeGreaterThanOrEqual(2);
		expect(markup).not.toContain('motion-runtime-ready');
		expect(markup).not.toContain('motion-visible');
	});
});

/** A home page with a second section added after the first — the shape the
 *  editor commits when an artist picks "New section" for a text block. */
function withSecondSection(): Content {
	const content = cloneContent(blankContent);
	content.theme.motion = { intensity: 'subtle' };
	const home = content.pages.home;
	const existing = (home.blocks ?? []).map((block) => block.id);
	home.blocks = [
		...(home.blocks ?? []),
		{ id: 'added-text', type: 'text', text: 'A brand new section' },
	];
	home.sections = [
		{ id: 'main', name: 'Main section', blockIds: existing },
		{ id: 'added', name: 'Section 2', blockIds: ['added-text'] },
	];
	return content;
}

describe('B — section boundaries default on (spec 33)', () => {
	const loadPrefs = async (stored: string | null) => {
		vi.resetModules();
		const storage = { getItem: () => stored, setItem: () => {} };
		vi.stubGlobal('window', { localStorage: storage });
		const module = await import('../src/portfolio/gridPrefs');
		const prefs = module.getGridPrefs();
		vi.unstubAllGlobals();
		return prefs;
	};

	it('is on for a browser that has never touched the toggle', async () => {
		expect((await loadPrefs(null)).sectionEdges).toBe(true);
	});

	it('is on for prefs saved before the toggle existed', async () => {
		expect((await loadPrefs(JSON.stringify({ guide: 'off', snap: true }))).sectionEdges).toBe(true);
	});

	it('stays off once the artist explicitly turned it off', async () => {
		expect(
			(await loadPrefs(JSON.stringify({ guide: 'off', sectionEdges: false }))).sectionEdges,
		).toBe(false);
	});

	it('is on wherever the default is spelled out', async () => {
		vi.resetModules();
		const module = await import('../src/portfolio/gridPrefs');
		// No window at all (server render) — still on.
		expect(module.getGridPrefs().sectionEdges).toBe(true);
		const source = read('src/portfolio/gridPrefs.ts');
		expect(source.match(/sectionEdges: true/g)?.length).toBe(3);
		expect(source).toMatch(/sectionEdges: parsed\.sectionEdges !== false/);
	});
});

describe('C — page-structure tools live in the preview toolbar (spec 33)', () => {
	it('leaves no floating dock over the page', () => {
		expect(editLayer).not.toMatch(/pv-dock/);
		expect(editorCss).not.toMatch(/\.pv-dock/);
	});

	it('puts both buttons in the toolbar in the toolbar icon style', () => {
		for (const [label, title] of [
			['Show the layers list for this page', 'Layers — every block on this page'],
			['Add a block to this page', 'Add a block to this page'],
		]) {
			const button = previewPanel.match(
				new RegExp(`<button[^>]*?aria-label="${label}"[\\s\\S]{0,220}?</button>`),
			)?.[0];
			expect(button, label).toBeDefined();
			expect(button).toMatch(/className=\{`preview-tool-button/);
			expect(button).toContain(`title="${title}"`);
			expect(button).toMatch(/<PanelIcon type="(layers|plus)" \/>/);
		}
	});

	it('carries the click into the preview iframe and the open state back out', () => {
		expect(previewPanel).toMatch(/togglePreviewStructureTool\('layers'\)/);
		expect(previewPanel).toMatch(/togglePreviewStructureTool\('add-block'\)/);
		expect(previewPanel).toMatch(/usePreviewStructureState\(\)/);
		expect(editLayer).toMatch(/onTogglePreviewStructureTool\(/);
		expect(editLayer).toMatch(/setPreviewStructureState\(\{ layers: layersOpen, addBlock: !!picker \}\)/);
		expect(controls).toMatch(/export function togglePreviewStructureTool/);
		expect(controls).toMatch(/export function usePreviewStructureState/);
	});

	it('still closes on Escape when the click came from the toolbar', () => {
		const outside = editLayer.match(
			/useEffect\(\(\) => \{\n\t\tif \(!picker && !layersOpen\) return;[\s\S]*?\}, \[picker, layersOpen\]\);/,
		)?.[0];
		expect(outside).toBeDefined();
		expect(outside).toMatch(/document\.addEventListener\('keydown', onKey\)/);
		expect(outside).toMatch(/document\.removeEventListener\('keydown', onKey\)/);
	});

	it('anchors the cards the dock used to sit above at the frame edge', () => {
		for (const selector of ['\\.pv-layers', '\\.pv-picker-docked']) {
			const rule = editorCss.match(new RegExp(`${selector} \\{[^}]+\\}`))?.[0];
			expect(rule).toMatch(/top:\s*12px/);
		}
	});
});
