// The vetted webfont catalog starter templates may bundle (spec 23). Each face is
// a single self-hosted woff2 under public/assets/starters/fonts/ with its OFL
// license text beside it — no third-party font CDN is ever requested, from the
// editor or from a published site.
//
// Rights contract: OFL-1.1 faces only, one license file per face, both shipped
// into every published site that declares the face (fonts are served from the
// site's own /assets/fonts/, and the lifetime-export zip carries them too).
// Faces whose upstream license declares a Reserved Font Name (Gilda, Playfair
// Display) are pure woff2 format conversions of the unmodified master — the OFL
// treats subsetting as creating a Modified Version, which may not keep the name;
// format conversion alone is accepted as not a modification. The other faces are
// Latin subsets (and variable-axis restrictions) of their masters, which the OFL
// permits while keeping the name because those projects reserve none.
//
// A starter declares a face through the EXISTING custom-font contract
// (theme.customFonts: { name, file, weight }) — the same pipeline that renders,
// publishes, and re-loads user-uploaded fonts carries template faces, so a
// starter with no declared fonts behaves exactly as before this catalog existed.

import { withBase } from '../../portfolio/types';

/** One bundled face a starter template may declare. */
export interface StarterFontFace {
	/** CSS font-family name — the CustomFont.name a starter must declare. */
	family: string;
	/** Published path under src/assets/ — the CustomFont.file a starter must declare. */
	file: string;
	/** The @font-face font-weight descriptor: one weight ("500") or a variable range ("400 800"). */
	weight: string;
	/** Every face here is OFL; the field exists so the audit is explicit per face. */
	license: 'OFL-1.1';
	/** The upstream license's copyright line, verbatim. */
	copyright: string;
	/** Where the master binary was obtained. */
	source: string;
}

export const STARTER_FONT_FACES: readonly StarterFontFace[] = [
	{
		family: 'Gilda Display',
		file: 'fonts/gilda-display.woff2',
		weight: '400',
		license: 'OFL-1.1',
		copyright:
			"Copyright 2012 The Gilda Display Project Authors (https://github.com/etunni/gilda-display) with Reserved Font Name 'Gilda'.",
		source: 'https://github.com/google/fonts/tree/main/ofl/gildadisplay',
	},
	{
		family: 'Archivo',
		file: 'fonts/archivo-latin.woff2',
		weight: '400 800',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo)',
		source: 'https://github.com/google/fonts/tree/main/ofl/archivo',
	},
	{
		family: 'Hanken Grotesk',
		file: 'fonts/hanken-grotesk-latin.woff2',
		weight: '400 700',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk)',
		source: 'https://github.com/google/fonts/tree/main/ofl/hankengrotesk',
	},
	{
		family: 'Poppins',
		file: 'fonts/poppins-500-latin.woff2',
		weight: '500',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins)',
		source: 'https://github.com/google/fonts/tree/main/ofl/poppins',
	},
	{
		family: 'Syne',
		file: 'fonts/syne-latin.woff2',
		weight: '400 800',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2017 The Syne Project Authors (https://gitlab.com/bonjour-monde/fonderie/syne-typeface)',
		source: 'https://github.com/google/fonts/tree/main/ofl/syne',
	},
	{
		family: 'Bodoni Moda',
		file: 'fonts/bodoni-moda-latin.woff2',
		weight: '400 700',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2020 The Bodoni Moda Project Authors (https://github.com/indestructible-type/Bodoni)',
		source: 'https://github.com/google/fonts/tree/main/ofl/bodonimoda',
	},
	{
		family: 'Playfair Display',
		file: 'fonts/playfair-display.woff2',
		weight: '400 900',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display"',
		source: 'https://github.com/google/fonts/tree/main/ofl/playfairdisplay',
	},
	{
		family: 'Nunito Sans',
		file: 'fonts/nunito-sans-900-latin.woff2',
		weight: '900',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2016 The Nunito Sans Project Authors (https://github.com/Fonthausen/NunitoSans)',
		source: 'https://github.com/google/fonts/tree/main/ofl/nunitosans',
	},
	{
		family: 'Karla',
		file: 'fonts/karla-latin.woff2',
		weight: '400 700',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2019 The Karla Project Authors (https://github.com/googlefonts/karla)',
		source: 'https://github.com/google/fonts/tree/main/ofl/karla',
	},
	{
		family: 'Cormorant',
		file: 'fonts/cormorant-latin.woff2',
		weight: '500 700',
		license: 'OFL-1.1',
		copyright:
			'Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)',
		source: 'https://github.com/google/fonts/tree/main/ofl/cormorant',
	},
];

const byFamily = new Map(STARTER_FONT_FACES.map((face) => [face.family, face]));

/** The catalog face with this family name, if the catalog has one. The font menu
 * uses it to install a face an artist picks from a blank document (spec 36). */
export function starterFontFace(family: string): StarterFontFace | undefined {
	return byFamily.get(family);
}

/** The catalog face a customFonts entry declares, or undefined when the entry is
 * a user upload (or drifts from the catalog contract in any field). */
export function starterFontForCustomFont(font: {
	name: string;
	file: string;
	weight?: string;
}): StarterFontFace | undefined {
	const face = byFamily.get(font.name);
	if (!face || face.file !== font.file) return undefined;
	if (font.weight !== undefined && font.weight !== face.weight) return undefined;
	return face;
}

const fileStem = (face: StarterFontFace): string =>
	face.file.slice('fonts/'.length).replace(/\.woff2$/, '');

/** The face binary inside the editor deployment (relative — join with the base). */
export function starterFontEditorPath(face: StarterFontFace): string {
	return `assets/starters/${face.file}`;
}

/** The face's OFL license text inside the editor deployment (relative). */
export function starterFontLicenseEditorPath(face: StarterFontFace): string {
	return `assets/starters/fonts/${fileStem(face)}-OFL.txt`;
}

/** Where the license text lands inside a published site, beside the binary. */
export function starterFontLicenseSitePath(face: StarterFontFace): string {
	return `fonts/${fileStem(face)}-OFL.txt`;
}

/** Editor-preview URL for a declared catalog face (no uploaded bytes involved). */
export function starterFontUrl(font: {
	name: string;
	file: string;
	weight?: string;
}): string | undefined {
	const face = starterFontForCustomFont(font);
	return face ? withBase(import.meta.env.BASE_URL, starterFontEditorPath(face)) : undefined;
}
