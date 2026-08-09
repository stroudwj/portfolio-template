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
import { encodeContactEmail } from '../src/portfolio/contactEmail';

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
		content.pages.home.blocks?.push({
			id: 'shots',
			type: 'shots',
			src: 'media/home/clip.mp4',
		});
		expect(referencedAssetPaths(content)).toContain('src/assets/selected-works/01-blue.jpg');
		expect(referencedAssetPaths(content)).toContain('public/media/home/clip.mp4');
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

		// One HTML file per page (blank content ships home/art/photography/about).
		for (const page of ['index.html', 'art/index.html', 'photography/index.html', 'about/index.html']) {
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
		expect(home).toContain('property="og:image" content="https://jane.hangwork.art/assets/selected-works/01-blue.jpg"');
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
			site: {
				...base.contentJson.site,
				creative: { looseHang: true, hangStrength: 2.5 },
			},
			theme: {
				...base.contentJson.theme,
				navStyle: 'topbar',
				navOffsetX: -5,
				navOffsetY: 8,
				fullscreenMobileMenu: true,
				stabilizeNavigation: false,
				subheadingScale: 130,
				pageHeadingScale: 145,
				pageHeadingPosition: 'center',
				logoPosition: 'left',
			},
			pages: {
				...base.contentJson.pages,
				home: {
					...base.contentJson.pages.home,
					hanging: true,
					hangingStrength: 3.25,
					background: '#101014', // dark page → auto-contrast should flip text to light
					blocks: [
						...(base.contentJson.pages.home.blocks ?? []),
						{ id: 'youtube', type: 'embed', url: 'https://youtu.be/M7lc1UVf-VE' },
						{
							id: 'soundcloud',
							type: 'embed',
							kind: 'audio',
							url: 'https://soundcloud.com/example-artist/example-track',
						},
						{
							id: 'bandcamp',
							type: 'embed',
							kind: 'audio',
							url: '<iframe style="width: 350px; height: 470px" src="https://bandcamp.com/EmbeddedPlayer/album=314386330/size=large/transparent=true/"></iframe>',
						},
						{
							id: 'map',
							type: 'embed',
							kind: 'map',
							url: 'https://www.google.com/maps/place/Space+Needle/',
						},
					],
					sectionColors: { 'page:heading': '#e0685b' },
					sectionHeights: {
						'page:heading': { desktopGap: 31, phoneGap: 18 },
						'block:gallery': { desktop: 720 },
					},
					sectionBleed: { 'section:main': true },
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
		expect(home).toContain('--nav-offset-x:-5px');
		expect(home).toContain('--nav-offset-y:8px');
		expect(home).toContain('row-link');
		expect(home).toContain('nav-menu-trigger');
		expect(home).toContain('nav-menu-overlay');
		expect(home).toContain('logo-position-left');
		expect(home).toContain('header-logo-container logo-position-left is-stabilized');
		expect(home).toContain('creative-loose-hang');
		expect(home).toContain('--hang-strength:3.25');
		expect(home).toContain('--subheading-scale:1.3');
		expect(home).toContain('--page-heading-scale:1.45');
		expect(home).toContain('heading-position-center');
		expect(home).toContain('https://www.youtube.com/embed/M7lc1UVf-VE');
		expect(home).toContain('https://w.soundcloud.com/player/');
		expect(home).toContain('SoundCloud audio player');
		expect(home).toContain('https://bandcamp.com/EmbeddedPlayer/album=314386330/');
		expect(home).toContain('Bandcamp audio player');
		expect(home).toContain('https://www.google.com/maps?q=Space+Needle');
		expect(home).toContain('title="Google Map"');
		expect(home).toContain('referrerPolicy="strict-origin-when-cross-origin"');

		// Per-page background: the root carries the override + the flipped (light) text.
		expect(home).toContain('--color-bg:#101014');
		expect(home).toContain('--color-text:#f5f5f2');

		// Per-section full bleed: the canvas section spans the viewport.
		expect(home).toContain('section-full-bleed');

		// Per-section color: the heading band is a color-blocked part.
		expect(home).toContain('has-section-color');
		expect(home).toContain('--color-bg:#e0685b');
		expect(home).toContain('--section-min-desktop:0px');
		expect(home).toContain('--section-min-phone:0px');
		expect(home).toContain('--section-gap-desktop:31px');
		expect(home).toContain('--section-gap-phone:18px');
		expect(home).toContain('--section-min-desktop:180px');
		expect(home).toContain('--section-min-phone:120px');
		expect(home).not.toContain('sidebar is-stabilized');
	});

	it('publishes the three-zone bar with the last menu item as the right-hand CTA', async () => {
		const base = testBundle();
		const content = parseAndMigrateContent({
			...base.contentJson,
			theme: { ...base.contentJson.theme, navStyle: 'three-zone' },
			nav: [
				{ path: '', label: 'Works' },
				{ path: 'about', label: 'About' },
				{ path: 'contact', label: 'Book now' },
			],
			pages: {
				...base.contentJson.pages,
				about: { title: 'About', label: 'About', blocks: [] },
				contact: { title: 'Contact', label: 'Book now', blocks: [] },
			},
		});
		const site = await generateStaticSite(
			{ ...base, contentJson: content },
			{ siteUrl: 'https://jane.hangwork.art', editorBase: 'https://hangwork.art/' },
		);
		const home = new TextDecoder().decode(
			site.files.find((file) => file.path === 'index.html')!.bytes,
		);

		expect(home).toContain('nav-style-three-zone');
		// The last menu item is promoted out of the link row into the CTA slot…
		expect(home).toContain('nav-cta-link');
		expect(home).toMatch(/nav-cta-link[^>]*>Book now/);
		// …and the remaining links still render as the left row.
		expect(home).toMatch(/row-link[^>]*>Works/);
		expect(home).toMatch(/row-link[^>]*>About/);
		expect(home).not.toMatch(/row-link[^>]*>Book now/);
	});

	it('publishes an accordion as script-free details rows grouped one-open-at-a-time', async () => {
		const base = testBundle();
		const content = parseAndMigrateContent({
			...base.contentJson,
			pages: {
				...base.contentJson.pages,
				home: {
					...base.contentJson.pages.home,
					blocks: [
						...(base.contentJson.pages.home.blocks ?? []),
						{
							id: 'services-acc',
							type: 'accordion',
							items: [
								{ id: 'row-1', title: 'Film', text: 'Lead and supporting film work.' },
								{ id: 'row-2', title: 'Stage', text: 'Live performance.' },
							],
							titleSize: 92,
						},
					],
				},
			},
		});
		const site = await generateStaticSite(
			{ ...base, contentJson: content },
			{ siteUrl: 'https://jane.hangwork.art', editorBase: 'https://hangwork.art/' },
		);
		const home = new TextDecoder().decode(
			site.files.find((file) => file.path === 'index.html')!.bytes,
		);

		// Native details/summary: the published page needs no script to toggle,
		// and every row's words are in the HTML for no-JS readers and search.
		expect(home).toContain('accordion-block');
		expect(home).toContain('<details');
		expect(home).toContain('name="accordion-services-acc"');
		expect(home).toContain('Film');
		expect(home).toContain('Lead and supporting film work.');
		expect(home).toContain('Stage');
		expect(home).toContain('Live performance.');
		expect(home).toContain('--accordion-title-size:92pt');
	});

	it('publishes a contact block without ever writing the address', async () => {
		// Published pages inline their whole Content as window.__HW__, so the address
		// must be absent from the served bytes entirely — markup AND boot data.
		const base = testBundle();
		const content = parseAndMigrateContent({
			...base.contentJson,
			pages: {
				...base.contentJson.pages,
				home: {
					...base.contentJson.pages.home,
					blocks: [
						...(base.contentJson.pages.home.blocks ?? []),
						{
							id: 'contact-1',
							type: 'contact',
							heading: 'Get in touch',
							text: 'Email me about commissions.',
							email: encodeContactEmail('jane.doe@studio-example.com'),
							buttonLabel: 'Email me',
						},
					],
				},
			},
		});
		const site = await generateStaticSite(
			{ ...base, contentJson: content },
			{ siteUrl: 'https://jane.hangwork.art', editorBase: 'https://hangwork.art/' },
		);
		const home = new TextDecoder().decode(
			site.files.find((file) => file.path === 'index.html')!.bytes,
		);

		// The block really rendered.
		expect(home).toContain('contact-block');
		expect(home).toContain('Get in touch');
		expect(home).toContain('Email me about commissions.');
		// The readable no-JS fallback stands in for the address.
		expect(home).toContain('jane.doe [at] studio-example [dot] com');

		// Nothing anywhere in the published site spells the address out.
		expect(home).not.toContain('jane.doe@studio-example.com');
		expect(home).not.toContain('mailto:');
		for (const file of site.files) {
			if (!/\.(html|json|js|css|xml|txt)$/.test(file.path)) continue;
			expect(new TextDecoder().decode(file.bytes)).not.toContain('jane.doe@studio-example.com');
		}
	});

	it('publishes a contact form block without ever writing the recipient address', async () => {
		// The same leak as the contact block above, for the older sibling block: the
		// form's private delivery inbox (used by ContactForm's mailto fallback) must
		// never appear in the published bytes — markup, boot data, or _hw/content.json.
		const base = testBundle();
		const content = parseAndMigrateContent({
			...base.contentJson,
			pages: {
				...base.contentJson.pages,
				home: {
					...base.contentJson.pages.home,
					blocks: [
						...(base.contentJson.pages.home.blocks ?? []),
						{
							id: 'form-1',
							type: 'form',
							heading: 'Commission inquiries',
							action: '',
							recipientEmail: encodeContactEmail('owner@example-gallery.com'),
							successMessage: 'Thanks — your message has been sent.',
							fields: [
								{ id: 'name', type: 'name', label: 'Name', required: true },
								{ id: 'message', type: 'textarea', label: 'Message', required: true },
							],
						},
					],
				},
			},
		});
		const site = await generateStaticSite(
			{ ...base, contentJson: content },
			{ siteUrl: 'https://jane.hangwork.art', editorBase: 'https://hangwork.art/' },
		);
		const home = new TextDecoder().decode(
			site.files.find((file) => file.path === 'index.html')!.bytes,
		);

		// The block really rendered.
		expect(home).toContain('contact-form');
		expect(home).toContain('Commission inquiries');

		// Nothing anywhere in the published site spells the address out, joined or not.
		expect(home).not.toContain('owner@example-gallery.com');
		expect(home).not.toContain('mailto:');
		for (const file of site.files) {
			if (!/\.(html|json|js|css|xml|txt)$/.test(file.path)) continue;
			expect(new TextDecoder().decode(file.bytes)).not.toContain('owner@example-gallery.com');
		}
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
