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
];

/** Survivors of the structure pass. Identical for all fourteen starters AND for blank. */
const BASELINE_STRUCTURE = [...PRODUCT_CHROME];

/** Survivors of the fields pass, per starter. Everything here is renderer-supplied. */
const BASELINE_FIELDS: Record<string, string[]> = {
	__default__: [...PRODUCT_CHROME],
	// ContactForm.tsx defaults: the submit label, the honeypot label, the
	// per-field "Required" chip and the unavailable-state sentence.
	conservatory: [
		'visible: Continue in email',
		'visible: Leave this field empty',
		'visible: Required',
		'visible: This contact form isn’t ready yet. Please use another way to get in touch.',
		'assistive: Contact form',
	],
	// Gallery.tsx carousel chrome: arrows, the "1 / 4" counter and its aria labels.
	photographer: [
		'visible: ‹',
		'visible: ›',
		'visible: 1 / 4',
		'assistive: carousel',
		'assistive: Show previous image',
		'assistive: Show next image',
		'assistive: Image 1 of 4',
	],
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
