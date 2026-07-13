// Single source of truth for turning the `theme` data into CSS custom properties.
// Used by the Astro Layout (as a :root string) and the React preview (as a style
// object) so the two can never apply theme differently.
import type { CSSProperties } from 'react';
import type { Theme } from '../lib/content';

const VARS: Array<[string, keyof Theme]> = [
	['--color-bg', 'backgroundColor'],
	['--color-text', 'textColor'],
	['--color-text-muted', 'mutedTextColor'],
	['--color-accent', 'accentColor'],
	['--font-family', 'fontFamily'],
];

/** Theme → a React inline-style object of CSS variables. */
export function themeToVars(theme: Theme): CSSProperties {
	const style: Record<string, string> = {};
	for (const [cssVar, key] of VARS) style[cssVar] = theme[key];
	return style as CSSProperties;
}

/** Theme → a `:root { … }` CSS string for the Astro Layout's global injection. */
export function themeToRootCss(theme: Theme): string {
	const body = VARS.map(([cssVar, key]) => `${cssVar}:${theme[key]};`).join('');
	return `:root{${body}}`;
}
