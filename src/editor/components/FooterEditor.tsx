// The optional site-wide footer: a small centered line (or a few) at the very
// bottom of every page — typically a copyright notice or credits.
import { useRef } from 'react';
import { useEditor } from '../store';
import { Section } from './ui/controls';
import SignatureEditor from './SignatureEditor';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl } from '../lib/assets';

export default function FooterEditor() {
	const { doc, setFooter, setFooterImage, removeFooterImage, setFooterImageLayout } = useEditor();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	if (!doc) return null;
	const footerImageUrl = getAssetPreviewUrl(doc.footerImage.assetId);
	const hasFooterImage = !!(footerImageUrl || doc.footerImage.filename);

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
