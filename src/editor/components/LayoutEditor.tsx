// Site-wide layout tools published with the site (currently the header/content
// gap). The canvas grid overlay + snap moved to the preview toolbar
// (PreviewPanel's GridTools) so they stay reachable while scrolled deep into a
// page's controls.
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';

const MAX_GAP = 400;

export default function LayoutEditor() {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;
	const gap = doc.content.theme.contentGap ?? 0;

	const applyGap = (value: number) => {
		const clamped = Math.max(0, Math.min(Math.round(value), MAX_GAP));
		setTheme({ contentGap: clamped > 0 ? clamped : undefined });
	};

	return (
		<Section title="Layout" sectionKey="_layout">
			<Field label="Gap between header and content" hint="Pushes every page’s content down from the top of the site. The canvas grid toggle lives above the preview.">
				<div className="gap-row">
					<input
						type="range"
						min={0}
						max={MAX_GAP}
						step={1}
						value={gap}
						onChange={(e) => applyGap(Number(e.target.value))}
						aria-label="Header gap"
					/>
					<input
						className="text-input gap-input"
						type="number"
						min={0}
						max={MAX_GAP}
						value={gap}
						onChange={(e) => applyGap(Number(e.target.value) || 0)}
						aria-label="Header gap in pixels"
					/>
					<span className="gap-unit">px</span>
				</div>
			</Field>
		</Section>
	);
}
