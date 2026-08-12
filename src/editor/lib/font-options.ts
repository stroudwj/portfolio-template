// The font menu. Every stack a starter template uses is a *named* entry here, so
// an artist starting from a blank document can reach the same typography the
// templates ship — and so a template's stack survives a trip through the select
// (spec 35 rows B4/B5: 18 starter stacks used to fall into the opaque
// "Custom (…)" entry, and the ten bundled webfaces had no name at all).
//
// Three kinds of entry:
//  - System stacks — installed families with fallbacks; nothing is downloaded.
//  - Template fonts — the ten bundled OFL faces from starter-fonts.ts (spec 23).
//    Picking one installs the face into theme.customFonts, which is the single
//    contract the preview, the publish pipeline and the export zip all read, so
//    the real woff2 renders from a blank document exactly as it does in a starter.
//  - The artist's own uploads, appended per document.
//
// No new font files: the menu offers only faces already in the spec-23 registry.

import type { CustomFont, Theme } from '../../lib/content';
import {
	STARTER_FONT_FACES,
	starterFontFace,
	starterFontForCustomFont,
	type StarterFontFace,
} from './starter-fonts';

export interface FontOption {
	label: string;
	value: string;
	/** Set when the entry is a bundled catalog face (spec 23). */
	family?: string;
}

/** Stacks that ship no webfont — the families are already on the artist's machine.
 *  The first fifteen are the original menu; the rest are the plain-system stacks
 *  the starters use (spec 35 row B4). */
const SYSTEM_FONT_OPTIONS: FontOption[] = [
	{ label: 'Helvetica — clean sans', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
	{ label: 'System — native sans', value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
	{ label: 'Futura — geometric sans', value: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif' },
	{ label: 'Avenir — humanist sans', value: 'Avenir, "Avenir Next", Montserrat, sans-serif' },
	{ label: 'Gill Sans — editorial sans', value: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
	{ label: 'Trebuchet — friendly sans', value: '"Trebuchet MS", Verdana, sans-serif' },
	{ label: 'Georgia — classic serif', value: 'Georgia, "Times New Roman", serif' },
	{ label: 'Palatino — bookish serif', value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
	{ label: 'Garamond — elegant serif', value: 'Garamond, "Apple Garamond", "EB Garamond", Georgia, serif' },
	{ label: 'Baskerville — refined serif', value: 'Baskerville, "Baskerville Old Face", Georgia, serif' },
	{ label: 'Didot — high-contrast serif', value: 'Didot, "Bodoni MT", "Times New Roman", serif' },
	{ label: 'Rockwell — slab serif', value: 'Rockwell, "Rockwell Extra Bold", Georgia, serif' },
	{ label: 'Courier — typewriter mono', value: '"Courier New", Courier, monospace' },
	{ label: 'Menlo — modern mono', value: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace' },
	{ label: 'Chalkboard — hand drawn', value: 'Chalkboard, "Comic Sans MS", cursive' },
	{ label: 'Arial — plain sans', value: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
	{ label: 'Optima — calligraphic sans', value: 'Optima, Candara, "Gill Sans", "Gill Sans MT", "Segoe UI", sans-serif' },
	{ label: 'Seravek — gentle sans', value: 'Seravek, "Gill Sans", "Gill Sans MT", Verdana, sans-serif' },
	{ label: 'Verdana — wide screen sans', value: 'Verdana, Geneva, sans-serif' },
	{ label: 'American Typewriter — vintage typewriter', value: '"American Typewriter", "Courier Prime", "Courier New", monospace' },
];

/** The bundled OFL faces (spec 23), each with the fallback stack the templates
 *  that introduced it use — the face leads, the old system stack follows, so a
 *  page still reads correctly during the swap or if the binary never arrives. */
const BUNDLED_FONT_OPTIONS: FontOption[] = [
	{
		family: 'Gilda Display',
		label: 'Gilda Display — display serif',
		value: '"Gilda Display", Didot, "Bodoni MT", "Times New Roman", serif',
	},
	{
		family: 'Bodoni Moda',
		label: 'Bodoni Moda — high-contrast serif',
		value: '"Bodoni Moda", Didot, "Bodoni MT", "Times New Roman", serif',
	},
	{
		family: 'Playfair Display',
		label: 'Playfair Display — classic display serif',
		value: '"Playfair Display", Baskerville, "Palatino Linotype", Georgia, serif',
	},
	{
		family: 'Cormorant',
		label: 'Cormorant — delicate serif',
		value: 'Cormorant, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
	},
	{
		family: 'Archivo',
		label: 'Archivo — sturdy sans',
		value: 'Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif',
	},
	{
		family: 'Hanken Grotesk',
		label: 'Hanken Grotesk — warm sans',
		value: '"Hanken Grotesk", Avenir, "Avenir Next", Montserrat, sans-serif',
	},
	{
		family: 'Karla',
		label: 'Karla — quiet sans',
		value: 'Karla, Seravek, "Gill Sans", "Gill Sans MT", Verdana, sans-serif',
	},
	{
		family: 'Poppins',
		label: 'Poppins — round geometric sans',
		value: 'Poppins, Futura, "Century Gothic", "Trebuchet MS", sans-serif',
	},
	{
		family: 'Syne',
		label: 'Syne — bold poster sans',
		value: 'Syne, Futura, "Century Gothic", "Trebuchet MS", sans-serif',
	},
	{
		family: 'Nunito Sans',
		label: 'Nunito Sans — heavy headline sans',
		value: '"Nunito Sans", "Arial Black", "Avenir Next", Arial, sans-serif',
	},
];

export const FONT_OPTIONS: FontOption[] = [...SYSTEM_FONT_OPTIONS, ...BUNDLED_FONT_OPTIONS];

/** The CSS font-family value used for an uploaded custom font. */
export const customFontValue = (name: string): string => `"${name}", sans-serif`;

const optionByValue = new Map(FONT_OPTIONS.map((option) => [option.value, option]));

/** Stacks that mean the same font as a menu entry but are spelled differently —
 *  a starter's second fallback tail, or the bare `"Family", sans-serif` an
 *  uploaded/preset-installed face used to select. They resolve to the named
 *  entry so the select never shows "Custom (…)" for a font it can name. */
const FONT_ALIASES = new Map<string, string>([
	// atelier's body stack — the native sans by another spelling.
	['-apple-system, "Segoe UI", Roboto, Arial, sans-serif', SYSTEM_FONT_OPTIONS[1].value],
	// promenade's shorter Optima tail.
	['Optima, Candara, "Segoe UI", sans-serif', 'Optima, Candara, "Gill Sans", "Gill Sans MT", "Segoe UI", sans-serif'],
	// contact-sheet's body Poppins (humanist tail) beside its heading Poppins.
	['Poppins, Avenir, "Avenir Next", Montserrat, sans-serif', 'Poppins, Futura, "Century Gothic", "Trebuchet MS", sans-serif'],
	// A catalog face selected as a bare custom font (pre-spec-36 documents).
	...STARTER_FONT_FACES.map(
		(face): [string, string] => [
			customFontValue(face.family),
			BUNDLED_FONT_OPTIONS.find((option) => option.family === face.family)!.value,
		],
	),
]);

/** The menu value that stands for `value`, or undefined when nothing does (a
 *  hand-written stack, or an uploaded font the document no longer carries). */
export const resolveFontValue = (
	options: readonly FontOption[],
	value: string | undefined,
): string | undefined => {
	if (!value) return undefined;
	if (options.some((option) => option.value === value)) return value;
	const alias = FONT_ALIASES.get(value);
	return alias && options.some((option) => option.value === alias) ? alias : undefined;
};

/** The bundled face a menu value selects, if any. */
export const faceForFontValue = (value: string): StarterFontFace | undefined => {
	const family = optionByValue.get(value)?.family;
	return family ? starterFontFace(family) : undefined;
};

/** The theme patch that picking `value` implies. Choosing a template font also
 *  installs it into theme.customFonts — the one contract the editor preview, the
 *  publish upload and the export zip read — so the real woff2 renders even from a
 *  blank document. A font the document already carries under that name keeps it
 *  (same collision rule as applying a theme preset). */
export const fontChoicePatch = (theme: Theme, value: string): Partial<Theme> => {
	const face = faceForFontValue(value);
	if (!face) return {};
	const existing = theme.customFonts ?? [];
	if (existing.some((font) => font.name === face.family)) return {};
	const entry: CustomFont = { name: face.family, file: face.file, weight: face.weight };
	return { customFonts: [...existing, entry] };
};

export const fontOptionsForTheme = (theme: Theme): FontOption[] => [
	...FONT_OPTIONS,
	// Bundled faces are already named above; only the artist's own uploads need a
	// per-document entry.
	...(theme.customFonts ?? [])
		.filter((font) => !starterFontForCustomFont(font))
		.map((font) => ({
			label: `${font.name} — your font`,
			value: customFontValue(font.name),
		})),
];
