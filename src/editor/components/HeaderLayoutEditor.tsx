import { useEditor } from '../store';
import { Field, Section } from './ui/controls';

/** Visual controls for the identity selected in Site → Header. */
export default function HeaderLayoutEditor({ embedded = false }: { embedded?: boolean }) {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;

	const { theme } = doc.content;
	const logoScale = theme.logoScale ?? 100;
	const logoPosition = theme.logoPosition ?? 'center';
	const logoX = theme.logoX ?? 50;
	const logoY = theme.logoY ?? 40;
	const logoStabilized = theme.stabilizeLogo !== false;
	const contentGap = theme.contentGap ?? 0;

	const applyLogoScale = (value: number) => {
		const clamped = Math.max(50, Math.min(Math.round(value), 200));
		setTheme({ logoScale: clamped === 100 ? undefined : clamped });
	};

	const fields = (
		<>
			<p className="muted header-layout-intro">Sizes and positions the site name or image logo chosen in Site → Header.</p>
			<Field label="Title size">
				<div className="gap-row">
					<input
						type="range"
						min={50}
						max={200}
						step={5}
						value={logoScale}
						onChange={(event) => applyLogoScale(Number(event.target.value))}
						aria-label="Title size"
					/>
					<span className="gap-unit">{logoScale}%</span>
					{logoScale !== 100 && (
						<button
							type="button"
							className="btn-icon btn-chip"
							onClick={() => applyLogoScale(100)}
							title="Back to the default size"
						>
							Reset
						</button>
					)}
				</div>
			</Field>

			<Field label="Title position" hint="Place the identity at the left, centered, or at your own coordinates.">
				<div className="chip-row" role="group" aria-label="Title position">
					{([
						['left', 'Left'],
						['center', 'Center'],
						['freeform', 'Freeform'],
					] as const).map(([value, label]) => (
						<button
							key={value}
							type="button"
							className={`btn-icon btn-chip ${logoPosition === value ? 'active' : ''}`}
							aria-pressed={logoPosition === value}
							onClick={() => setTheme({ logoPosition: value === 'center' ? undefined : value })}
						>
							{label}
						</button>
					))}
				</div>
			</Field>

			<Field
				label="Space before content"
				hint="Desktop distance between the header area and the page content. Negative pulls the page heading up."
			>
				<div className="gap-row">
					<input
						type="range"
						min={-72}
						max={120}
						step={4}
						value={contentGap}
						onChange={(event) => {
							const value = Number(event.target.value);
							setTheme({ contentGap: value === 0 ? undefined : value });
						}}
						aria-label="Space before content"
					/>
					<span className="gap-unit">{contentGap}px</span>
					{contentGap !== 0 && (
						<button
							type="button"
							className="btn-icon btn-chip"
							onClick={() => setTheme({ contentGap: undefined })}
							title="Back to the default spacing"
						>
							Reset
						</button>
					)}
				</div>
			</Field>

			<Field label="While visitors scroll" hint="This affects only the title. Navigation has its own setting in Structure above.">
				<div className="chip-row" role="group" aria-label="Title scroll behavior">
					<button type="button" className={`btn-icon btn-chip ${logoStabilized ? 'active' : ''}`} aria-pressed={logoStabilized} onClick={() => setTheme({ stabilizeLogo: undefined })}>Stays visible</button>
					<button type="button" className={`btn-icon btn-chip ${!logoStabilized ? 'active' : ''}`} aria-pressed={!logoStabilized} onClick={() => setTheme({ stabilizeLogo: false })}>Scrolls away</button>
				</div>
			</Field>

			{logoPosition === 'freeform' && (
				<div className="header-coordinate-fields">
					<Field label="Horizontal position">
						<div className="gap-row">
							<input
								type="range"
								min={0}
								max={100}
								step={1}
								value={logoX}
								onChange={(event) => setTheme({ logoX: Number(event.target.value) })}
								aria-label="Title horizontal position"
							/>
							<span className="gap-unit">{logoX}%</span>
						</div>
					</Field>
					<Field label="Distance from top">
						<div className="gap-row">
							<input
								type="range"
								min={0}
								max={400}
								step={1}
								value={logoY}
								onChange={(event) => setTheme({ logoY: Number(event.target.value) })}
								aria-label="Title distance from top"
							/>
							<span className="gap-unit">{logoY}px</span>
						</div>
					</Field>
				</div>
			)}
		</>
	);

	return embedded ? (
		<div className="header-layout-embedded">{fields}</div>
	) : (
		<Section title="Title placement" sectionKey="_header-layout">{fields}</Section>
	);
}
