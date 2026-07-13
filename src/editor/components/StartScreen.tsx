import { useRef } from 'react';
import { useEditor } from '../store';
import type { Content } from '../../lib/content';

export default function StartScreen() {
	const { startBlank, startExisting, resumeDraft, importContent, hasDraft } = useEditor();
	const fileRef = useRef<HTMLInputElement>(null);

	const onImport = (file: File) => {
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = JSON.parse(String(reader.result)) as Content;
				importContent(parsed);
			} catch {
				alert('That file isn’t valid JSON.');
			}
		};
		reader.readAsText(file);
	};

	return (
		<div className="start">
			<div className="start-card">
				<h1>Portfolio Editor</h1>
				<p>Build your portfolio without writing code. Fill in your details, upload images, drag to reorder, watch the live preview, then export a ready-to-publish site.</p>
				<div className="start-actions">
					<button type="button" className="btn-primary" onClick={startExisting}>
						Edit current portfolio
					</button>
					<button type="button" className="btn-secondary" onClick={startBlank}>
						Start from blank
					</button>
				</div>
				<div className="start-links">
					<button type="button" className="btn-link" onClick={() => fileRef.current?.click()}>
						Import a content.json…
					</button>
					{hasDraft && (
						<button type="button" className="btn-link" onClick={() => resumeDraft()}>
							Resume where you left off
						</button>
					)}
				</div>
				<input
					ref={fileRef}
					type="file"
					accept="application/json,.json"
					hidden
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) onImport(f);
						e.target.value = '';
					}}
				/>
			</div>
		</div>
	);
}
