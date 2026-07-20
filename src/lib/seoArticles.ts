/** Product-site articles aimed at specific questions artists ask before building a portfolio. */
export const SEO_ARTICLES = [
	{
		slug: 'squarespace-alternative-for-artists',
		eyebrow: 'Portfolio builder comparison',
		title: 'A Squarespace alternative for artists — Hangwork',
		heading: 'A Squarespace alternative for artists, built around the artwork.',
		description:
			'Compare Hangwork and Squarespace for an artist portfolio: cost model, ownership, design freedom, hosting, domains, and the tradeoffs that matter.',
	},
	{
		slug: 'portfolio-website-without-subscription',
		eyebrow: 'No-subscription portfolio guide',
		title: 'Portfolio website without a subscription — Hangwork',
		heading: 'A portfolio website without a subscription.',
		description:
			'Learn how a no-subscription portfolio website works, what Hangwork includes for one payment, what you own, and which optional costs remain.',
	},
	{
		slug: 'how-to-make-an-art-portfolio-site',
		eyebrow: 'Step-by-step guide',
		title: 'How to make an art portfolio site — Hangwork',
		heading: 'How to make an art portfolio site that keeps the work first.',
		description:
			'A practical, step-by-step guide to choosing artwork, preparing images, structuring pages, writing portfolio copy, publishing, and keeping the site current.',
	},
] as const;

export type SeoArticle = (typeof SEO_ARTICLES)[number];
