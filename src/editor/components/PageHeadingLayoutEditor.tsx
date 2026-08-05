import { useEditor } from '../store';
import type { PageHeadingPosition } from '../../lib/content';
import { Field, Section } from './ui/controls';

/** Placement controls for page headings such as “Selected Works”. Lives beside
 * Title placement in Design → Structure so every "where does this sit" control
 * shares one home; the heading's typeface and color stay in Style. */
export default function PageHeadingLayoutEditor() {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;

	const { theme } = doc.content;
	const pageHeadingScale = theme.pageHeadingScale ?? 100;
	const pageHeadingPosition = theme.pageHeadingPosition ?? 'right';
	const pageHeadingX = theme.pageHeadingX ?? 50;
	const pageHeadingY = theme.pageHeadingY ?? 56;

	const applyPageHeadingScale = (value: number) => {
		const clamped = Math.max(50, Math.min(Math.round(value), 200));
		setTheme({ pageHeadingScale: clamped === 100 ? undefined : clamped });
	};

	return (
		<Section title="Page heading placement" sectionKey="_page-heading-layout">
			<p className="muted header-layout-intro">
				Sizes and places page headings such as “Selected Works” across the whole site.
			</p>
			<Field label="Heading size">
				<div className="gap-row">
					<input
						type="range"
						min={50}
						max={200}
						step={5}
						value={pageHeadingScale}
						onChange={(event) => applyPageHeadingScale(Number(event.target.value))}
						aria-label="Heading size"
					/>
					<span className="gap-unit">{pageHeadingScale}%</span>
					{pageHeadingScale !== 100 && (
						<button
							type="button"
							className="btn-icon btn-chip"
							onClick={() => applyPageHeadingScale(100)}
							title="Back to the default size"
						>
							Reset
						</button>
					)}
				</div>
			</Field>
			<Field
				label="Heading position"
				hint="Freeform lets you drag the heading in the desktop preview or use the sliders — negative Down lifts it toward the header."
			>
				<div className="chip-row" role="group" aria-label="Heading position">
					{(['left', 'center', 'right', 'freeform'] as PageHeadingPosition[]).map((position) => (
						<button
							key={position}
							type="button"
							className={`btn-icon btn-chip ${pageHeadingPosition === position ? 'active' : ''}`}
							aria-pressed={pageHeadingPosition === position}
							onClick={() =>
								setTheme({ pageHeadingPosition: position === 'right' ? undefined : position })
							}
						>
							{position[0].toUpperCase() + position.slice(1)}
						</button>
					))}
				</div>
				{pageHeadingPosition === 'freeform' && (
					<div className="freeform-position-controls">
						<label className="gap-row">
							<span>Across</span>
							<input
								type="range"
								min={5}
								max={95}
								step={1}
								value={pageHeadingX}
								onChange={(event) => setTheme({ pageHeadingX: Number(event.target.value) })}
								aria-label="Heading horizontal position"
							/>
							<span className="gap-unit">{pageHeadingX}%</span>
						</label>
						<label className="gap-row">
							<span>Down</span>
							<input
								type="range"
								min={-120}
								max={240}
								step={1}
								value={pageHeadingY}
								onChange={(event) => setTheme({ pageHeadingY: Number(event.target.value) })}
								aria-label="Heading vertical position"
							/>
							<span className="gap-unit">{pageHeadingY}px</span>
						</label>
					</div>
				)}
			</Field>
		</Section>
	);
}
