// Single source of truth for turning the `theme` data into CSS custom properties.
// Used by the Astro Layout (as a :root string) and the React preview (as a style
// object) so the two can never apply theme differently.
import type { CSSProperties } from 'react';
import type { Theme } from '../lib/content';

/** The string-valued theme fields that map 1:1 onto CSS variables. */
type ThemeVarKey = Exclude<keyof Theme, 'customFonts' | 'contentGap' | 'headingFontFamily'>;

const VARS: Array<[string, ThemeVarKey]> = [
	['--color-bg', 'backgroundColor'],
	['--color-text', 'textColor'],
	['--color-text-muted', 'mutedTextColor'],
	['--color-accent', 'accentColor'],
	['--font-family', 'fontFamily'],
];

/** The gap between the site header and the page content, as a CSS length. */
const contentGapCss = (theme: Theme): string => `${theme.contentGap ?? 0}px`;

/** Headings (page titles, text logo) fall back to the body font when unset. */
const headingFontCss = (theme: Theme): string => theme.headingFontFamily || theme.fontFamily;

/** Theme → a React inline-style object of CSS variables. */
export function themeToVars(theme: Theme): CSSProperties {
	const style: Record<string, string> = {};
	for (const [cssVar, key] of VARS) style[cssVar] = theme[key];
	style['--content-gap'] = contentGapCss(theme);
	style['--font-heading'] = headingFontCss(theme);
	return style as CSSProperties;
}

/** Theme → a `:root { … }` CSS string for the Astro Layout's global injection. */
export function themeToRootCss(theme: Theme): string {
	const body = VARS.map(([cssVar, key]) => `${cssVar}:${theme[key]};`).join('');
	return `:root{${body}--content-gap:${contentGapCss(theme)};--font-heading:${headingFontCss(theme)};}`;
}

/** A custom font ready to load: display name + a resolved URL (hashed asset or blob:). */
export interface FontFace {
	name: string;
	url: string;
}

const FONT_FORMATS: Record<string, string> = {
	woff2: 'woff2',
	woff: 'woff',
	ttf: 'truetype',
	otf: 'opentype',
};

/**
 * Uploaded fonts → @font-face CSS. Shared by the Astro Layout and the editor
 * preview so a custom font renders identically in both. Names/URLs are stripped
 * of quotes and backslashes so user input can't break out of the declaration.
 */
export function fontFacesCss(fonts: FontFace[]): string {
	return fonts
		.map(({ name, url }) => {
			const safeName = name.replace(/["\\]/g, '');
			const safeUrl = url.replace(/["\\]/g, '');
			const ext = safeUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
			const format = FONT_FORMATS[ext];
			return `@font-face{font-family:"${safeName}";src:url("${safeUrl}")${format ? ` format("${format}")` : ''};font-display:swap;}`;
		})
		.join('');
}
