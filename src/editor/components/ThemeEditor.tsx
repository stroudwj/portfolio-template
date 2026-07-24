// Fonts & colors for the whole site. Writes content.theme, which both the preview
// and the published Layout turn into the same CSS variables (see portfolio/theme.ts).
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import { isFontFile, FONT_EXTENSIONS, MAX_FONT_BYTES } from '../lib/validation';

const FONTS: Array<{ label: string; value: string }> = [
	{ label: 'Helvetica — clean sans', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
	{ label: 'System — native sans', value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
	{ label: 'Futura — geometric sans', value: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif' },
	{ label: 'Georgia — classic serif', value: 'Georgia, "Times New Roman", serif' },
	{ label: 'Palatino — bookish serif', value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
	{ label: 'Garamond — elegant serif', value: 'Garamond, "Apple Garamond", "EB Garamond", Georgia, serif' },
	{ label: 'Courier — typewriter mono', value: '"Courier New", Courier, monospace' },
];

type ColorKey = 'backgroundColor' | 'textColor' | 'mutedTextColor' | 'accentColor';

const COLOR_FIELDS: Array<{ key: ColorKey; label: string }> = [
	{ key: 'backgroundColor', label: 'Background' },
	{ key: 'textColor', label: 'Text' },
	{ key: 'mutedTextColor', label: 'Muted text' },
	{ key: 'accentColor', label: 'Accent (hover, links)' },
];

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** The fontFamily value a custom font is selected as. */
const customFontValue = (name: string) => `"${name}", sans-serif`;

export default function ThemeEditor() {
	const { doc, setTheme, addCustomFont, removeCustomFont } = useEditor();
	const fontInputRef = useRef<HTMLInputElement>(null);
	const [fontError, setFontError] = useState<string | null>(null);
	if (!doc) return null;
	const theme = doc.content.theme;
	const customFonts = theme.customFonts ?? [];
	const options = [
		...FONTS,
		...customFonts.map((f) => ({ label: `${f.name} — your font`, value: customFontValue(f.name) })),
	];
	const fontKnown = options.some((f) => f.value === theme.fontFamily);
	const headingFont = theme.headingFontFamily ?? '';
	const headingKnown = !headingFont || options.some((f) => f.value === headingFont);
	const automaticContrast = theme.automaticTextContrast !== false;
	const subheadingScale = theme.subheadingScale ?? 100;

	const applySubheadingScale = (value: number) => {
		const clamped = Math.max(50, Math.min(Math.round(value), 200));
		setTheme({ subheadingScale: clamped === 100 ? undefined : clamped });
	};

	const handleFontFile = (file: File | undefined) => {
		if (!file) return;
		if (!isFontFile(file)) {
			setFontError(`That isn’t a font file (use ${FONT_EXTENSIONS.join(', ')}).`);
			return;
		}
		if (file.size > MAX_FONT_BYTES) {
			setFontError(`Font files must be under ${MAX_FONT_BYTES / (1024 * 1024)} MB.`);
			return;
		}
		setFontError(null);
		addCustomFont(file);
	};

	return (
		<Section title="Fonts & colors" sectionKey="_theme">
			<Field
				label="Automatic readable text"
				hint="Adjust text, your logo/name, and navigation over colored page sections. Turn this off to keep your exact theme colors everywhere."
			>
				<div className="chip-row" role="group" aria-label="Automatic readable text">
					<button
						type="button"
						className={`btn-icon btn-chip ${automaticContrast ? 'active' : ''}`}
						onClick={() => setTheme({ automaticTextContrast: undefined })}
					>
						On
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${!automaticContrast ? 'active' : ''}`}
						onClick={() => setTheme({ automaticTextContrast: false })}
					>
						Off
					</button>
				</div>
			</Field>
			<Field label="Body font">
				<select
					className="text-input"
					value={fontKnown ? theme.fontFamily : '__custom'}
					onChange={(e) => {
						if (e.target.value !== '__custom') setTheme({ fontFamily: e.target.value });
					}}
				>
					{options.map((f) => (
						<option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
							{f.label}
						</option>
					))}
					{!fontKnown && <option value="__custom">Custom ({theme.fontFamily})</option>}
				</select>
			</Field>
			<Field label="Heading font" hint="Used for page titles and your name in the header.">
				<select
					className="text-input"
					value={headingKnown ? headingFont : '__custom'}
					onChange={(e) => {
						if (e.target.value !== '__custom') setTheme({ headingFontFamily: e.target.value || undefined });
					}}
				>
					<option value="">Same as body text</option>
					{options.map((f) => (
						<option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
							{f.label}
						</option>
					))}
					{!headingKnown && <option value="__custom">Custom ({headingFont})</option>}
				</select>
			</Field>
			<Field label="Small heading size" hint="Changes every Small heading text block across the whole site.">
				<div className="gap-row">
					<input
						type="range"
						min={50}
						max={200}
						step={5}
						value={subheadingScale}
						onChange={(e) => applySubheadingScale(Number(e.target.value))}
						aria-label="Small heading size"
					/>
					<span className="gap-unit">{subheadingScale}%</span>
					{subheadingScale !== 100 && (
						<button
							type="button"
							className="btn-icon btn-chip"
							onClick={() => applySubheadingScale(100)}
							title="Back to the default size"
						>
							Reset
						</button>
					)}
				</div>
			</Field>
			<Field
				label="Your own font"
				hint={`Upload a ${FONT_EXTENSIONS.join('/')} file — it’s added to the list above and published with your site.`}
				error={fontError ?? undefined}
			>
				<div>
					<input
						ref={fontInputRef}
						type="file"
						accept={FONT_EXTENSIONS.map((e) => `.${e}`).join(',')}
						hidden
						onChange={(e) => {
							handleFontFile(e.target.files?.[0]);
							e.target.value = '';
						}}
					/>
					<button type="button" className="btn-secondary" onClick={() => fontInputRef.current?.click()}>
						Upload font…
					</button>
				</div>
			</Field>
			{customFonts.map((f) => (
				<div className="font-row" key={f.name}>
					<span className="font-row-name" style={{ fontFamily: customFontValue(f.name) }}>
						{f.name}
					</span>
					{theme.fontFamily === customFontValue(f.name) && <span className="count">in use</span>}
					<button
						type="button"
						className="btn-icon danger"
						aria-label={`Remove the ${f.name} font`}
						onClick={() => removeCustomFont(f.name)}
					>
						✕
					</button>
				</div>
			))}
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
