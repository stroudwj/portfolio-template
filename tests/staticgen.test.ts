// Browser static-generation (Direction D, Subsystem 4): the bundle → static-file-set
// transform must produce real per-page HTML from the SAME <Portfolio> component the
// editor previews with, plus the hydration boot data, 404/robots/sitemap, and the
// _hw/* files the load-published flow depends on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAndMigrateContent } from '../src/lib/content';
import { blankContent } from '../src/editor/lib/content-init';
import type { PortfolioBundle } from '../src/editor/lib/exporter';
import { generateStaticSite, servedPath, referencedAssetPaths } from '../src/editor/lib/staticgen/site';
import { escapeHtml, scriptSafeJson } from '../src/editor/lib/staticgen/html';

const bytes = (text: string) => new TextEncoder().encode(text);

function testBundle(): PortfolioBundle {
	const content = parseAndMigrateContent({
		...blankContent,
			site: {
				...blankContent.site,
				name: 'Jane Doe',
				description: 'Paintings and prints',
				footerHeights: { desktop: 180, phone: 120 },
			},
		galleries: {
			...blankContent.galleries,
			'selected-works': { items: { '01-blue.jpg': { title: 'Blue', alt: 'A blue painting' } } },
		},
	});
	return {
		contentJson: content,
		files: [
			{ path: 'src/assets/selected-works/01-blue.jpg', bytes: bytes('fake-jpeg') },
			// A file with NO caption metadata still must render (glob semantics).
			{ path: 'src/assets/selected-works/02-red.jpg', bytes: bytes('fake-jpeg-2') },
		],
	};
}

describe('staticgen', () => {
	beforeEach(() => {
		// The editor-origin fetches (hydration runtime + favicons) — stubbed.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('hangwork-runtime/')) {
					return new Response('/* runtime */', { status: 200 });
				}
				return new Response('binary', { status: 200 });
			}),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('servedPath maps project paths onto site paths', () => {
		expect(servedPath('src/assets/art/01.jpg')).toBe('assets/art/01.jpg');
		expect(servedPath('public/resume.pdf')).toBe('resume.pdf');
		expect(servedPath('index.html')).toBe('index.html');
	});

	it('referencedAssetPaths mirrors the exporter contract', () => {
		const content = testBundle().contentJson;
		expect(referencedAssetPaths(content)).toContain('src/assets/selected-works/01-blue.jpg');
	});

	it('escapes HTML and inline JSON safely', () => {
		expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
		expect(scriptSafeJson({ a: '</script>' })).not.toContain('</script>');
	});

	it('generates real per-page HTML, hydration boot data and site plumbing', async () => {
		const site = await generateStaticSite(testBundle(), {
			siteUrl: 'https://jane.hangwork.art',
			editorBase: 'https://hangwork.art/',
		});
		const paths = site.files.map((f) => f.path);
		const text = (p: string) => new TextDecoder().decode(site.files.find((f) => f.path === p)!.bytes);

		// One HTML file per page (blank content ships home/art/photography/bio).
		for (const page of ['index.html', 'art/index.html', 'photography/index.html', 'bio/index.html']) {
			expect(paths).toContain(page);
		}
		// Site plumbing + the reload contract + the runtime.
		for (const page of ['404.html', 'robots.txt', 'sitemap.xml', '_hw/content.json', '_hw/hydrate.js', '_hw/portfolio.css']) {
			expect(paths).toContain(page);
		}
		// Assets land under their served paths.
		expect(paths).toContain('assets/selected-works/01-blue.jpg');

		const home = text('index.html');
		// Real server-rendered markup — not an empty SPA shell.
		expect(home).toContain('portfolio-root');
		expect(home).toContain('Selected Works');
		// SEO: title template resolved, canonical + og present, sidebar nav rendered.
		expect(home).toContain('<title>Jane Doe — Selected Works</title>');
		expect(home).toContain('<link rel="canonical" href="https://jane.hangwork.art/" />');
		expect(home).toContain('property="og:site_name" content="Jane Doe"');
		// Both gallery files render — including the caption-less one.
		expect(home).toContain('/assets/selected-works/01-blue.jpg');
		expect(home).toContain('/assets/selected-works/02-red.jpg');
		// Hydration boot: same data inlined for /_hw/hydrate.js.
		expect(home).toContain('window.__HW__=');
		expect(home).toContain('<script type="module" src="/_hw/hydrate.js"></script>');

		// Sub-pages carry their own canonical path.
		expect(text('art/index.html')).toContain('href="https://jane.hangwork.art/art/"');

		// The sitemap lists every page URL.
		const sitemap = text('sitemap.xml');
		expect(sitemap).toContain('https://jane.hangwork.art/');
		expect(sitemap).toContain('https://jane.hangwork.art/art/');
		// robots points at it.
		expect(text('robots.txt')).toContain('Sitemap: https://jane.hangwork.art/sitemap.xml');

		// The asset inventory covers uploaded + referenced user content.
		expect(site.assetPaths).toContain('assets/selected-works/01-blue.jpg');
		expect(site.assetPaths).toContain('assets/selected-works/02-red.jpg');
	});

	it('renders the chosen nav style and color-blocking into the published HTML', async () => {
		const base = testBundle();
		const content = parseAndMigrateContent({
			...base.contentJson,
			theme: {
				...base.contentJson.theme,
				navStyle: 'topbar',
				fullscreenMobileMenu: true,
				stabilizeNavigation: false,
				subheadingScale: 130,
				logoPosition: 'left',
			},
			pages: {
				...base.contentJson.pages,
				home: {
					...base.contentJson.pages.home,
					background: '#101014', // dark page → auto-contrast should flip text to light
					sectionColors: { 'page:heading': '#e0685b' },
					sectionHeights: {
						'page:heading': { desktop: 260, phone: 180 },
						'block:gallery': { desktop: 720 },
					},
				},
			},
		});
		const site = await generateStaticSite(
			{ ...base, contentJson: content },
			{ siteUrl: 'https://jane.hangwork.art', editorBase: 'https://hangwork.art/' },
		);
		const home = new TextDecoder().decode(site.files.find((f) => f.path === 'index.html')!.bytes);

		// Nav style: the wrapper class + horizontal row links, plus the full-screen
		// mobile overlay markup (opt-in via fullscreenMobileMenu) and its trigger.
		expect(home).toContain('nav-style-topbar');
		expect(home).toContain('row-link');
		expect(home).toContain('nav-menu-trigger');
		expect(home).toContain('nav-menu-overlay');
		expect(home).toContain('logo-position-left');
		expect(home).toContain('--subheading-scale:1.3');

		// Per-page background: the root carries the override + the flipped (light) text.
		expect(home).toContain('--color-bg:#101014');
		expect(home).toContain('--color-text:#f5f5f2');

		// Per-section color: the heading band is a color-blocked part.
		expect(home).toContain('has-section-color');
		expect(home).toContain('--color-bg:#e0685b');
		expect(home).toContain('--section-min-desktop:260px');
		expect(home).toContain('--section-min-phone:180px');
		expect(home).toContain('--section-min-desktop:180px');
		expect(home).toContain('--section-min-phone:120px');
		expect(home).not.toContain('sidebar is-stabilized');
	});

	it('leaves configured text colors untouched when automatic contrast is off', async () => {
		const base = testBundle();
		const content = parseAndMigrateContent({
			...base.contentJson,
			theme: { ...base.contentJson.theme, automaticTextContrast: false },
			pages: {
				...base.contentJson.pages,
				home: { ...base.contentJson.pages.home, background: '#101014' },
			},
		});
		const site = await generateStaticSite(
			{ ...base, contentJson: content },
			{ siteUrl: 'https://jane.hangwork.art', editorBase: 'https://hangwork.art/' },
		);
		const home = new TextDecoder().decode(
			site.files.find((file) => file.path === 'index.html')!.bytes,
		);
		expect(home).toContain('--color-bg:#101014');
		expect(home).not.toContain('--color-text:#f5f5f2');
	});
});
