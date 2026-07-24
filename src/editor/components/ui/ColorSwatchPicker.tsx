// A compact, reusable color picker for color-blocking: a swatch button that opens
// a small popover of preset colors + a custom picker + a "none" clear. Used for
// per-page backgrounds and per-section colors in PageEditor.
import { useState } from 'react';

/** A curated, harmonious palette: soft paper tints, inks, and a few bolder blocks. */
const PRESET_COLORS = [
	'#faf7f2', '#f1ece3', '#e7e0d3', '#2a2a2a', '#141414',
	'#f6d9d0', '#f7ecc9', '#dcebd6', '#d2e2ee', '#e6dcf1',
	'#e0685b', '#e0a94a', '#5f9070', '#4a78a8', '#8a6bb0',
];

const isHex6 = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

export function ColorSwatchPicker({
	value,
	onChange,
	label,
	themeColors = [],
}: {
	value?: string;
	onChange: (color: string | undefined) => void;
	/** Accessible name for the trigger + popover. */
	label: string;
	/** The site's own theme colors, shown first so blocks can echo the palette. */
	themeColors?: string[];
}) {
	const [open, setOpen] = useState(false);
	const swatches = [...themeColors, ...PRESET_COLORS].filter(
		(color, i, all) => all.findIndex((c) => c.toLowerCase() === color.toLowerCase()) === i,
	);

	return (
		<div className="color-swatch-picker">
			<button
				type="button"
				className={`color-swatch-trigger ${value ? 'has-color' : ''}`}
				style={value ? { background: value } : undefined}
				onClick={() => setOpen((o) => !o)}
				aria-label={value ? `${label} (${value}). Change color` : `${label}. Add a color`}
				aria-expanded={open}
				title={label}
			>
				{value ? '' : '🎨'}
			</button>
			{open && (
				<>
					<div className="color-swatch-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
					<div className="color-swatch-popover" role="dialog" aria-label={label}>
						<div className="color-swatch-grid">
							<button
								type="button"
								className={`color-swatch is-none ${!value ? 'active' : ''}`}
								onClick={() => {
									onChange(undefined);
									setOpen(false);
								}}
								aria-label="No color"
								title="None"
							>
								✕
							</button>
							{swatches.map((color) => (
								<button
									key={color}
									type="button"
									className={`color-swatch ${value?.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
									style={{ background: color }}
									onClick={() => {
										onChange(color);
										setOpen(false);
									}}
									aria-label={`Use ${color}`}
									title={color}
								/>
							))}
						</div>
						<label className="color-swatch-custom">
							<span>Custom</span>
							<input
								type="color"
								value={value && isHex6(value) ? value : '#ffffff'}
								onChange={(e) => onChange(e.target.value)}
								aria-label={`Custom color for ${label}`}
							/>
						</label>
					</div>
				</>
			)}
		</div>
	);
}
