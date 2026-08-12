// Spec 35, direction "template → blank": every starter must be emptiable back to
// a blank document through the editor's own controls, with nothing left behind.
//
// The harness lives in `tests/starter-empty-harness.ts` — read its header first.
// This file is the acceptance test around it:
//
//   npx vitest run tests/starter-empty.test.ts                   # baseline mode (default)
//   HARNESS_STRICT=1 npx vitest run tests/starter-empty.test.ts  # spec 36's goal
//
// Baseline mode asserts survivors are a subset of the recorded baselines below —
// the audit's honest picture of today, so `npm test` stays green while the debt is
// open. Strict mode demands no survivors beyond PRODUCT_CHROME (the strings kept
// on purpose: 404 shell, hamburger, lightbox trigger) and is what spec 36 must pass.
// Fixing a survivor means deleting its line from the baseline as well; a NEW
// survivor fails the test in either mode, which is the regression guard.
//
// Two passes, because they catch different bugs:
//   structure — delete every page but home, every section, block and image, then
//               blank the site fields. Survivors are text nothing can remove.
//   fields    — keep the starter's structure, blank only the strings. Survivors
//               are text the RENDERER supplies once a field is empty: component
//               defaults, empty-state copy, fallback labels. Invisible to greps.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankContent } from '../src/editor/lib/content-init';
import { emptyAndPublish, starterContent, starterIds } from './starter-empty-harness';

/**
 * Text the 404 shell hardcodes in `staticgen/site.ts`. Every published site gets
 * it, including one built from a blank document, so it is not starter debt — but
 * it is still text an artist cannot reach. Spec 36 decides whether to make it
 * editable or to accept it as product chrome.
 */
const SHELL_404 = [
	'assistive: — Page not found',
	'visible: Back to the home page',
	'visible: Page not found',
	'visible: That page doesn’t exist here (anymore).',
];

/**
 * Text that is **product chrome, not content** — the names of controls the site
 * ships whether or not the artist wrote anything, kept deliberately (spec 36:
 * audit rows E1, E3, E2's landing place). Nothing here stands in for artist
 * words: each one names what a control *does*, and each survives on a blank
 * document too. Strict mode tolerates exactly this list and nothing else.
 */
const PRODUCT_CHROME = [
	...SHELL_404, // E1 — 404 shell copy; William's product decision, kept as chrome.
	// E3 — Nav.tsx hamburger. Rendered even when the site has one unlabelled page.
	'assistive: Open site navigation',
	// E2 — Gallery/CanvasGallery lightbox trigger. The artist's image title names
	// the button when there is one; with every caption cleared it falls back to the
	// control's function, not to template copy (it used to read "Open  in image
	// viewer", with a hole where the words had been).
	'assistive: Open image in image viewer',
	// E4 remainder — ContactForm.tsx chrome that is deliberately not an artist's to
	// remove: the CSS-hidden, aria-hidden honeypot label (editable words would
	// weaken the spam trap) and the form's accessible name when its heading is
	// blank, functional chrome of the same class as the hamburger label.
	'visible: Leave this field empty',
	'assistive: Contact form',
	// E5-aria — Gallery.tsx carousel arrows and their aria labels. Functional
	// chrome, kept; the wording remains William's open product decision (the
	// visible "1 / 4" counter is NOT here — the "Number count" checkbox turns it
	// off and the harness uses it).
	'visible: ‹',
	'visible: ›',
	'assistive: carousel',
	'assistive: Show previous image',
	'assistive: Show next image',
];

/** Survivors of the structure pass. Identical for every starter AND for blank. */
const BASELINE_STRUCTURE = [...PRODUCT_CHROME];

/** Survivors of the fields pass, per starter. Everything here is renderer-supplied. */
const BASELINE_FIELDS: Record<string, string[]> = {
	// Spec 36 closed every per-starter row: what each starter's fields pass leaves
	// behind is now exactly the accepted product chrome above, nothing else. A new
	// entry here means a new fallback crept into the renderer — fix it, don't
	// baseline it.
	__default__: [...PRODUCT_CHROME],
};

const STRICT = process.env.HARNESS_STRICT === '1';

function assertSurvivors(strings: string[], allowed: string[]) {
	// Strict mode is spec 36's bar: nothing survives except the accepted product
	// chrome above. Baseline mode additionally tolerates the debt still open.
	expect(strings.filter((s) => !(STRICT ? PRODUCT_CHROME : allowed).includes(s))).toEqual([]);
}

describe('empty harness — a starter must be emptiable to a blank document', () => {
	// Publish fetches the hydration runtime and the bundled starter font faces from
	// the editor deployment. Neither is text; stub them the way staticgen.test.ts does.
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('/* stub */', { status: 200 })),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('the blank document is itself no cleaner than the emptied starters', async () => {
		const result = await emptyAndPublish('__blank__', blankContent);
		expect(result.files).toContain('index.html');
		assertSurvivors(result.strings, BASELINE_STRUCTURE);
	});

	describe('structure pass — nothing survives deleting everything', () => {
		for (const id of starterIds()) {
			it(id, async () => {
				const result = await emptyAndPublish(id, starterContent(id));
				// Every page but home is deletable, so exactly home + the 404 remain.
				expect(result.files).toEqual(['404.html', 'index.html']);
				assertSurvivors(result.strings, BASELINE_STRUCTURE);
			});
		}
	});

	describe('fields pass — nothing survives blanking every string in place', () => {
		for (const id of starterIds()) {
			it(id, async () => {
				const result = await emptyAndPublish(id, starterContent(id), {
					mode: 'fields',
					keepImages: true,
				});
				assertSurvivors(result.strings, [
					...BASELINE_FIELDS.__default__,
					...(BASELINE_FIELDS[id] ?? []),
				]);
			});
		}
	});
});

// Spec 36, chunk 4 — the small missing fields. The harness proves what survives a
// publish; these lock the controls that clear them, which no published HTML shows.
describe('spec 36 — the fields behind the audit’s small rows', () => {
	const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

	it('E6b: a sub-page card label can be emptied — only an unchanged value reverts', () => {
		const childPages = source('src/portfolio/ChildPages.tsx');
		expect(childPages).toContain('if (next !== item.label) onEditLabel(');
		// The old guard (`if (next && …`) silently restored the template's word.
		expect(childPages).not.toContain('if (next && next !== item.label)');
	});

	it('E8: the résumé link label is a field, and no code resurrects the default', () => {
		const about = source('src/editor/components/AboutContentEditor.tsx');
		expect(about).toContain('setResumeLabel');
		expect(about).toContain('Résumé link text');
		// `||` would treat a cleared label as "unset" and hand back "Résumé".
		for (const file of ['src/editor/store.tsx', 'src/portfolio/PortfolioPage.tsx'])
			expect(source(file)).not.toContain("label || 'Résumé'");
	});

	it('E5: the carousel’s number counter has an off switch', () => {
		expect(source('src/editor/components/PageEditor.tsx')).toContain('carouselShowCount: event.target.checked ? undefined : false');
		expect(source('src/portfolio/Gallery.tsx')).toContain('settings?.carouselShowCount !== false');
	});

	it('B6: a section can be renamed from the page editor', () => {
		expect(source('src/editor/components/PageEditor.tsx')).toContain('editor.renameSection(pageKey, section.id, name)');
	});
});
