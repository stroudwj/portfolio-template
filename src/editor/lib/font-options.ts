import type { Theme } from '../../lib/content';

export const FONT_OPTIONS: Array<{ label: string; value: string }> = [
	{ label: 'Helvetica — clean sans', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
	{ label: 'System — native sans', value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
	{ label: 'Futura — geometric sans', value: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif' },
	{ label: 'Georgia — classic serif', value: 'Georgia, "Times New Roman", serif' },
	{ label: 'Palatino — bookish serif', value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
	{ label: 'Garamond — elegant serif', value: 'Garamond, "Apple Garamond", "EB Garamond", Georgia, serif' },
	{ label: 'Courier — typewriter mono', value: '"Courier New", Courier, monospace' },
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
