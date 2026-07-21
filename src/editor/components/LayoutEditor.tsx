// Site-wide layout tools published with the site (currently the header/content
// gap). The canvas grid overlay + snap moved to the preview toolbar
// (PreviewPanel's GridTools) so they stay reachable while scrolled deep into a
// page's controls.
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';

const MIN_GAP = -140;
const MAX_GAP = 400;

export default function LayoutEditor() {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;
	const gap = doc.content.theme.contentGap ?? 0;

	const applyGap = (value: number) => {
		const clamped = Math.max(MIN_GAP, Math.min(Math.round(value), MAX_GAP));
		setTheme({ contentGap: clamped !== 0 ? clamped : undefined });
	};

	return (
		<Section title="Layout" sectionKey="_layout">
			<Field label="Space above page content" hint="Move every page up or down. Negative values bring the work closer to the header; 0 restores the original position.">
				<div className="gap-row">
					<input
						type="range"
						min={MIN_GAP}
						max={MAX_GAP}
						step={1}
						value={gap}
						onChange={(e) => applyGap(Number(e.target.value))}
						aria-label="Space above page content"
					/>
					<input
						className="text-input gap-input"
						type="number"
						min={MIN_GAP}
						max={MAX_GAP}
						value={gap}
						onChange={(e) => applyGap(Number(e.target.value) || 0)}
						aria-label="Space above page content in pixels"
					/>
					<span className="gap-unit">px</span>
				</div>
			</Field>
		</Section>
	);
}
