// Spec 36 chunk 3 (audit rows B4/B5): every font stack a starter or theme preset
// uses must be reachable *by name* from a blank document, and picking a bundled
// face must install it so the real woff2 renders in preview and publish.
import { describe, expect, it, vi } from 'vitest';
import type { Content, Theme } from '../src/lib/content';
import { docToPortfolioData, initDocFromContent } from '../src/editor/lib/content-init';
import { buildBundle } from '../src/editor/lib/exporter';
import { generateStaticSite } from '../src/editor/lib/staticgen/site';
import {
	FONT_OPTIONS,
	faceForFontValue,
	fontChoicePatch,
	fontOptionsForTheme,
	resolveFontValue,
} from '../src/editor/lib/font-options';
import { STARTER_FONT_FACES, starterFontForCustomFont } from '../src/editor/lib/starter-fonts';
import { AVAILABLE_STARTERS, STARTER_RECIPES, THEME_PRESETS } from '../src/editor/lib/templates';

/** Every catalog starter declares a bundled face (spec 37 retired the ones that
 * did not), so the blank-document case is a catalog starter with its fonts
 * stripped: nothing installed, exactly as a document started from blank. */
const fontlessContent = (): Content => {
	const clearing = AVAILABLE_STARTERS.find((starter) => starter.id === 'clearing')!.content;
	return { ...clearing, theme: { ...clearing.theme, customFonts: undefined } };
};

/** A document with nothing installed — the blank-document case the audit measured. */
const blankTheme = (): Theme =>
	({ fontFamily: FONT_OPTIONS[0].value, textColor: '#000', backgroundColor: '#fff' }) as Theme;

function collectStacks(value: unknown, where: string, into: Map<string, Set<string>>): void {
	if (!value || typeof value !== 'object') return;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if ((key === 'fontFamily' || key === 'headingFontFamily') && typeof child === 'string') {
			if (!child.trim()) continue;
			if (!into.has(child)) into.set(child, new Set());
			into.get(child)!.add(where);
		} else collectStacks(child, where, into);
	}
}

const starterStacks = (): Map<string, Set<string>> => {
	const stacks = new Map<string, Set<string>>();
	for (const recipe of STARTER_RECIPES)
		collectStacks(recipe.content as unknown as Content, `starter:${recipe.id}`, stacks);
	for (const preset of THEME_PRESETS) collectStacks(preset.tokens, `preset:${preset.id}`, stacks);
	return stacks;
};

describe('font menu', () => {
	it('names every font stack the starters and theme presets use', () => {
		const options = fontOptionsForTheme(blankTheme());
		const unreachable = [...starterStacks()]
			.filter(([stack]) => !resolveFontValue(options, stack))
			.map(([stack, sources]) => `${stack} (${[...sources].join(', ')})`);
		expect(unreachable).toEqual([]);
	});

	it('round-trips: every menu entry resolves to itself', () => {
		const options = fontOptionsForTheme(blankTheme());
		for (const option of options) expect(resolveFontValue(options, option.value)).toBe(option.value);
	});

	it('offers each bundled face exactly once, and only faces in the spec-23 registry', () => {
		const offered = FONT_OPTIONS.flatMap((option) => (option.family ? [option.family] : []));
		expect([...offered].sort()).toEqual([...STARTER_FONT_FACES.map((f) => f.family)].sort());
	});

	it('installs a bundled face when it is picked from a blank document', () => {
		for (const face of STARTER_FONT_FACES) {
			const option = FONT_OPTIONS.find((entry) => entry.family === face.family)!;
			expect(faceForFontValue(option.value)).toBe(face);
			const patch = fontChoicePatch(blankTheme(), option.value);
			expect(patch.customFonts).toEqual([
				{ name: face.family, file: face.file, weight: face.weight },
			]);
			// The installed entry must satisfy the catalog contract the preview,
			// publish upload and export zip all check.
			expect(starterFontForCustomFont(patch.customFonts![0])).toBe(face);
		}
	});

	it('leaves a system stack alone and never duplicates an installed face', () => {
		const systemOption = FONT_OPTIONS.find((option) => !option.family)!;
		expect(fontChoicePatch(blankTheme(), systemOption.value)).toEqual({});
		const face = STARTER_FONT_FACES[0];
		const withFace = {
			...blankTheme(),
			customFonts: [{ name: face.family, file: face.file, weight: face.weight }],
		};
		const option = FONT_OPTIONS.find((entry) => entry.family === face.family)!;
		expect(fontChoicePatch(withFace, option.value)).toEqual({});
		// A bundled face is named in the base list, so it is not repeated as a
		// per-document entry; uploads still are.
		const options = fontOptionsForTheme({
			...withFace,
			customFonts: [...withFace.customFonts, { name: 'My Upload', file: 'fonts/my-upload.woff2' }],
		});
		expect(options.filter((entry) => entry.label.startsWith(face.family))).toHaveLength(1);
		expect(options.some((entry) => entry.label === 'My Upload — your font')).toBe(true);
	});

	it('names a face selected as a bare custom-font value (pre-spec-36 documents)', () => {
		const options = fontOptionsForTheme(blankTheme());
		for (const face of STARTER_FONT_FACES) {
			const named = FONT_OPTIONS.find((entry) => entry.family === face.family)!;
			expect(resolveFontValue(options, `"${face.family}", sans-serif`)).toBe(named.value);
		}
	});

	it('renders the real woff2 in the preview for a document that declared no fonts', () => {
		const fontless = fontlessContent();
		expect(fontless.theme.customFonts).toBeUndefined();
		const option = FONT_OPTIONS.find((entry) => entry.family === 'Gilda Display')!;
		const patch = fontChoicePatch(fontless.theme, option.value);
		const doc = initDocFromContent({
			...fontless,
			theme: { ...fontless.theme, headingFontFamily: option.value, ...patch },
		});
		const faces = docToPortfolioData(doc).fontFaces ?? [];
		expect(faces).toHaveLength(1);
		expect(faces[0].name).toBe('Gilda Display');
		expect(faces[0].url).toContain('assets/starters/fonts/gilda-display.woff2');
		expect(faces[0].weight).toBe('400');
	});

	it('publishes the face a blank document picked, with its OFL license beside it', async () => {
		const fontless = fontlessContent();
		const option = FONT_OPTIONS.find((entry) => entry.family === 'Gilda Display')!;
		const patch = fontChoicePatch(fontless.theme, option.value);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('/* editor asset */', { status: 200 })),
		);
		try {
			const bundle = await buildBundle(
				initDocFromContent({
					...fontless,
					theme: { ...fontless.theme, headingFontFamily: option.value, ...patch },
				}),
			);
			const site = await generateStaticSite(bundle, {
				siteUrl: 'https://blank.example',
				editorBase: 'https://hangwork.art/',
			});
			const paths = site.files.map((file) => file.path);
			expect(paths).toContain('assets/fonts/gilda-display.woff2');
			expect(paths.some((path) => /^assets\/fonts\/gilda-display-OFL\.txt$/.test(path))).toBe(true);
			const home = new TextDecoder().decode(
				site.files.find((file) => file.path === 'index.html')!.bytes,
			);
			expect(home).toContain('@font-face');
			expect(home).toContain('Gilda Display');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('reports a hand-written stack as unnamed so the Custom entry still shows', () => {
		expect(resolveFontValue(fontOptionsForTheme(blankTheme()), 'Wingdings, fantasy')).toBeUndefined();
	});
});
