import { useEditor } from '../store';
import { Field, HelpTip, Section, TextInput } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl } from '../lib/assets';

/** Global identity: the header's name or logo image. Sizing and placement live
 *  with the other layout tools in Design → Structure (HeaderLayoutEditor). */
export default function SiteIdentityEditor() {
	const {
		doc,
		setName,
		setHeaderMode,
		setLogoImage,
		removeLogoImage,
		setTheme,
	} = useEditor();
	if (!doc) return null;

	const { site } = doc.content;
	const logoUrl = getAssetPreviewUrl(doc.logoImage.assetId);
	const inferredHeaderMode =
		site.headerMode ??
		(logoUrl || doc.logoImage.filename ? 'image' : site.logo ? 'text' : 'name');
	const headerMode = inferredHeaderMode === 'image' ? 'image' : 'name';

	return (
		<Section
			title="Header"
			sectionKey="_identity"
			action={
				<HelpTip
					label="Where the rest of the header options live"
					tip="Header size, position, and scroll behavior live in Design → Structure."
				/>
			}
		>
			<Field label="Header text" hint="Changes only the text identity in the header and the site’s browser-title name. About has its own name field.">
				<TextInput
					value={site.name}
					placeholder="Your name"
					onChange={(event) => setName(event.target.value)}
				/>
			</Field>

			<Field label="Header displays" hint="Choose text or an uploaded image for the top of every page.">
				<div className="chip-row header-mode-row" role="group" aria-label="Header identity">
					<button type="button" className={`btn-icon btn-chip ${headerMode === 'name' ? 'active' : ''}`} aria-pressed={headerMode === 'name'} onClick={() => setHeaderMode('name')}>Text</button>
					<button type="button" className={`btn-icon btn-chip ${headerMode === 'image' ? 'active' : ''}`} aria-pressed={headerMode === 'image'} onClick={() => setHeaderMode('image')}>Image</button>
				</div>
			</Field>

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
			{headerMode === 'image' && (
				<Field label="Header image placement" hint="Freeform exposes the header position controls without changing its current coordinates.">
					<div className="chip-row">
						<button type="button" className={`btn-chip ${doc.content.theme.logoPosition !== 'freeform' ? 'active' : ''}`} onClick={() => setTheme({ logoPosition: 'center' })}>Normal</button>
						<button type="button" className={`btn-chip ${doc.content.theme.logoPosition === 'freeform' ? 'active' : ''}`} onClick={() => setTheme({ logoPosition: 'freeform' })}>Freeform</button>
					</div>
				</Field>
			)}

		</Section>
	);
}
