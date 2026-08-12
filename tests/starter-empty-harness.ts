// Spec 35 — the "empty harness": can every starter be emptied back to a blank
// document through the editor's own controls, and does the published site then
// contain no visible text at all?
//
// Why this exists. A starter ships 112–400 strings. The audit direction that
// matters here is template → blank: every string an artist inherits must be
// reachable and removable, and what is left must render sanely. Grepping the
// starter JSON only proves what the JSON says; it cannot see text the *renderer*
// supplies (component defaults, empty-state copy, fallback labels). So this
// harness empties a starter using only operations the editor actually offers,
// runs the real publish pipeline (`buildBundle` → `generateStaticSite`, the same
// two functions the 🚀 Publish tab calls), and reports every piece of text that
// survives in the emitted HTML.
//
// The contract with spec 36. `emptyContent()` below is a deliberate mirror of the
// editor's clearing surface: every operation cites the store action (and the
// control that calls it) that an artist would use. Nothing else is touched. So a
// survivor is, by construction, one of the audit's verdicts:
//   * a string with no editable field at all           → `hardcoded text`
//   * a string the renderer re-supplies once cleared   → `hardcoded text`
//   * a block/section/page that cannot be removed      → `needs a control`
// Spec 36's job is to drive `survivorsFor()` to `[]` for all fourteen starters
// (plus the blank document, which is not textless today either). Re-run it with
// `npx vitest run tests/starter-empty.test.ts`; set `HARNESS_STRICT=1` to make
// the test demand zero survivors instead of "no worse than the recorded
// baseline".
//
// Deliberately NOT a browser harness. The spec-18/32 in-browser staticgen trick
// exists to get real `createImageBitmap` aspect ratios; an emptied document has
// no images left, so node runs the identical code path. The live editor was used
// separately to calibrate that these operations are the ones the UI offers (see
// SOURCES.md §spec 35).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAndMigrateContent } from '../src/lib/content';
import type { Content } from '../src/lib/content';
import { initDocFromContent } from '../src/editor/lib/content-init';
import { buildBundle } from '../src/editor/lib/exporter';
import { generateStaticSite } from '../src/editor/lib/staticgen/site';

const STARTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/editor/lib/starters');

export function starterIds(): string[] {
	return readdirSync(STARTER_DIR)
		.filter((f) => f.endsWith('.content.json'))
		.map((f) => f.replace('.content.json', ''))
		.sort();
}

export function starterContent(id: string): Content {
	return parseAndMigrateContent(JSON.parse(readFileSync(join(STARTER_DIR, `${id}.content.json`), 'utf8')));
}

/**
 * Two ways to empty a document, because they catch different bugs.
 *
 * `structure` — the literal "empty it back to blank" pass: delete every page but
 * home, every block, every section, every image, then blank the site-level
 * fields. Survivors are text the artist cannot get rid of at all.
 *
 * `fields` — keep every page, section and block exactly where the starter put
 * them and only blank the *strings*. Survivors are text the **renderer** supplies
 * once a field goes empty: component defaults, empty-state copy, fallback labels.
 * This is the pass that finds hardcoded copy, and it is invisible to any grep of
 * the starter JSON.
 */
export type EmptyMode = 'structure' | 'fields';

/**
 * Empty a document the way an artist would, using only operations the editor
 * exposes. Each step names the store action behind the control.
 */
export function emptyContent(input: Content, mode: EmptyMode = 'structure'): Content {
	const content: Content = JSON.parse(JSON.stringify(input));
	if (mode === 'fields') return blankEveryString(content);

	// --- Pages -------------------------------------------------------------
	// PageSettingsModal → "Delete this page" → store.removePage(). Home cannot be
	// deleted (it is the site root), so it is emptied in place instead.
	for (const key of Object.keys(content.pages)) if (key !== 'home') delete content.pages[key];
	// removePage() also drops the page's nav entry and any child references.
	content.nav = content.nav.filter((item) => (item.path || 'home') === 'home' || item.path === '');
	const home = content.pages.home;
	if (home) {
		// PageEditor → block ✕ → store.removeBlock() removes every block.
		home.blocks = [];
		// PreviewEditLayer → section hover chrome → "Remove section" → store.removeSection().
		// The editor refuses to delete a page's LAST section (store guard
		// `allSections.length <= 1`, and the button is hidden), so one empty
		// section is the true floor of the empty direction — not zero.
		home.sections = [{ id: 'main', name: 'Main section', blockIds: [] }];
		delete home.children;
		// PageSettingsModal: "Name in the site menu" / "Browser and search title" /
		// page description → store.setPageTitle / setPageDescription.
		home.label = '';
		home.title = '';
		home.description = '';
		// PageHeadingLayoutEditor / PageEditor heading field → store.setPageHeading().
		home.heading = '';
		delete home.project;
		delete home.sectionMotion;
		delete home.sectionColors;
		delete home.mobile;
		delete home.thumbnail;
	}
	// Home's nav label is the page label (store keeps nav[].label in sync with it).
	content.nav = content.nav.map((item) => ({ ...item, label: '' }));

	// --- Galleries ---------------------------------------------------------
	// AssetWorkbench / ImageCollectionEditor → remove image → store.removeGalleryImage().
	// (Every image's title / alt / description / link goes with the image.)
	for (const folder of Object.keys(content.galleries)) content.galleries[folder] = { items: {} };

	// --- Site identity -----------------------------------------------------
	content.site.name = ''; // SiteIdentityEditor → store.setName()
	content.site.description = ''; // SharingEditor → store.setSiteDescription()
	content.site.footer = ''; // FooterEditor "Footer text" ("Leave empty to remove it") → store.setFooter()
	content.site.footerName = ''; // FooterEditor "Large closing name" → store.setFooterName()
	// FooterEditor → column ✕ → store.setFooterColumns(), which normalises an empty
	// list to `undefined`. That normalisation is load-bearing: PortfolioPage guards
	// the footer with `content.site.footerColumns?.length &&`, so a literal `[]`
	// would render a stray "0" on every page. Mirror the store, not the shape.
	delete content.site.footerColumns;
	delete content.site.logo; // HeaderLayoutEditor → store.setLogoText()
	delete content.site.logoImage; // HeaderLayoutEditor → store.removeLogoImage()
	delete content.site.footerImage; // FooterEditor → store.removeFooterImage()
	delete content.site.signature; // SignatureEditor → store.setSignature() / removeSignatureImage()
	delete content.site.ogImage; // SharingEditor → store.setOgImage(undefined)

	// --- About / contact / resume / store ----------------------------------
	content.profile.bio = ''; // AboutContentEditor → store.setBio()
	content.profile.image = ''; // AboutContentEditor → store.removeProfileImage()
	delete content.profile.name; // AboutContentEditor → store.setProfileName()
	content.contact.email = ''; // AboutContentEditor → store.setEmail()
	content.social = []; // SocialLinksEditor → store.removeSocial()
	if (content.resume) content.resume.url = ''; // AboutContentEditor → store.removeResume()
	// AboutContentEditor "Résumé link text" → store.setResumeLabel() (spec 36, row E8).
	// An emptied label hides the link rather than falling back to "Résumé".
	if (content.resume) content.resume.label = '';
	if (content.store) content.store.products = []; // StoreEditor → store.removeProduct()

	// NOTE what is deliberately NOT cleared here, because no control clears it:
	//   * content.site.favicon      — "favicon.svg" (a file name, never rendered as
	//     text; spec 36 confirmed it is product chrome, not artist copy)
	// Leaving it in is the point: if it surfaces as text, it is a finding.

	return parseAndMigrateContent(content);
}

/**
 * `fields` mode: keep every page, section and block, blank only the strings.
 * Each blanked field cites the control an artist would use; anything that comes
 * back in the published HTML is renderer-supplied and therefore a finding.
 */
function blankEveryString(content: Content): Content {
	content.site.name = ''; // SiteIdentityEditor → setName()
	content.site.description = ''; // SharingEditor → setSiteDescription()
	content.site.footer = ''; // FooterEditor → setFooter()
	content.site.footerName = ''; // FooterEditor → setFooterName()
	delete content.site.footerColumns; // FooterEditor → column ✕ (delete, not [], to dodge the stray-0 bug)
	delete content.site.logo; // HeaderLayoutEditor → setLogoText()
	content.profile.bio = ''; // AboutContentEditor → setBio()
	delete content.profile.name; // AboutContentEditor → setProfileName()
	content.contact.email = ''; // AboutContentEditor → setEmail()
	content.social = []; // SocialLinksEditor → removeSocial()
	if (content.resume) content.resume.label = ''; // AboutContentEditor "Résumé link text" → setResumeLabel()
	if (content.store) content.store.products = []; // StoreEditor → removeProduct()
	content.nav = content.nav.map((item) => ({ ...item, label: '' })); // PageSettingsModal → page label
	// Spec 36 row E8 — AboutContentEditor's résumé label field. The link only
	// renders once a résumé is attached, so keep (or invent) a URL: the finding is
	// that an emptied label must publish no link rather than the word "Résumé".
	if (content.resume) content.resume = { label: '', url: content.resume.url || 'resume.pdf' };

	for (const folder of Object.keys(content.galleries)) {
		for (const item of Object.values(content.galleries[folder].items)) {
			// ImageCollectionEditor / AssetWorkbench → updateGalleryMeta()
			item.title = '';
			item.alt = '';
			item.description = '';
			item.link = '';
		}
	}

	for (const page of Object.values(content.pages)) {
		page.label = ''; // PageSettingsModal
		page.title = ''; // PageSettingsModal → setPageTitle()
		page.description = ''; // PageSettingsModal → setPageDescription()
		page.heading = ''; // PageEditor heading field → setPageHeading()
		for (const block of page.blocks ?? []) {
			// PageEditor: the block's own name field (editor-only label).
			if ('name' in block) (block as { name?: string }).name = '';
			switch (block.type) {
				case 'text': // PreviewEditLayer inline edit → updateTextBlock/updateRichTextBlock()
					block.text = '';
					if (block.richText) block.richText = [{ runs: [{ text: '' }] }];
					delete block.link;
					break;
				case 'images': // ImageCollectionEditor "Describe these images" → setGalleryConfig()
					block.gallery.alt = '';
					// PageEditor → Customize layout → Carousel settings → "Number count"
					// checkbox → setGalleryConfig({ carouselShowCount: false }). The
					// counter is the one piece of carousel chrome that is copy rather
					// than a control, and it already has an off switch (spec 36, E5).
					block.gallery.carouselShowCount = false;
					break;
				case 'button': // PageEditor button block → updateButtonBlock()
					block.label = '';
					block.url = '';
					break;
				case 'contact': // PageEditor contact block → updateContactBlock()
					block.heading = '';
					block.text = '';
					block.buttonLabel = '';
					break;
				case 'form': // PageEditor form block → updateFormBlock()
					block.heading = '';
					block.successMessage = '';
					// Spec 36 (E4): the button words, the required marker and the
					// nowhere-to-send sentence are block fields now, each with its own
					// input in the form block's panel — so the empty direction blanks
					// them the way an artist would.
					block.submitLabel = '';
					block.emailSubmitLabel = '';
					block.requiredLabel = '';
					block.unavailableMessage = '';
					for (const field of block.fields) field.label = '';
					break;
				case 'accordion': // PageEditor accordion rows → updateAccordionBlock()
					for (const item of block.items) {
						item.title = '';
						item.text = '';
					}
					break;
				case 'project': // PageEditor project fields → setProjectDetails()
					for (const key of ['year', 'medium', 'dimensions', 'collaborators', 'exhibitionHistory'] as const)
						delete block.project[key];
					break;
				case 'children': // ChildPages card labels → onChildCardLabel
					for (const item of block.items ?? []) item.label = '';
					break;
			}
		}
		if (page.project)
			for (const key of ['year', 'medium', 'dimensions', 'collaborators', 'exhibitionHistory'] as const)
				delete page.project[key];
	}
	return parseAndMigrateContent(content);
}

const BLOCK_TAGS = /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Visible text nodes of an HTML document body, in order, whitespace-collapsed. */
export function visibleText(html: string): string[] {
	const bodyStart = html.indexOf('<body');
	const body = bodyStart === -1 ? html : html.slice(html.indexOf('>', bodyStart) + 1);
	return body
		.replace(BLOCK_TAGS, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.split(' ')
		.map((s) =>
			s
				.replace(/&nbsp;/g, ' ')
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&#x27;/g, "'")
				.replace(/\s+/g, ' ')
				.trim(),
		)
		.filter(Boolean);
}

/** Assistive strings a screen reader would announce — a softer second bucket. */
export function assistiveText(html: string): string[] {
	const out: string[] = [];
	const head = html.slice(0, html.indexOf('<body'));
	for (const match of html.replace(BLOCK_TAGS, ' ').matchAll(/\s(?:alt|aria-label|title|placeholder)="([^"]*)"/g)) {
		const value = match[1].trim();
		if (value) out.push(value);
	}
	// <title> is visible in the browser tab / search results.
	const titleTag = /<title>([^<]*)<\/title>/.exec(head);
	if (titleTag && titleTag[1].trim()) out.push(titleTag[1].trim());
	return out;
}

export interface Survivor {
	/** Emitted file the text was found in, e.g. `index.html`. */
	file: string;
	text: string;
	kind: 'visible' | 'assistive';
}

export interface HarnessResult {
	id: string;
	survivors: Survivor[];
	/** Distinct survivor strings, sorted — the stable shape a baseline compares. */
	strings: string[];
	files: string[];
}

export interface EmptyOptions {
	mode?: EmptyMode;
	/**
	 * Starters illustrate with sample artwork, and publishing strips samples — so a
	 * plain run never exercises the image-caption, lightbox or carousel paths at
	 * all. Setting this promotes every sample to an artist-owned image so those
	 * paths render with their captions blank, which is where their fallback copy
	 * shows up.
	 */
	keepImages?: boolean;
}

/** Empty a content document, publish it for real, and report what text survived. */
export async function emptyAndPublish(id: string, input: Content, options: EmptyOptions = {}): Promise<HarnessResult> {
	const doc = initDocFromContent(emptyContent(input, options.mode ?? 'structure'));
	if (options.keepImages)
		for (const folder of Object.keys(doc.galleries))
			for (const entry of doc.galleries[folder]) entry.sampleAssetId = null;
	const bundle = await buildBundle(doc);
	const site = await generateStaticSite(bundle, {
		siteUrl: 'https://empty.hangwork.art',
		editorBase: 'https://hangwork.art/',
	});
	const survivors: Survivor[] = [];
	const files: string[] = [];
	for (const file of site.files) {
		if (!file.path.endsWith('.html')) continue;
		files.push(file.path);
		const html = new TextDecoder().decode(file.bytes);
		for (const text of visibleText(html)) survivors.push({ file: file.path, text, kind: 'visible' });
		for (const text of assistiveText(html)) survivors.push({ file: file.path, text, kind: 'assistive' });
	}
	return {
		id,
		survivors,
		strings: [...new Set(survivors.map((s) => `${s.kind}: ${s.text}`))].sort(),
		files: files.sort(),
	};
}

export async function survivorsFor(id: string, options: EmptyOptions = {}): Promise<HarnessResult> {
	return emptyAndPublish(id, starterContent(id), options);
}
