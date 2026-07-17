// Fonts & colors for the whole site. Writes content.theme, which both the preview
// and the published Layout turn into the same CSS variables (see portfolio/theme.ts).
import { useEditor } from '../store';
import type { Theme } from '../../lib/content';
import { Field, Section } from './ui/controls';

const FONTS: Array<{ label: string; value: string }> = [
	{ label: 'Helvetica — clean sans', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
	{ label: 'System — native sans', value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
	{ label: 'Futura — geometric sans', value: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif' },
	{ label: 'Georgia — classic serif', value: 'Georgia, "Times New Roman", serif' },
	{ label: 'Palatino — bookish serif', value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
	{ label: 'Garamond — elegant serif', value: 'Garamond, "Apple Garamond", "EB Garamond", Georgia, serif' },
	{ label: 'Courier — typewriter mono', value: '"Courier New", Courier, monospace' },
];

const COLOR_FIELDS: Array<{ key: keyof Theme; label: string }> = [
	{ key: 'backgroundColor', label: 'Background' },
	{ key: 'textColor', label: 'Text' },
	{ key: 'mutedTextColor', label: 'Muted text' },
	{ key: 'accentColor', label: 'Accent (hover, links)' },
];

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export default function ThemeEditor() {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;
	const theme = doc.content.theme;
	const fontKnown = FONTS.some((f) => f.value === theme.fontFamily);

	return (
		<Section title="Fonts & colors">
			<Field label="Font">
				<select
					className="text-input"
					value={fontKnown ? theme.fontFamily : '__custom'}
					onChange={(e) => {
						if (e.target.value !== '__custom') setTheme({ fontFamily: e.target.value });
					}}
				>
					{FONTS.map((f) => (
						<option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
							{f.label}
						</option>
					))}
					{!fontKnown && <option value="__custom">Custom ({theme.fontFamily})</option>}
				</select>
			</Field>
			{COLOR_FIELDS.map(({ key, label }) => (
				<Field key={key} label={label}>
					<div className="color-field">
						<input
							type="color"
							value={isHex(theme[key]) ? theme[key] : '#000000'}
							onChange={(e) => setTheme({ [key]: e.target.value })}
							aria-label={`${label} color`}
						/>
						<input
							className="text-input"
							value={theme[key]}
							onChange={(e) => setTheme({ [key]: e.target.value })}
							placeholder="#111111"
						/>
					</div>
				</Field>
			))}
		</Section>
	);
}
