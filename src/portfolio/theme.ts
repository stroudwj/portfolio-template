// Single source of truth for turning the `theme` data into CSS custom properties.
// Used by the Astro Layout (as a :root string) and the React preview (as a style
// object) so the two can never apply theme differently.
import type { CSSProperties } from 'react';
import type { Theme } from '../lib/content';

/** The string-valued theme fields that map 1:1 onto CSS variables. */
type ThemeVarKey = Exclude<
	keyof Theme,
	| 'customFonts'
	| 'contentGap'
	| 'headingFontFamily'
	| 'logoScale'
	| 'navStyle'
	| 'fullscreenMobileMenu'
	| 'automaticTextContrast'
	| 'stabilizeNavigation'
>;

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

/** Header logo size as a unitless multiplier (theme stores a 50–200 percentage). */
const logoScaleCss = (theme: Theme): string =>
	String(Math.min(Math.max(theme.logoScale ?? 100, 25), 300) / 100);

/** Theme → a React inline-style object of CSS variables. */
export function themeToVars(theme: Theme): CSSProperties {
	const style: Record<string, string> = {};
	for (const [cssVar, key] of VARS) style[cssVar] = theme[key];
	style['--content-gap'] = contentGapCss(theme);
	style['--font-heading'] = headingFontCss(theme);
	style['--logo-scale'] = logoScaleCss(theme);
	return style as CSSProperties;
}

/** Theme → a `:root { … }` CSS string for the Astro Layout's global injection. */
export function themeToRootCss(theme: Theme): string {
	const body = VARS.map(([cssVar, key]) => `${cssVar}:${theme[key]};`).join('');
	return `:root{${body}--content-gap:${contentGapCss(theme)};--font-heading:${headingFontCss(theme)};--logo-scale:${logoScaleCss(theme)};}`;
}

/** Parse a #rgb / #rrggbb hex string to [r,g,b] in 0–255, or null if not hex. */
function parseHex(color: string): [number, number, number] | null {
	const hex = color.trim().replace(/^#/, '');
	const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
	if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
	return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** WCAG relative luminance (0 = black, 1 = white) of an sRGB triple. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
	const lin = (v: number) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Color-blocking auto-contrast: given a section/page background color, return the
 * `--color-text` / `--color-text-muted` overrides that stay legible on it (dark ink
 * on light backgrounds, light ink on dark). Returns `{}` for non-hex input so the
 * inherited theme colors are left untouched.
 */
export function readableTextVars(bgColor: string): Record<string, string> {
	const rgb = parseHex(bgColor);
	if (!rgb) return {};
	const dark = relativeLuminance(rgb) < 0.5;
	return dark
		? { '--color-text': '#f5f5f2', '--color-text-muted': 'rgba(245,245,242,0.72)' }
		: { '--color-text': '#111111', '--color-text-muted': 'rgba(17,17,17,0.62)' };
}

/**
 * The inline CSS-variable overrides for a color-blocked background (a section or a
 * whole page): sets `--color-bg` plus the auto-contrast text colors. Empty when no
 * color is set, so callers can spread it unconditionally.
 */
export function backgroundBlockVars(
	bgColor: string | undefined,
	automaticTextContrast = true,
): Record<string, string> {
	if (!bgColor) return {};
	return {
		'--color-bg': bgColor,
		...(automaticTextContrast ? readableTextVars(bgColor) : {}),
	};
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
