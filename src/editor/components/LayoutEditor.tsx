// Site-wide layout tools: the canvas grid overlay + snap (an editor preference,
// shared by every freeform gallery in the preview) and the theme's header/content
// gap (published with the site). Lives in the editor panel so the tools are in
// one predictable place instead of floating above each gallery.
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import { GRID_OPTIONS, setGridPrefs, useGridPrefs } from '../../portfolio/gridPrefs';

const MAX_GAP = 400;

export default function LayoutEditor() {
	const { doc, setTheme } = useEditor();
	const gridPrefs = useGridPrefs();
	if (!doc) return null;
	const gap = doc.content.theme.contentGap ?? 0;

	const applyGap = (value: number) => {
		const clamped = Math.max(0, Math.min(Math.round(value), MAX_GAP));
		setTheme({ contentGap: clamped > 0 ? clamped : undefined });
	};

	return (
		<Section title="Layout">
			<Field label="Canvas grid" hint="An overlay in the preview for lining things up — never shown on your site.">
				<div className="grid-toolbar">
					{GRID_OPTIONS.map((n) => (
						<button
							key={n}
							type="button"
							className={`btn-icon btn-chip ${gridPrefs.cols === n ? 'active' : ''}`}
							onClick={() => setGridPrefs({ cols: n })}
							title={n === 0 ? 'Hide the grid overlay' : `Overlay a ${n}-column grid`}
						>
							{n === 0 ? 'Off' : String(n)}
						</button>
					))}
					<label className={`grid-snap ${gridPrefs.cols === 0 ? 'disabled' : ''}`}>
						<input
							type="checkbox"
							checked={gridPrefs.snap && gridPrefs.cols > 0}
							disabled={gridPrefs.cols === 0}
							onChange={(e) => setGridPrefs({ snap: e.target.checked })}
						/>
						Snap to grid
					</label>
				</div>
			</Field>
			<Field label="Gap between header and content" hint="Pushes every page’s content down from the top of the site.">
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
