/**
 * Real sites published with Hangwork. Since spec 37 the gallery surface is the
 * template catalog (/templates), so these appear only as the quiet "Made with
 * Hangwork" proof line under it — one entry per site, still a single object to
 * add. Live per-template demo sites do not exist yet; publishing them is spec
 * 5's territory.
 */
export interface ExampleSite {
	name: string;
	url: string;
	domain: string;
	description: string;
}

export const exampleSites: ExampleSite[] = [
	{
		name: 'Will Stroud',
		url: 'https://stroud.xyz',
		domain: 'stroud.xyz',
		description: 'Art, graphic design, and photography in a clean, image-first portfolio.',
	},
];
