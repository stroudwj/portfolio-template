// The 🔍 Sharing tab: how the site reads from the outside — search snippets,
// social link previews, and which image the preview card carries. Writes
// site.description, per-page descriptions and the og:image choice; the exporter
// and Layout.astro turn those into the real meta tags.
import { useEditor } from '../store';
import { Field, Section, TextArea, TextInput } from './ui/controls';
import { pageGalleryConfigs } from '../../lib/content';
import { getAssetPreviewUrl } from '../lib/assets';
import { PLACEHOLDER_IMAGE } from '../lib/content-init';
import { loadRepoInfo } from '../lib/github/store';
import { slugifySiteName, subdomainFor } from '../lib/github/subdomain';

export default function SharingEditor() {
	const { doc, setSiteDescription, setPageDescription, setOgImage } = useEditor();
	if (!doc) return null;
	const { content } = doc;

	// Every uploaded image, grouped by the page that shows it, for the og:image picker.
	const groups: Array<{ label: string; folder: string; entries: typeof doc.galleries[string] }> = [];
	for (const [key, page] of Object.entries(content.pages)) {
		for (const config of pageGalleryConfigs(page)) {
			const entries = doc.galleries[config.folder] ?? [];
			if (entries.length) groups.push({ label: page.label ?? key, folder: config.folder, entries });
		}
	}

	const selection = doc.ogImage;
	const selectedEntry = selection
		? doc.galleries[selection.folder]?.find((e) => e.id === selection.entryId)
		: undefined;

	// What the card will actually show: the chosen image, else the automatic pick
	// (profile photo, else the home gallery's first image) — mirrors resolveOgImage.
	const autoEntry = doc.galleries[content.pages.home?.gallery?.folder ?? '']?.[0];
	const cardImageSrc = selectedEntry
		? (getAssetPreviewUrl(selectedEntry.assetId) ?? PLACEHOLDER_IMAGE)
		: (getAssetPreviewUrl(doc.profileImage.assetId) ??
			(autoEntry ? (getAssetPreviewUrl(autoEntry.assetId) ?? PLACEHOLDER_IMAGE) : undefined));

	// Best guess at the live address for the mock card.
	const info = loadRepoInfo();
	const domain =
		info?.customDomain ||
		(info?.pagesUrl ? info.pagesUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : undefined) ||
		subdomainFor(slugifySiteName(content.site.name || 'my-portfolio'));

	const pageRows = Object.entries(content.pages);

	return (
		<>
			<Section title="Search & social" sectionKey="_sharing">
				<Field
					label="Site description"
					hint="One or two sentences. Shown under your name in Google and in link previews."
				>
					<TextArea
						rows={3}
						value={content.site.description}
						onChange={(e) => setSiteDescription(e.target.value)}
						placeholder="Painter and printmaker based in Portland — large-scale botanical works."
					/>
				</Field>

				<Field
					label="Social card image"
					hint="The picture shown when your link is shared. Automatic uses your profile photo, else your first image."
				>
					<select
						className="select-input"
						value={selectedEntry ? `${selection!.folder}::${selection!.entryId}` : ''}
						onChange={(e) => {
							const [folder, entryId] = e.target.value.split('::');
							setOgImage(entryId ? { folder, entryId } : undefined);
						}}
					>
						<option value="">Automatic</option>
						{groups.map((g) => (
							<optgroup key={`${g.label}-${g.folder}`} label={g.label}>
								{g.entries.map((entry, i) => (
									<option key={entry.id} value={`${g.folder}::${entry.id}`}>
										{entry.meta.title || entry.filename || `Image ${i + 1}`}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</Field>

				<div className="field">
					<span className="field-label">Link preview</span>
					<div className="share-card">
						{cardImageSrc ? (
							<img className="share-card-image" src={cardImageSrc} alt="" />
						) : (
							<div className="share-card-image share-card-empty">Upload an image to fill the card</div>
						)}
						<div className="share-card-body">
							<span className="share-card-domain">{domain}</span>
							<span className="share-card-title">{content.site.name || 'Your name'}</span>
							<span className="share-card-desc">
								{content.site.description || 'Your site description appears here.'}
							</span>
						</div>
					</div>
					<span className="field-hint">Roughly how your link looks when shared (each platform styles it a little differently).</span>
				</div>
			</Section>

			<Section title="Page descriptions" sectionKey="_page-descriptions" defaultCollapsed>
				<p className="muted" style={{ marginTop: 0 }}>
					Optional — a page without its own description uses the site description.
				</p>
				{pageRows.map(([key, page]) => (
					<Field key={key} label={page.label ?? key}>
						<TextInput
							value={page.description ?? ''}
							onChange={(e) => setPageDescription(key, e.target.value)}
							placeholder="What’s on this page?"
						/>
					</Field>
				))}
			</Section>
		</>
	);
}
