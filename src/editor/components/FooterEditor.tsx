// The optional site-wide footer: a small centered line (or a few) at the very
// bottom of every page — typically a copyright notice or credits.
import { useEditor } from '../store';
import { Field, TextArea, Section } from './ui/controls';

export default function FooterEditor() {
	const { doc, setFooter } = useEditor();
	if (!doc) return null;
	return (
		<Section title="Footer" sectionKey="_footer">
			<Field
				label="Footer text"
				hint="Shown at the bottom of every page. Each new line stays on its own line. Leave empty for no footer."
			>
				<TextArea
					rows={2}
					value={doc.content.site.footer ?? ''}
					placeholder="© 2026 Your Name"
					onChange={(e) => setFooter(e.target.value)}
				/>
			</Field>
		</Section>
	);
}
