// The optional site-wide footer: a small centered line (or a few) at the very
// bottom of every page — typically a copyright notice or credits.
import { useRef } from 'react';
import { useEditor } from '../store';
import { Section } from './ui/controls';

export default function FooterEditor() {
	const { doc, setFooter } = useEditor();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	if (!doc) return null;

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
		<Section title="Footer" sectionKey="_footer">
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
		</Section>
	);
}
