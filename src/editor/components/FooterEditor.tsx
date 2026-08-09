// The optional site-wide footer: a small centered line (or a few) at the very
// bottom of every page — typically a copyright notice or credits.
import { useRef } from 'react';
import { useEditor } from '../store';
import { Section } from './ui/controls';
import SignatureEditor from './SignatureEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl } from '../lib/assets';

export default function FooterEditor() {
	const {
		doc,
		setFooter,
		setFooterImage,
		removeFooterImage,
		setFooterImageLayout,
		setFooterName,
		setFooterNameSize,
		setFooterColumns,
	} = useEditor();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	if (!doc) return null;
	const footerImageUrl = getAssetPreviewUrl(doc.footerImage.assetId);
	const hasFooterImage = !!(footerImageUrl || doc.footerImage.filename);
	const columns = doc.content.site.footerColumns ?? [];
	const updateColumn = (index: number, patch: Partial<(typeof columns)[number]>) =>
		setFooterColumns(columns.map((column, i) => (i === index ? { ...column, ...patch } : column)));

	const insertCopyright = () => {
		const textarea = textareaRef.current;
		const value = doc.content.site.footer ?? '';
		const start = textarea?.selectionStart ?? value.length;
		const end = textarea?.selectionEnd ?? start;
		setFooter(`${value.slice(0, start)}©${value.slice(end)}`);
		window.requestAnimationFrame(() => {
			textarea?.focus();
			textarea?.setSelectionRange(start + 1, start + 1);
		});
	};

	return (
		<>
		<Section title="Footer" sectionKey="_footer" defaultCollapsed>
			<div className="field">
				<label className="field-label" htmlFor="site-footer-text">Footer text</label>
				<textarea
					ref={textareaRef}
					id="site-footer-text"
					className="text-area"
					rows={2}
					value={doc.content.site.footer ?? ''}
					placeholder="© 2026 Your Name"
					onChange={(e) => setFooter(e.target.value)}
				/>
				<div className="footer-field-meta">
					<span className="field-hint">Shown on every page. Leave empty to remove it.</span>
					<button type="button" className="btn-secondary footer-symbol-button" onClick={insertCopyright}>
						Insert ©
					</button>
				</div>
			</div>
			<div className="field">
				<label className="field-label" htmlFor="site-footer-name">Large closing name</label>
				<input
					id="site-footer-name"
					className="text-input"
					value={doc.content.site.footerName ?? ''}
					placeholder="Your Name"
					onChange={(e) => setFooterName(e.target.value)}
				/>
				<span className="field-hint">A display-size name above the footer, like a closing signature wall.</span>
				{(doc.content.site.footerName ?? '').trim() && (
					<label className="field-inline">
						Size (pt)
						<input
							type="number"
							className="text-input"
							min={8}
							max={300}
							value={doc.content.site.footerNameSize ?? 72}
							aria-label="Closing name size in points"
							onChange={(e) => {
								const value = Number(e.target.value);
								setFooterNameSize(value === 72 ? undefined : value);
							}}
						/>
					</label>
				)}
			</div>
			<div className="field">
				<span className="field-label">Link columns</span>
				<span className="field-hint">Up to three headed lists — a site map, contact links.</span>
				{columns.map((column, columnIndex) => (
					<div className="footer-column-editor" key={columnIndex}>
						<div className="form-field-row">
							<input
								className="text-input"
								value={column.heading ?? ''}
								placeholder="Column heading"
								aria-label={`Heading of footer column ${columnIndex + 1}`}
								onChange={(e) => updateColumn(columnIndex, { heading: e.target.value || undefined })}
							/>
							<button
								type="button"
								className="btn-icon danger"
								aria-label={`Remove footer column ${columnIndex + 1}`}
								onClick={() => setFooterColumns(columns.filter((_, i) => i !== columnIndex))}
							>✕</button>
						</div>
						{column.links.map((link, linkIndex) => (
							<div className="form-field-row" key={linkIndex}>
								<input
									className="text-input"
									value={link.label}
									placeholder="Label"
									aria-label={`Label of link ${linkIndex + 1} in footer column ${columnIndex + 1}`}
									onChange={(e) =>
										updateColumn(columnIndex, {
											links: column.links.map((item, i) => (i === linkIndex ? { ...item, label: e.target.value } : item)),
										})
									}
								/>
								<input
									className="text-input"
									value={link.url}
									placeholder="Page (about) or https://…"
									aria-label={`Address of link ${linkIndex + 1} in footer column ${columnIndex + 1}`}
									onChange={(e) =>
										updateColumn(columnIndex, {
											links: column.links.map((item, i) => (i === linkIndex ? { ...item, url: e.target.value } : item)),
										})
									}
								/>
								<button
									type="button"
									className="btn-icon danger"
									aria-label={`Remove link ${linkIndex + 1} from footer column ${columnIndex + 1}`}
									onClick={() =>
										updateColumn(columnIndex, { links: column.links.filter((_, i) => i !== linkIndex) })
									}
								>✕</button>
							</div>
						))}
						<button
							type="button"
							className="btn-link"
							aria-label={`Add a link to footer column ${columnIndex + 1}`}
							onClick={() => updateColumn(columnIndex, { links: [...column.links, { label: '', url: '' }] })}
						>＋ Add a link</button>
					</div>
				))}
				{columns.length < 3 && (
					<button
						type="button"
						className="btn-link"
						onClick={() => setFooterColumns([...columns, { heading: '', links: [{ label: '', url: '' }] }])}
					>＋ Add a column</button>
				)}
			</div>
			<div className="field">
				<span className="field-label">Footer image</span>
				<div className="image-picker">
					{footerImageUrl && <img className="thumb" src={footerImageUrl} alt="" />}
					<ImageDrop ariaLabel="Choose a footer image" onFiles={(files) => setFooterImage(files[0])}>
						<span>{hasFooterImage ? 'Replace footer image' : 'Click or drop a footer image'}</span>
					</ImageDrop>
					{doc.footerImage.filename && <span className="asset-filename">{doc.footerImage.filename}</span>}
					{hasFooterImage && <button type="button" className="btn-ghost" onClick={removeFooterImage}>Remove</button>}
				</div>
				{hasFooterImage && (
					<div className="chip-row">
						<button type="button" className={`btn-chip ${!doc.content.site.footerImageLayout ? 'active' : ''}`} onClick={() => setFooterImageLayout(undefined)}>Normal flow</button>
						<button type="button" className={`btn-chip ${doc.content.site.footerImageLayout ? 'active' : ''}`} onClick={() => setFooterImageLayout(doc.content.site.footerImageLayout ?? { x: 40, y: 0, w: 20, ar: 1 })}>Freeform</button>
					</div>
				)}
			</div>
		</Section>
		<SignatureEditor />
		</>
	);
}
