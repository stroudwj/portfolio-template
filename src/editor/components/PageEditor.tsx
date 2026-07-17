// One page's full editing surface: name, optional heading, and its ordered body
// blocks — text anywhere, the image gallery, the About section, and sub-pages
// (thumbnail cards). Sub-pages get their own nested PageEditor so their galleries
// and text are edited in place; nesting is one level deep by design.
import { useEditor } from '../store';
import { Field, TextInput, TextArea, Section } from './ui/controls';
import ImageCollectionEditor from './ImageCollectionEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetUrl } from '../lib/assets';
import type { PageBlock } from '../../lib/content';

export default function PageEditor({ pageKey, nested = false }: { pageKey: string; nested?: boolean }) {
	const editor = useEditor();
	const { doc } = editor;
	if (!doc) return null;
	const page = doc.content.pages[pageKey];
	if (!page) return null;
	const isHome = pageKey === 'home';
	const blocks = page.blocks ?? [];

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
			case 'text':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Text</span>
							{controls(index, block, true)}
						</div>
						<TextArea
							rows={4}
							value={block.text}
							placeholder="Write something… One blank line makes a paragraph break."
							onChange={(e) => editor.updateTextBlock(pageKey, block.id, e.target.value)}
						/>
					</div>
				);
			case 'gallery':
				return (
					<div className="block" key={block.id}>
						<div className="block-head">
							<span className="block-label">Images</span>
							{controls(index, block, false)}
						</div>
						{page.gallery && (
							<ImageCollectionEditor
								embedded
								folder={page.gallery.folder}
								variant={isHome ? 'projects' : 'gallery'}
								addLabel="+ Add image(s)"
								emptyLabel="No images yet."
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
