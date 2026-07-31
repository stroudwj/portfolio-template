import { useEditor } from '../store';
import { Field, Section } from './ui/controls';

/** Visual controls for whichever identity Site → Site identity chooses. */
export default function HeaderLayoutEditor() {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;

	const { theme } = doc.content;
	const logoScale = theme.logoScale ?? 100;
	const logoPosition = theme.logoPosition ?? 'center';
	const logoX = theme.logoX ?? 50;
	const logoY = theme.logoY ?? 40;

	const applyLogoScale = (value: number) => {
		const clamped = Math.max(50, Math.min(Math.round(value), 200));
		setTheme({ logoScale: clamped === 100 ? undefined : clamped });
	};

	return (
		<Section title="Header placement" sectionKey="_header-layout">
			<p className="muted header-layout-intro">Sizes and positions the site name, custom text, or image logo chosen in Site.</p>
			<Field label="Header size">
				<div className="gap-row">
					<input
						type="range"
						min={50}
						max={200}
						step={5}
						value={logoScale}
						onChange={(event) => applyLogoScale(Number(event.target.value))}
						aria-label="Header size"
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

			<Field label="Header position" hint="Place the identity at the left, centered, or at your own coordinates.">
				<div className="chip-row" role="group" aria-label="Header position">
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
								aria-label="Header horizontal position"
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
								aria-label="Header distance from top"
							/>
							<span className="gap-unit">{logoY}px</span>
						</div>
					</Field>
				</div>
			)}
		</Section>
	);
}
