// Fonts & colors for the whole site. Writes content.theme, which both the preview
// and the published Layout turn into the same CSS variables (see portfolio/theme.ts).
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import { isFontFile, FONT_EXTENSIONS, MAX_FONT_BYTES } from '../lib/validation';
import type { PageHeadingPosition, Theme } from '../../lib/content';
import { compatibleThemePresets } from '../lib/templates';
import { customFontValue, fontOptionsForTheme } from '../lib/font-options';

type ColorKey =
	| 'backgroundColor'
	| 'bodyTextColor'
	| 'headingTextColor'
	| 'subheadingTextColor'
	| 'mutedTextColor'
	| 'accentColor';

const COLOR_FIELDS: Array<{ key: ColorKey; label: string }> = [
	{ key: 'backgroundColor', label: 'Background' },
	{ key: 'headingTextColor', label: 'Headers' },
	{ key: 'subheadingTextColor', label: 'Subheaders' },
	{ key: 'bodyTextColor', label: 'Body text' },
	{ key: 'mutedTextColor', label: 'Muted text' },
	{ key: 'accentColor', label: 'Accent (hover, links)' },
];

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

const BACKGROUND_TEXTURES: Array<{
	value: NonNullable<Theme['backgroundTexture']> | '';
	label: string;
}> = [
	{ value: '', label: 'Color only' },
	{ value: 'corkboard', label: 'Corkboard' },
	{ value: 'blackboard', label: 'Blackboard' },
	{ value: 'wood', label: 'Wood grain' },
	{ value: 'fence', label: 'Fence' },
	{ value: 'concrete', label: 'Concrete' },
];

export default function ThemeEditor() {
	const { doc, setTheme, applyThemePreset, addCustomFont, removeCustomFont } = useEditor();
	const fontInputRef = useRef<HTMLInputElement>(null);
	const [fontError, setFontError] = useState<string | null>(null);
	if (!doc) return null;
	const theme = doc.content.theme;
	const customFonts = theme.customFonts ?? [];
	const options = fontOptionsForTheme(theme);
	const fontKnown = options.some((f) => f.value === theme.fontFamily);
	const headingFont = theme.headingFontFamily ?? '';
	const headingKnown = !headingFont || options.some((f) => f.value === headingFont);
	const automaticContrast = theme.automaticTextContrast !== false;
	const presets = compatibleThemePresets(doc);
	const textBoxFonts = new Set(
		Object.values(doc.content.pages).flatMap((page) =>
			(page.blocks ?? []).flatMap((block) =>
				block.type === 'text' && block.fontFamily ? [block.fontFamily] : [],
			),
		),
	);

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
		<Section title="Site style" sectionKey="_theme">
			<div className="theme-preset-section">
				<div className="theme-preset-heading">
					<strong>1. Choose a starting theme</strong>
					<span>Only themes that support this site’s page and gallery features appear.</span>
				</div>
				<div className="theme-preset-grid">
					{presets.map((preset) => {
						const selected = Object.entries(preset.tokens).every(
							([key, value]) => theme[key as keyof Theme] === value,
						);
						return (
							<button
								key={preset.id}
								type="button"
								className={`theme-preset-card${selected ? ' active' : ''}`}
								aria-pressed={selected}
								onClick={() => applyThemePreset(preset.tokens)}
							>
								<span
									className="theme-preset-swatch"
									style={{
										background: preset.tokens.backgroundColor,
										color: preset.tokens.textColor,
										borderColor: preset.tokens.mutedTextColor,
									}}
									aria-hidden="true"
								>
									<i style={{ background: preset.tokens.accentColor }} />
									Aa
								</span>
								<span>
									<strong>{preset.name}</strong>
									<small>{preset.description}</small>
								</span>
							</button>
						);
					})}
				</div>
				<p className="theme-preset-note">
					Applying a theme changes colors, type, and the navigation style. Your pages, words, images, uploads, and custom font files stay put — and one undo brings the old look back.
				</p>
			</div>
			<div className="design-control-heading">
				<span>2</span>
				<div>
					<strong>Surface & color</strong>
					<small>Set the wall first, then tune the palette and contrast.</small>
				</div>
			</div>
			<Field
				label="Wall material"
				hint="Puts a physical studio surface behind your work. Page and section colors still layer above it."
			>
				<div className="chip-row wall-material-options" role="group" aria-label="Site wall material">
					{BACKGROUND_TEXTURES.map((texture) => (
						<button
							key={texture.value || 'none'}
							type="button"
							className={`btn-icon btn-chip texture-chip texture-${texture.value || 'none'} ${
								(theme.backgroundTexture ?? '') === texture.value ? 'active' : ''
							}`}
							aria-pressed={(theme.backgroundTexture ?? '') === texture.value}
							onClick={() =>
								setTheme({
									backgroundTexture:
										(texture.value || undefined) as Theme['backgroundTexture'],
								})
							}
						>
							{texture.label}
						</button>
					))}
				</div>
			</Field>
			{COLOR_FIELDS.map(({ key, label }) => (
				<Field key={key} label={label} hint={key.endsWith('TextColor') ? 'This can be changed independently from the other text levels.' : undefined}>
					<div className="color-field">
						<input
							type="color"
							value={isHex(theme[key] ?? theme.textColor) ? (theme[key] ?? theme.textColor) : '#000000'}
							onChange={(e) => setTheme({ [key]: e.target.value })}
							aria-label={`${label} color`}
						/>
						<input
							className="text-input"
							value={theme[key] ?? theme.textColor}
							onChange={(e) => setTheme({ [key]: e.target.value })}
							placeholder="#111111"
						/>
					</div>
				</Field>
			))}
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
			<div className="design-control-heading">
				<span>3</span>
				<div>
					<strong>Typography & page titles</strong>
					<small>Choose the type system, then size and place recurring headings.</small>
				</div>
			</div>
			<Field
				label="Upload your own font"
				hint={`Upload a ${FONT_EXTENSIONS.join('/')} file — it appears immediately in both font lists and publishes with your site.`}
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
			{customFonts.map((f) => (
				<div className="font-row" key={f.name}>
					<span className="font-row-name" style={{ fontFamily: customFontValue(f.name) }}>
						{f.name}
					</span>
					{(
						theme.fontFamily === customFontValue(f.name) ||
						theme.headingFontFamily === customFontValue(f.name) ||
						textBoxFonts.has(customFontValue(f.name))
					) && <span className="count">in use</span>}
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
		</Section>
	);
}
