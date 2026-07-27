import { useEditor } from '../store';
import type { HeaderMode } from '../../lib/content';
import { Field, Section, TextInput } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl } from '../lib/assets';

const HEADER_MODES: Array<{ value: HeaderMode; label: string }> = [
	{ value: 'name', label: 'Site name' },
	{ value: 'text', label: 'Custom text' },
	{ value: 'image', label: 'Image logo' },
];

/** Global identity and the single explicit choice that controls what the header
 * displays. Visual sizing and placement live in Design → Header layout. */
export default function SiteIdentityEditor() {
	const {
		doc,
		setName,
		setHeaderMode,
		setLogoText,
		setLogoImage,
		removeLogoImage,
	} = useEditor();
	if (!doc) return null;

	const { site } = doc.content;
	const logoUrl = getAssetPreviewUrl(doc.logoImage.assetId);
	const headerMode =
		site.headerMode ??
		(logoUrl || doc.logoImage.filename ? 'image' : site.logo ? 'text' : 'name');

	return (
		<Section title="Site identity" sectionKey="_identity">
			<Field label="Site name" hint="Used on your About page, in browser titles, and whenever the header uses your name.">
				<TextInput
					value={site.name}
					placeholder="Your name"
					onChange={(event) => setName(event.target.value)}
				/>
			</Field>

			<Field label="Header displays" hint="Choose one identity for the top of every page.">
				<div className="chip-row header-mode-row" role="group" aria-label="Header identity">
					{HEADER_MODES.map((mode) => (
						<button
							key={mode.value}
							type="button"
							className={`btn-icon btn-chip ${headerMode === mode.value ? 'active' : ''}`}
							aria-pressed={headerMode === mode.value}
							onClick={() => setHeaderMode(mode.value)}
						>
							{mode.label}
						</button>
					))}
				</div>
			</Field>

			{headerMode === 'text' && (
				<Field label="Custom header text" hint="Leave blank to fall back to your site name.">
					<TextInput
						value={site.logo ?? ''}
						placeholder={site.name || 'Your name'}
						onChange={(event) => setLogoText(event.target.value)}
					/>
				</Field>
			)}

			{headerMode === 'image' && (
				<Field label="Header image" hint="Upload a transparent PNG or SVG when possible.">
					<div className="image-picker">
						{logoUrl && <img className="thumb logo-thumb" src={logoUrl} alt="" />}
						<ImageDrop ariaLabel="Choose a header logo image" onFiles={(files) => setLogoImage(files[0])}>
							<span>{logoUrl || doc.logoImage.filename ? 'Replace logo image' : 'Click or drop a logo image'}</span>
						</ImageDrop>
						{doc.logoImage.filename && <span className="asset-filename">{doc.logoImage.filename}</span>}
						{(logoUrl || doc.logoImage.filename) && (
							<button type="button" className="btn-ghost" onClick={removeLogoImage}>
								Remove
							</button>
						)}
					</div>
				</Field>
			)}

			<p className="muted identity-layout-note">Size and position are in Design → Header layout.</p>
		</Section>
	);
}
