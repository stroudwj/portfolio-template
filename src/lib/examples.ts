/**
 * Published sites shown on the landing page and /examples. One entry per site so
 * adding an example is a single new object and both surfaces update together.
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
