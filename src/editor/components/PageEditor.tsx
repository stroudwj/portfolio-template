// One page's full editing surface: name, optional heading, and its ordered body
// blocks — text anywhere, the image gallery, the About section, and sub-pages
// (thumbnail cards). Sub-pages get their own nested PageEditor so their galleries
// and text are edited in place; nesting is one level deep by design.
import { useEditor } from '../store';
import { Field, TextInput, TextArea, Section } from './ui/controls';
import ImageCollectionEditor from './ImageCollectionEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetUrl } from '../lib/assets';
import { videoEmbedSrc } from '../../portfolio/videoEmbed';
import { uniformColumns } from '../../portfolio/Gallery';
import type { PageBlock, TextAlign } from '../../lib/content';

const ALIGNMENTS: Array<{ value: TextAlign; label: string; title: string }> = [
	{ value: 'left', label: 'L', title: 'Align left' },
	{ value: 'center', label: 'C', title: 'Align center' },
	{ value: 'right', label: 'R', title: 'Align right' },
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

export default function PageEditor({ pageKey, nested = false }: { pageKey: string; nested?: boolean }) {
	const editor = useEditor();
	const { doc } = editor;
	if (!doc) return null;
	const page = doc.content.pages[pageKey];
	if (!page) return null;
	const isHome = pageKey === 'home';
	const blocks = page.blocks ?? [];
	const galleryMode = page.gallery?.layout === 'grid' ? 'grid' : 'freeform';
	/** Text can be dragged onto the canvas only when the page shows a freeform gallery. */
	const hasFreeCanvas = !!page.gallery && galleryMode === 'freeform' && blocks.some((b) => b.type === 'gallery');

	const removeThisPage = () => {
		const extra = page.children?.length ? ' and its sub-pages' : '';
		if (confirm(`Delete the “${page.label ?? pageKey}” page${extra}? Its images come off the site too.`))
			editor.removePage(pageKey);
	};
	const addChild = () => {
		const name = prompt('Name of the new sub-page:');
		if (name?.trim()) editor.addChildPage(pageKey, name.trim());
	};

	const controls = (index: number, block: PageBlock, removable: boolean) => (
		<div className="block-controls">
			<button
				type="button"
				className="btn-icon"
				disabled={index === 0}
				onClick={() => editor.moveBlock(pageKey, index, index - 1)}
				aria-label="Move up"
			>
				↑
			</button>
			<button
				type="button"
				className="btn-icon"
				disabled={index === blocks.length - 1}
				onClick={() => editor.moveBlock(pageKey, index, index + 1)}
				aria-label="Move down"
			>
				↓
			</button>
			{removable && (
				<button
					type="button"
					className="btn-icon danger"
					onClick={() => editor.removeBlock(pageKey, block.id)}
					aria-label="Remove"
				>
					✕
				</button>
			)}
		</div>
	);

	const renderBlock = (block: PageBlock, index: number) => {
		switch (block.type) {
			case 'text': {
				const align = block.align ?? 'left';
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Text</span>
							<div className="align-toggle" role="group" aria-label="Text alignment">
								{ALIGNMENTS.map((a) => (
									<button
										key={a.value}
										type="button"
										className={`btn-icon ${align === a.value ? 'active' : ''}`}
										title={a.title}
										aria-label={a.title}
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
							value={block.text}
							placeholder="Write something… One blank line makes a paragraph break."
							onChange={(e) => editor.updateTextBlock(pageKey, block.id, e.target.value)}
						/>
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
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Video</span>
							{controls(index, block, true)}
						</div>
						<input
							className={`text-input ${invalid ? 'invalid' : ''}`}
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
								<div className="align-toggle" role="group" aria-label="Image layout">
									<button
										type="button"
										className={`btn-icon btn-chip ${galleryMode === 'freeform' ? 'active' : ''}`}
										title="Freeform canvas — drag images anywhere in the preview"
										aria-pressed={galleryMode === 'freeform'}
										onClick={() => editor.setGalleryConfig(pageKey, { layout: undefined })}
									>
										Freeform
									</button>
									<button
										type="button"
										className={`btn-icon btn-chip ${galleryMode === 'grid' ? 'active' : ''}`}
										title="Auto grid — images arrange themselves in neat rows"
										aria-pressed={galleryMode === 'grid'}
										onClick={() => editor.setGalleryConfig(pageKey, { layout: 'grid' })}
									>
										Grid
									</button>
								</div>
							)}
							{controls(index, block, false)}
						</div>
						{page.gallery && galleryMode === 'grid' && (
							<div className="grid-options">
								<label className="grid-option">
									Columns
									<select
										className="select-input"
										value={uniformColumns(page.gallery.columns)}
										onChange={(e) => editor.setGalleryConfig(pageKey, { columns: Number(e.target.value) })}
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
										value={page.gallery.aspect ?? ''}
										onChange={(e) => editor.setGalleryConfig(pageKey, { aspect: e.target.value || undefined })}
									>
										{CROP_OPTIONS.map((o) => (
											<option key={o.value} value={o.value}>
												{o.label}
											</option>
										))}
									</select>
								</label>
							</div>
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
					</div>
				);
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
							{controls(index, block, false)}
						</div>
						{(page.children ?? []).map((childKey) => {
							const child = doc.content.pages[childKey];
							const thumbUrl = getAssetUrl(doc.pageThumbs[childKey]?.assetId ?? null);
							return (
								<div className="child-row" key={childKey}>
									<div className="child-thumb-picker">
										<ImageDrop onFiles={(files) => editor.setPageThumb(childKey, files[0])}>
											{thumbUrl ? <img className="child-thumb" src={thumbUrl} alt="" /> : <span>＋ Thumb</span>}
										</ImageDrop>
									</div>
									<TextInput
										value={child?.label ?? childKey}
										onChange={(e) => editor.renamePage(childKey, e.target.value)}
										placeholder="Sub-page name"
									/>
									<button
										type="button"
										className="btn-icon danger"
										onClick={() => {
											if (confirm(`Delete the “${child?.label ?? childKey}” sub-page?`)) editor.removePage(childKey);
										}}
										aria-label="Delete sub-page"
									>
										✕
									</button>
								</div>
							);
						})}
						<p className="muted">
							Each sub-page is its own page with images and text — edit them below. Without a thumbnail, the card uses
							the sub-page’s first image.
						</p>
					</div>
				);
		}
	};

	return (
		<Section
			sectionKey={pageKey}
			title={nested ? `↳ ${page.label ?? pageKey}` : isHome ? 'Page: Home' : `Page: ${page.label ?? pageKey}`}
			action={
				!isHome ? (
					<button type="button" className="btn-icon danger" onClick={removeThisPage} aria-label="Delete page">
						✕
					</button>
				) : undefined
			}
		>
			{!isHome && !nested && (
				<Field label="Page name">
					<TextInput value={page.label ?? ''} onChange={(e) => editor.renamePage(pageKey, e.target.value)} />
				</Field>
			)}
			<Field label="Heading (optional)">
				<TextInput
					value={page.heading ?? ''}
					placeholder="Shown at the top of the page"
					onChange={(e) => editor.setPageHeading(pageKey, e.target.value)}
				/>
			</Field>

			{blocks.map(renderBlock)}

			<div className="block-adders">
				<button type="button" className="btn-link" onClick={() => editor.addTextBlock(pageKey)}>
					＋ Add text
				</button>
				<button type="button" className="btn-link" onClick={() => editor.addEmbedBlock(pageKey)}>
					＋ Add video
				</button>
				{!nested && (
					<button type="button" className="btn-link" onClick={addChild}>
						＋ Add sub-page
					</button>
				)}
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
