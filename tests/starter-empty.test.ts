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
// open. Strict mode demands zero survivors and is what spec 36 must make pass.
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

/** Survivors of the structure pass. Identical for all fourteen starters AND for blank. */
const BASELINE_STRUCTURE = [
	...SHELL_404,
	// Nav.tsx hamburger. Rendered even when the site has one unlabelled page.
	'assistive: Open site navigation',
];

/** Survivors of the fields pass, per starter. Everything here is renderer-supplied. */
const BASELINE_FIELDS: Record<string, string[]> = {
	__default__: [
		...SHELL_404,
		'assistive: Open site navigation',
		// Gallery.tsx lightbox trigger — the title is blank, so the label reads
		// "Open  in image viewer" with the hole where the artist's words were.
		'assistive: Open  in image viewer',
	],
	// ContactForm.tsx chrome that is still not an artist's to remove. Spec 36's
	// form-fields chunk closed the submit label, the "Required" marker and the
	// unavailable sentence (they are block fields now); what is left is the
	// CSS-hidden, aria-hidden honeypot label — editable words would weaken the
	// spam trap — and the form's accessible name when its heading is blank, which
	// is functional chrome of the same class as E3's "Open site navigation".
	conservatory: [
		'visible: Leave this field empty',
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
	// PortfolioPage.tsx childItemsFor(): `item.label || page.label || item.page`
	// falls all the way back to the raw page key once both labels are cleared.
	'works-on-paper': ['visible: figure-studies', 'visible: field-notes'],
};

const STRICT = process.env.HARNESS_STRICT === '1';

function assertSurvivors(strings: string[], allowed: string[]) {
	if (STRICT) expect(strings).toEqual([]);
	else expect(strings.filter((s) => !allowed.includes(s))).toEqual([]);
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
