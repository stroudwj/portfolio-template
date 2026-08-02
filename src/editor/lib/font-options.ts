import type { Theme } from '../../lib/content';

export const FONT_OPTIONS: Array<{ label: string; value: string }> = [
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
];

/** The CSS font-family value used for an uploaded custom font. */
export const customFontValue = (name: string): string => `"${name}", sans-serif`;

export const fontOptionsForTheme = (theme: Theme): Array<{ label: string; value: string }> => [
	...FONT_OPTIONS,
	...(theme.customFonts ?? []).map((font) => ({
		label: `${font.name} — your font`,
		value: customFontValue(font.name),
	})),
];
