// One page's full editing surface: name, optional heading, and its ordered body
// blocks — text anywhere, the image gallery, the About section, and sub-pages
// (thumbnail cards). Sub-pages get their own nested PageEditor so their galleries
// and text are edited in place; nesting is one level deep by design.
import { useEditor } from '../store';
import { Field, TextInput, TextArea, Section } from './ui/controls';
import ImageCollectionEditor from './ImageCollectionEditor';
import MobileArrangementEditor, { type MobileArrangementItem } from './MobileArrangementEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl, uid } from '../lib/assets';
import { videoEmbedSrc } from '../../portfolio/videoEmbed';
import { parseAspect, uniformColumns } from '../../portfolio/Gallery';
import { DEFAULT_AR, flowMissing, roundLayout, uniformGridLayouts } from '../../portfolio/canvasLayout';
import { automaticPhoneOrder } from '../../portfolio/mobileOrder';
import { isUrl } from '../lib/validation';
import type { ChildrenStyle, FormField, GalleryConfig, PageBlock, TextAlign, TextStyle } from '../../lib/content';

const CHILDREN_STYLES: Array<{ value: ChildrenStyle; label: string }> = [
	{ value: 'cards', label: 'Thumbnail cards' },
	{ value: 'large', label: 'Big covers' },
	{ value: 'list', label: 'List with thumbnails' },
	{ value: 'index', label: 'Text index (no images)' },
];

const ALIGNMENTS: Array<{ value: TextAlign; label: string; title: string }> = [
	{ value: 'left', label: 'L', title: 'Align left' },
	{ value: 'center', label: 'C', title: 'Align center' },
	{ value: 'right', label: 'R', title: 'Align right' },
];

const TEXT_STYLES: Array<{ value: TextStyle; label: string }> = [
	{ value: 'body', label: 'Body text' },
	{ value: 'heading', label: 'Large heading' },
	{ value: 'subheading', label: 'Small heading' },
	{ value: 'quote', label: 'Quote' },
];

const FORM_FIELD_TYPES: Array<{ value: FormField['type']; label: string }> = [
	{ value: 'name', label: 'Name' },
	{ value: 'email', label: 'Email' },
	{ value: 'text', label: 'Short answer' },
	{ value: 'textarea', label: 'Long answer' },
];

const CROP_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: '', label: 'Original (no crop)' },
	{ value: '1:1', label: 'Square 1:1' },
	{ value: '4:3', label: 'Landscape 4:3' },
	{ value: '3:2', label: 'Landscape 3:2' },
	{ value: '16:9', label: 'Wide 16:9' },
	{ value: '3:4', label: 'Portrait 3:4' },
	{ value: '2:3', label: 'Portrait 2:3' },
];

const isPageOrWebLink = (value: string): boolean =>
	!value.trim() || isUrl(value) || value.startsWith('/') || value.startsWith('#');

type GalleryPatch = Partial<Pick<GalleryConfig, 'layout' | 'columns' | 'aspect' | 'mobile'>>;

/** Natural width/height ratio of an image URL (undefined when it can't load). */
const measureAr = (url: string | null | undefined): Promise<number | undefined> =>
	new Promise((resolve) => {
		if (!url) return resolve(undefined);
		const img = new Image();
		img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined);
		img.onerror = () => resolve(undefined);
		img.src = url;
	});

/** Freeform/Grid toggle shared by the main gallery block and extra image groups. */
function LayoutToggle({
	mode,
	onPatch,
	label,
}: {
	mode: 'freeform' | 'grid';
	onPatch: (patch: GalleryPatch) => void;
	label: string;
}) {
	return (
		<div className="align-toggle" role="group" aria-label={`${label} layout`}>
			<button
				type="button"
				className={`btn-icon btn-chip ${mode === 'freeform' ? 'active' : ''}`}
				title="Freeform canvas — drag images anywhere in the preview"
				aria-label={`Use Freeform layout for ${label}`}
				aria-pressed={mode === 'freeform'}
				onClick={() => onPatch({ layout: undefined })}
			>
				Freeform
			</button>
			<button
				type="button"
				className={`btn-icon btn-chip ${mode === 'grid' ? 'active' : ''}`}
				title="Auto grid — images arrange themselves in neat rows"
				aria-label={`Use Grid layout for ${label}`}
				aria-pressed={mode === 'grid'}
				onClick={() => onPatch({ layout: 'grid' })}
			>
				Grid
			</button>
		</div>
	);
}

/** Grid-mode settings (columns + crop) shared by the gallery block and image groups. */
function GridOptions({
	config,
	onPatch,
	onAdopt,
	label,
}: {
	config: GalleryConfig;
	onPatch: (patch: GalleryPatch) => void;
	label: string;
	/** Copy this grid arrangement into freeform coordinates, then switch to Freeform. */
	onAdopt?: () => void;
}) {
	return (
		<div className="grid-options">
			<label className="grid-option">
				Columns
				<select
					className="select-input"
					aria-label={`Number of columns for ${label}`}
					value={uniformColumns(config.columns)}
					onChange={(e) => onPatch({ columns: Number(e.target.value) })}
				>
					{[1, 2, 3, 4, 5, 6].map((n) => (
						<option key={n} value={n}>
							{n}
						</option>
					))}
				</select>
			</label>
			<label className="grid-option">
				Crop
				<select
					className="select-input"
					aria-label={`Image crop for ${label}`}
					value={config.aspect ?? ''}
					onChange={(e) => onPatch({ aspect: e.target.value || undefined })}
				>
					{CROP_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			</label>
			{onAdopt && (
				<button
					type="button"
					className="btn-link adopt-grid"
					title="Switch to Freeform with the images placed exactly like this grid — then slide them around from there."
					onClick={onAdopt}
				>
					Edit this arrangement in Freeform
				</button>
			)}
		</div>
	);
}

export default function PageEditor({ pageKey, nested = false }: { pageKey: string; nested?: boolean }) {
	const editor = useEditor();
	const { doc } = editor;
	if (!doc) return null;
	const page = doc.content.pages[pageKey];
	if (!page) return null;
	const isHome = pageKey === 'home';
	const pageName = page.label || (isHome ? 'Home' : pageKey);
	const blocks = page.blocks ?? [];
	const galleryMode = page.gallery?.layout === 'grid' ? 'grid' : 'freeform';
	/** Text can be dragged onto the canvas only when the page shows a freeform gallery. */
	const hasFreeCanvas = !!page.gallery && galleryMode === 'freeform' && blocks.some((b) => b.type === 'gallery');
	const phoneItemsFor = (config: GalleryConfig, includePinnedBlocks = false): MobileArrangementItem[] => {
		const entries = doc.galleries[config.folder] ?? [];
		const flowed = flowMissing(entries.map((entry) => ({ layout: entry.meta.layout, ar: entry.meta.layout?.ar ?? DEFAULT_AR })));
		const artwork = entries.map((entry, index) => ({
			item: {
				key: `image:${entry.id}`,
				label: entry.meta.title || entry.filename || `Image ${index + 1}`,
				kind: 'image' as const,
				thumbnail: getAssetPreviewUrl(entry.assetId) ?? undefined,
			},
			y: entry.meta.layout?.y ?? flowed.get(index)?.y ?? index * 30,
		}));
		// A freeform canvas automatically stacks by its desktop vertical position.
		// Seed customization from that same order so opting in never changes the site
		// before the artist actually moves or resizes something. Grid mode keeps the
		// image-list order because that is what its automatic phone grid already uses.
		const arrangedArtwork = config.layout === 'grid'
			? artwork
			: automaticPhoneOrder(
					artwork.map(({ item, y }, index) => ({ key: item.key, y, kind: 'image', index })),
				).map((key) => artwork.find((entry) => entry.item.key === key)!);
		if (!includePinnedBlocks) return arrangedArtwork.map(({ item }) => item);
		const pinned = blocks.flatMap<{
			item: MobileArrangementItem;
			y: number;
			kind: 'text' | 'video';
			index: number;
		}>((block, index) => {
			if (block.type === 'text' && block.layout) {
				const words = block.text.trim().replace(/\s+/g, ' ');
				return [{ item: { key: `text:${block.id}`, label: words ? words.slice(0, 45) : 'Text', kind: 'text' }, y: block.layout.y, kind: 'text', index }];
			}
			if (block.type === 'embed' && block.layout)
				return [{ item: { key: `video:${block.id}`, label: 'Video', kind: 'video' }, y: block.layout.y, kind: 'video', index }];
			return [];
		});
		const all = [
			...arrangedArtwork.map((entry, index) => ({ ...entry, kind: 'image' as const, index })),
			...pinned,
		];
		const byKey = new Map(all.map((entry) => [entry.item.key, entry.item]));
		return automaticPhoneOrder(
			all.map((entry) => ({ key: entry.item.key, y: entry.y, kind: entry.kind, index: entry.index })),
		).map((key) => byKey.get(key)!);
	};
	const pagePhoneItems: MobileArrangementItem[] = [
		...(page.heading?.trim()
			? [{ key: 'page:heading', label: `Page heading: ${page.heading.trim().slice(0, 45)}`, kind: 'section' as const }]
			: []),
		...blocks.flatMap((block, index) => {
		if (hasFreeCanvas && (block.type === 'text' || block.type === 'embed') && block.layout) return [];
		const label =
			block.type === 'text'
				? block.text.trim().replace(/\s+/g, ' ').slice(0, 45) || `Text ${index + 1}`
				: block.type === 'gallery'
					? 'Main images'
					: block.type === 'images'
						? block.name || `Image group ${index + 1}`
						: block.type === 'embed'
							? 'Video'
							: block.type === 'button'
								? `Button: ${block.label || 'Untitled'}`
								: block.type === 'divider'
									? 'Divider line'
									: block.type === 'form'
										? block.heading || 'Contact form'
										: block.type === 'about'
											? 'About section'
											: 'Sub-pages';
		return [{ key: `block:${block.id}`, label, kind: 'section' as const }];
		}),
	];

	const removeThisPage = () => {
		const extra = page.children?.length ? ' and its sub-pages' : '';
		if (confirm(`Delete the “${page.label ?? pageKey}” page${extra}? Its images come off the site too.`))
			editor.removePage(pageKey);
	};
	const addChild = () => {
		const name = prompt('Name of the new sub-page:');
		if (name?.trim()) editor.addChildPage(pageKey, name.trim());
	};

	/** Bake the current Grid arrangement into freeform coordinates and switch to
	 *  Freeform, so the images start exactly where the grid showed them. Aspect
	 *  ratios come from the crop (when set) or the images' real pixels. */
	const adoptGridAsFreeform = async (config: GalleryConfig, onPatch: (patch: GalleryPatch) => void) => {
		const entries = doc.galleries[config.folder] ?? [];
		if (entries.length === 0) {
			onPatch({ layout: undefined });
			return;
		}
		const cellAr = parseAspect(config.aspect);
		const ars = await Promise.all(
			entries.map(
				async (e) =>
					cellAr ?? (await measureAr(getAssetPreviewUrl(e.assetId))) ?? e.meta.layout?.ar ?? DEFAULT_AR,
			),
		);
		const layouts = uniformGridLayouts(ars, uniformColumns(config.columns));
		editor.setGalleryLayouts(
			config.folder,
			Object.fromEntries(entries.map((e, i) => [e.id, roundLayout(layouts[i])])),
		);
		onPatch({ layout: undefined });
	};

	const controls = (index: number, block: PageBlock, removable: boolean) => {
		const name =
			block.type === 'images' ? block.name || 'image group' :
			block.type === 'embed' ? 'video' :
			block.type === 'children' ? 'sub-pages' :
			block.type === 'form' ? 'contact form' :
			block.type === 'divider' ? 'divider' : block.type;
		const blockLabel = `${name} block ${index + 1} on ${pageName}`;
		return <div className="block-controls" role="group" aria-label={`Actions for ${blockLabel}`}>
			<button
				type="button"
				className="btn-icon"
				disabled={index === 0}
				onClick={() => editor.moveBlock(pageKey, index, index - 1)}
				aria-label={`Move ${blockLabel} earlier`}
			>
				↑
			</button>
			<button
				type="button"
				className="btn-icon"
				disabled={index === blocks.length - 1}
				onClick={() => editor.moveBlock(pageKey, index, index + 1)}
				aria-label={`Move ${blockLabel} later`}
			>
				↓
			</button>
			{removable && (
				<button
					type="button"
					className="btn-icon danger"
					onClick={() => editor.removeBlock(pageKey, block.id)}
					aria-label={`Delete ${blockLabel}`}
				>
					✕
				</button>
			)}
		</div>;
	};

	const renderBlock = (block: PageBlock, index: number) => {
		switch (block.type) {
			case 'text': {
				const align = block.align ?? 'left';
				const textLabel = `text block ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Text</span>
							<select
								className="select-input block-style-select"
								value={block.style ?? 'body'}
								aria-label={`Style for ${textLabel}`}
								onChange={(event) => editor.setTextStyle(pageKey, block.id, event.target.value as TextStyle)}
							>
								{TEXT_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
							</select>
							<div className="align-toggle" role="group" aria-label={`Alignment for ${textLabel}`}>
								{ALIGNMENTS.map((a) => (
									<button
										key={a.value}
										type="button"
										className={`btn-icon ${align === a.value ? 'active' : ''}`}
										title={a.title}
										aria-label={`${a.title} for ${textLabel}`}
										aria-pressed={align === a.value}
										onClick={() => editor.setTextAlign(pageKey, block.id, a.value)}
									>
										{a.label}
									</button>
								))}
							</div>
							{controls(index, block, true)}
						</div>
						<TextArea
							rows={4}
							aria-label={`Words in ${textLabel}`}
							value={block.text}
							placeholder="Write something… One blank line makes a paragraph break."
							onChange={(e) => editor.updateTextBlock(pageKey, block.id, e.target.value)}
						/>
						<details className="block-options">
							<summary aria-label={`Add a link to ${textLabel}`}>Add a link to this text</summary>
							<input
								className={`text-input ${!isPageOrWebLink(block.link ?? '') ? 'invalid' : ''}`}
								value={block.link ?? ''}
								placeholder="https://…"
								aria-label={`Link for ${textLabel}`}
								onChange={(event) => editor.setTextLink(pageKey, block.id, event.target.value)}
							/>
							{!isPageOrWebLink(block.link ?? '') && <span className="field-error">Use a full web address beginning with https://.</span>}
						</details>
						{block.layout ? (
							<p className="muted">
								Placed on the canvas — drag it in the preview.{' '}
								<button
									type="button"
									className="btn-link"
									onClick={() => editor.setTextLayout(pageKey, block.id, undefined)}
								>
									Back to normal flow
								</button>
							</p>
						) : (
							hasFreeCanvas &&
							!!block.text.trim() && (
								<p className="muted">Drag this text in the preview to place it anywhere on the canvas.</p>
							)
						)}
					</div>
				);
			}
			case 'embed': {
				const invalid = !!block.url.trim() && !videoEmbedSrc(block.url);
				const videoLabel = `video block ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Video</span>
							{controls(index, block, true)}
						</div>
						<input
							className={`text-input ${invalid ? 'invalid' : ''}`}
							aria-label={`YouTube or Vimeo link for ${videoLabel}`}
							placeholder="Paste a YouTube or Vimeo link (https://…)"
							value={block.url}
							onChange={(e) => editor.updateEmbedBlock(pageKey, block.id, e.target.value)}
						/>
						{invalid ? (
							<span className="field-error">That doesn’t look like a YouTube or Vimeo link.</span>
						) : block.layout ? (
							<p className="muted">
								Placed on the canvas — drag it to move, drag its corner handle to resize.{' '}
								<button
									type="button"
									className="btn-link"
									onClick={() => editor.setEmbedLayout(pageKey, block.id, undefined)}
								>
									Back to normal flow
								</button>
							</p>
						) : hasFreeCanvas && !!block.url.trim() ? (
							<p className="muted">Drag this video in the preview to place it anywhere on the canvas.</p>
						) : (
							<p className="muted">The video plays right on your page.</p>
						)}
					</div>
				);
			}
			case 'gallery':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Images</span>
							{page.gallery && (
								<LayoutToggle label={`main images on ${pageName}`} mode={galleryMode} onPatch={(patch) => editor.setGalleryConfig(pageKey, patch)} />
							)}
							{controls(index, block, false)}
						</div>
						{page.gallery && galleryMode === 'grid' && (
							<GridOptions
								config={page.gallery}
								label={`${hasFreeCanvas ? 'main canvas' : 'main images'} on ${pageName}`}
								onPatch={(patch) => editor.setGalleryConfig(pageKey, patch)}
								onAdopt={() =>
									void adoptGridAsFreeform(page.gallery!, (patch) => editor.setGalleryConfig(pageKey, patch))
								}
							/>
						)}
						{page.gallery && (
							<ImageCollectionEditor
								embedded
								folder={page.gallery.folder}
								variant={isHome ? 'projects' : 'gallery'}
								addLabel="+ Add image(s)"
								emptyLabel="No images yet."
								hint={
									galleryMode === 'grid'
										? 'Images auto-arrange into a neat grid — pick columns and crop above. ⠿ here sets the order.'
										: undefined
								}
							/>
						)}
						{page.gallery && (phoneItemsFor(page.gallery, hasFreeCanvas).length > 0 || page.gallery.mobile) && (
							<MobileArrangementEditor
								items={phoneItemsFor(page.gallery, hasFreeCanvas)}
								mobile={page.gallery.mobile}
								gridMode={galleryMode === 'grid'}
								label={`main images on ${pageName}`}
								onChange={(mobile) => editor.setGalleryConfig(pageKey, { mobile })}
							/>
						)}
					</div>
				);
			case 'images': {
				const groupMode = block.gallery.layout === 'grid' ? 'grid' : 'freeform';
				const patchGroup = (patch: GalleryPatch) => editor.updateImagesBlock(pageKey, block.id, patch);
				const groupLabel = `${block.name || `image group ${index + 1}`} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<input
								className="block-name-input"
								value={block.name ?? ''}
								placeholder="Image group"
								title="Name this group (only shown here in the editor)"
								aria-label={`Name for ${groupLabel}`}
								onChange={(e) => editor.renameImagesBlock(pageKey, block.id, e.target.value)}
							/>
							<LayoutToggle label={groupLabel} mode={groupMode} onPatch={patchGroup} />
							{controls(index, block, true)}
						</div>
						{groupMode === 'grid' && (
							<GridOptions
								config={block.gallery}
								label={groupLabel}
								onPatch={patchGroup}
								onAdopt={() => void adoptGridAsFreeform(block.gallery, patchGroup)}
							/>
						)}
						<ImageCollectionEditor
							embedded
							folder={block.gallery.folder}
							variant="gallery"
							addLabel="+ Add image(s)"
							emptyLabel="No images in this group yet."
							hint={
								groupMode === 'grid'
									? 'Images auto-arrange into a neat grid — pick columns and crop above. ⠿ here sets the order.'
									: 'A second canvas of its own — drag its images in the preview to arrange them. ⠿ here sets the stacking: the top image sits in front.'
							}
						/>
						{(phoneItemsFor(block.gallery).length > 0 || block.gallery.mobile) && (
							<MobileArrangementEditor
								items={phoneItemsFor(block.gallery)}
								mobile={block.gallery.mobile}
								gridMode={groupMode === 'grid'}
								label={groupLabel}
								onChange={(mobile) => patchGroup({ mobile })}
							/>
						)}
					</div>
				);
			}
			case 'button': {
				const invalid = !isPageOrWebLink(block.url);
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Button</span>
							{controls(index, block, true)}
						</div>
						<div className="block-field-grid">
							<label className="field">
								<span className="field-label">Words on the button</span>
								<input className="text-input" value={block.label} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { label: event.target.value })} />
							</label>
							<label className="field">
								<span className="field-label">Where it goes</span>
								<input className={`text-input ${invalid ? 'invalid' : ''}`} placeholder="https://… or /work" value={block.url} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { url: event.target.value })} />
								{invalid && <span className="field-error">Add a full web address, or a site page such as /work.</span>}
							</label>
						</div>
						<div className="block-choice-row">
							<label>
								Style
								<select className="select-input" value={block.appearance ?? 'solid'} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { appearance: event.target.value as 'solid' | 'outline' })}>
									<option value="solid">Filled</option>
									<option value="outline">Outline</option>
								</select>
							</label>
							<label>
								Position
								<select className="select-input" value={block.align ?? 'left'} onChange={(event) => editor.updateButtonBlock(pageKey, block.id, { align: event.target.value as TextAlign })}>
									<option value="left">Left</option>
									<option value="center">Center</option>
									<option value="right">Right</option>
								</select>
							</label>
						</div>
					</div>
				);
			}
			case 'divider':
				return (
					<div className="block divider-editor-block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Divider line</span>
							{controls(index, block, true)}
						</div>
						<hr />
					</div>
				);
			case 'form': {
				const endpointInvalid = !!block.action && (!isUrl(block.action) || !block.action.startsWith('https://'));
				const updateFields = (fields: FormField[]) => editor.updateFormBlock(pageKey, block.id, { fields });
				const formLabel = `contact form ${index + 1} on ${pageName}`;
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Contact form</span>
							{controls(index, block, true)}
						</div>
						<Field label="Form heading">
							<TextInput aria-label={`Heading for ${formLabel}`} value={block.heading ?? ''} placeholder="Get in touch" onChange={(event) => editor.updateFormBlock(pageKey, block.id, { heading: event.target.value })} />
						</Field>
						<Field
							label="Optional form service address"
							hint="Leave this blank to use your Profile email (add one near the top of Content). The visitor’s email app opens with their message ready. To send directly instead, paste the form address from a service such as Formspree."
							error={endpointInvalid ? 'Use the https:// form address supplied by your form service.' : undefined}
						>
							<TextInput aria-label={`Optional form service address for ${formLabel}`} value={block.action} placeholder="https://formspree.io/f/…" onChange={(event) => editor.updateFormBlock(pageKey, block.id, { action: event.target.value })} />
						</Field>
						<details className="block-options form-setup-help">
							<summary>Want messages sent without opening email?</summary>
							<ol>
								<li>Create a form with a service such as Formspree.</li>
								<li>Choose the inbox where you want to receive messages.</li>
								<li>Copy the form address it gives you and paste it above.</li>
							</ol>
							<p className="muted">This is optional. Without a form service, visitors can still continue in their email app.</p>
						</details>
						<div className="form-fields-editor">
							<span className="field-label">Questions on the form</span>
							{block.fields.map((field, fieldIndex) => (
								<div className="form-field-row" key={field.id}>
									<input
										className="text-input"
										value={field.label}
										aria-label={`Question ${fieldIndex + 1} label in ${formLabel}`}
										onChange={(event) => updateFields(block.fields.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))}
									/>
									<select
										className="select-input"
										value={field.type}
										aria-label={`Question ${fieldIndex + 1} answer type in ${formLabel}`}
										onChange={(event) => updateFields(block.fields.map((item) => item.id === field.id ? { ...item, type: event.target.value as FormField['type'] } : item))}
									>
										{FORM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
									</select>
									<label className="compact-check"><input type="checkbox" checked={!!field.required} onChange={(event) => updateFields(block.fields.map((item) => item.id === field.id ? { ...item, required: event.target.checked || undefined } : item))} /> <span className="sr-only">Require {field.label || `question ${fieldIndex + 1}`} in {formLabel}</span><span aria-hidden="true">Required</span></label>
									<button type="button" className="btn-icon danger" aria-label={`Remove ${field.label || `question ${fieldIndex + 1}`} from ${formLabel}`} onClick={() => updateFields(block.fields.filter((item) => item.id !== field.id))}>✕</button>
								</div>
							))}
							<button type="button" className="btn-link" aria-label={`Add a question to ${formLabel}`} onClick={() => updateFields([...block.fields, { id: uid('field'), type: 'text', label: 'Question' }])}>＋ Add a question</button>
						</div>
						<Field label="Message shown after sending directly">
							<TextInput aria-label={`Message shown after ${formLabel} sends directly`} value={block.successMessage ?? ''} onChange={(event) => editor.updateFormBlock(pageKey, block.id, { successMessage: event.target.value })} />
						</Field>
					</div>
				);
			}
			case 'about':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">About — your bio, email &amp; social links</span>
							{controls(index, block, true)}
						</div>
						<p className="muted">Shows the profile you edit at the top (photo, bio, email, social links).</p>
					</div>
				);
			case 'children':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Sub-pages</span>
							<select
								className="select-input children-style-select"
								value={block.style ?? 'cards'}
								title="How the sub-pages are shown on this page"
								aria-label={`How sub-pages are shown on ${pageName}`}
								onChange={(e) => editor.setChildrenStyle(pageKey, block.id, e.target.value as ChildrenStyle)}
							>
								{CHILDREN_STYLES.map((s) => (
									<option key={s.value} value={s.value}>
										{s.label}
									</option>
								))}
							</select>
							{controls(index, block, false)}
						</div>
						{(page.children ?? []).map((childKey, childIndex, childList) => {
							const child = doc.content.pages[childKey];
							const childName = child?.label || childKey;
							const thumbUrl = getAssetPreviewUrl(doc.pageThumbs[childKey]?.assetId ?? null);
							return (
								<div className="child-row" key={childKey}>
									<div className="child-thumb-picker">
										<ImageDrop ariaLabel={`Choose a thumbnail for ${childName}`} onFiles={(files) => editor.setPageThumb(childKey, files[0])}>
											{thumbUrl ? <img className="child-thumb" src={thumbUrl} alt="" /> : <span>＋ Thumb</span>}
										</ImageDrop>
									</div>
									<TextInput
										value={child?.label ?? childKey}
										aria-label={`Name of sub-page ${childName} under ${pageName}`}
										onChange={(e) => editor.renamePage(childKey, e.target.value)}
										placeholder="Sub-page name"
									/>
									<button
										type="button"
										className="btn-icon"
										disabled={childIndex === 0}
										onClick={() => editor.moveChildPage(pageKey, childIndex, childIndex - 1)}
										aria-label={`Move sub-page ${childName} earlier on ${pageName}`}
									>
										↑
									</button>
									<button
										type="button"
										className="btn-icon"
										disabled={childIndex === childList.length - 1}
										onClick={() => editor.moveChildPage(pageKey, childIndex, childIndex + 1)}
										aria-label={`Move sub-page ${childName} later on ${pageName}`}
									>
										↓
									</button>
									<button
										type="button"
										className="btn-icon danger"
										onClick={() => {
											if (confirm(`Delete the “${child?.label ?? childKey}” sub-page?`)) editor.removePage(childKey);
										}}
										aria-label={`Delete sub-page ${childName}`}
									>
										✕
									</button>
								</div>
							);
						})}
						<p className="muted">
							Each sub-page is its own page with images and text — edit them below. ↑↓ sets their order on the page.
							Without a thumbnail, the card uses the sub-page’s first image.
						</p>
					</div>
				);
		}
	};

	return (
		<Section
			sectionKey={pageKey}
			defaultCollapsed={nested}
			title={nested ? `↳ ${page.label ?? pageKey}` : isHome ? `Page: ${page.label || 'Home'}` : `Page: ${page.label ?? pageKey}`}
			action={
				!isHome ? (
					<button type="button" className="btn-icon danger" onClick={removeThisPage} aria-label={`Delete page ${pageName}`}>
						✕
					</button>
				) : undefined
			}
		>
			<Field
				label={nested ? 'Sub-page name' : 'Page name'}
				hint={nested ? 'Shown on its card and heading.' : 'Shown in the site menu.'}
			>
				<TextInput value={page.label ?? ''} onChange={(e) => editor.renamePage(pageKey, e.target.value)} />
			</Field>
			<Field label="Heading (optional)">
				<TextInput
					value={page.heading ?? ''}
					placeholder="Shown at the top of the page"
					onChange={(e) => editor.setPageHeading(pageKey, e.target.value)}
				/>
			</Field>

			{(pagePhoneItems.length > 0 || page.mobile) && (
				<MobileArrangementEditor
					items={pagePhoneItems}
					mobile={page.mobile}
					simple
					scope="page"
					label={pageName}
					onChange={(mobile) => editor.setPageMobile(pageKey, mobile)}
				/>
			)}

			{blocks.map(renderBlock)}

			<div className="block-adders">
				<button type="button" className="btn-link" aria-label={`Add text to ${pageName}`} onClick={() => editor.addTextBlock(pageKey)}>
					＋ Add text
				</button>
				<button type="button" className="btn-link" aria-label={`Add an image group to ${pageName}`} onClick={() => editor.addImagesBlock(pageKey)}>
					＋ Add image group
				</button>
				<button type="button" className="btn-link" aria-label={`Add a video to ${pageName}`} onClick={() => editor.addEmbedBlock(pageKey)}>
					＋ Add video
				</button>
				<details className="more-blocks">
					<summary aria-label={`More things to add to ${pageName}`}>＋ More blocks</summary>
					<div>
						<button type="button" className="btn-link" aria-label={`Add a button to ${pageName}`} onClick={() => editor.addButtonBlock(pageKey)}>Add button</button>
						<button type="button" className="btn-link" aria-label={`Add a divider to ${pageName}`} onClick={() => editor.addDividerBlock(pageKey)}>Add divider</button>
						<button type="button" className="btn-link" aria-label={`Add a contact form to ${pageName}`} onClick={() => editor.addFormBlock(pageKey)}>Add contact form</button>
						{!nested && <button type="button" className="btn-link" aria-label={`Add a sub-page under ${pageName}`} onClick={addChild}>Add sub-page</button>}
					</div>
				</details>
			</div>

			{!nested && (page.children?.length ?? 0) > 0 && (
				<div className="nested-pages">
					{page.children!.map((childKey) => (
						<PageEditor key={childKey} pageKey={childKey} nested />
					))}
				</div>
			)}
		</Section>
	);
}
