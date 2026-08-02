import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, TextInput } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl, getAssetUrl } from '../lib/assets';
import { sampleArtworkUrl } from '../lib/sample-artwork';
import { isEmail, isPdfFile, MAX_PDF_BYTES, MAX_PDF_MB } from '../lib/validation';
import { SocialLinksFields } from './SocialLinksEditor';
import ImageCropDialog, { type ImageCropSettings } from './ImageCropDialog';
import RichTextEditor from './RichTextEditor';
import { fontOptionsForTheme } from '../lib/font-options';

/** The content rendered by an About block. It lives in the page workspace so
 * artists can edit the words and immediately see that page update beside it. */
export default function AboutContentEditor() {
	const {
		doc,
		setProfileName,
		setBio,
		setProfileBioFont,
		setEmail,
		setProfileImage,
		removeProfileImage,
		setProfileImagePresentation,
		setResumeFile,
		removeResume,
	} = useEditor();
	const resumeInputRef = useRef<HTMLInputElement>(null);
	const [resumeError, setResumeError] = useState<string | null>(null);
	const [cropOpen, setCropOpen] = useState(false);
	if (!doc) return null;

	const { content } = doc;
	const profileUrl =
		getAssetPreviewUrl(doc.profileImage.assetId) ??
		sampleArtworkUrl(doc.profileImage.sampleAssetId);
	const emailError =
		content.contact.email && !isEmail(content.contact.email)
			? 'Enter a valid email address.'
			: undefined;
	const resumeName = doc.resumeFile?.filename ?? '';
	const resumeUrl = getAssetUrl(doc.resumeFile?.assetId);
	const photoWidth = content.profile.imageWidth ?? 160;
	const photoAspect = content.profile.imageAspect ?? '';
	const photoLayout = content.profile.imageLayout;
	const bioFont = content.profile.bioFontFamily ?? '';
	const fontOptions = fontOptionsForTheme(content.theme);
	const parsedPhotoAspect = (value: string | undefined) => {
		const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(value ?? '');
		return match ? Number(match[1]) / Number(match[2]) : undefined;
	};
	const placeElementsFreeform = () => {
		const save = (ar: number) => {
			const previewFrame = Array.from(
				document.querySelectorAll<HTMLIFrameElement>('iframe.device-frame'),
			).find((frame) => frame.contentDocument?.querySelector('.profile-image-frame'));
			const previewDoc = previewFrame?.contentDocument;
			const photo = previewDoc?.querySelector<HTMLElement>('.profile-image-frame');
			const bio = previewDoc?.querySelector<HTMLElement>('.bio-container');
			const bioText = previewDoc?.querySelector<HTMLElement>('.bio-text');
			const section = photo?.closest<HTMLElement>('.portfolio-page-part');
			if (photo && bio && bioText && section) {
				const sectionRect = section.getBoundingClientRect();
				const photoRect = photo.getBoundingClientRect();
				const bioRect = bio.getBoundingClientRect();
				const textRect = bioText.getBoundingClientRect();
				if (sectionRect.width > 0 && photoRect.width > 0 && photoRect.height > 0) {
					const unit = 100 / sectionRect.width;
					const contentHeight = Math.max(bioRect.bottom - textRect.top, 24);
					setProfileImagePresentation({
						imageLayout: {
							x: (photoRect.left - sectionRect.left) * unit,
							y: (photoRect.top - sectionRect.top) * unit,
							w: photoRect.width * unit,
							ar: photoRect.width / photoRect.height,
							z: 2,
						},
						contentLayout: {
							x: (textRect.left - sectionRect.left) * unit,
							y: (textRect.top - sectionRect.top) * unit,
							w: bioRect.width * unit,
							ar: Math.max(bioRect.width / contentHeight, 0.2),
							z: 3,
						},
					});
					return;
				}
			}

			const previewWidth = previewFrame?.contentWindow?.innerWidth || 1200;
			const width = Math.min(Math.max((photoWidth / previewWidth) * 100, 5), 90);
			setProfileImagePresentation({
				imageLayout: { x: 25, y: 0, w: width, ar: Math.max(ar, 0.1), z: 2 },
				contentLayout: {
					x: 25,
					y: width / Math.max(ar, 0.1) + 2,
					w: 33.333,
					ar: 1.25,
					z: 3,
				},
			});
		};
		const cropRatio = parsedPhotoAspect(photoAspect);
		if (cropRatio) {
			save(cropRatio);
			return;
		}
		const image = new Image();
		image.onload = () => save(image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 4 / 3);
		image.onerror = () => save(4 / 3);
		image.src = profileUrl ?? '';
	};

	const handleResumeFile = (file: File | undefined) => {
		if (!file) return;
		if (!isPdfFile(file)) {
			setResumeError('That isn’t a PDF — export your résumé as a .pdf file first.');
			return;
		}
		if (file.size > MAX_PDF_BYTES) {
			setResumeError(`Résumé PDFs must be under ${MAX_PDF_MB} MB.`);
			return;
		}
		setResumeError(null);
		setResumeFile(file);
	};

	return (
		<div className="about-content-fields">
			<Field label="Name shown here" hint="This name belongs only to the About block; it does not change the site header.">
				<TextInput
					value={content.profile.name ?? ''}
					placeholder="Your name"
					onChange={(event) => setProfileName(event.target.value)}
				/>
			</Field>

			<Field label="About photo" hint="Optional. Shown with your bio on this page.">
				<div className="image-picker">
					{profileUrl && <img className="thumb" src={profileUrl} alt="" />}
					<ImageDrop ariaLabel="Choose an About photo" onFiles={(files) => setProfileImage(files[0])}>
						<span>{profileUrl ? 'Replace photo' : 'Click or drop a photo'}</span>
					</ImageDrop>
					{profileUrl && (
						<button type="button" className="btn-ghost" onClick={removeProfileImage}>
							Remove
						</button>
					)}
				</div>
			</Field>
			{profileUrl && (
				<div className="about-photo-controls">
					<div className="about-photo-action-row">
						<button type="button" className="btn-secondary" onClick={() => setCropOpen(true)}>
							Crop photo…
						</button>
						<button
							type="button"
							className="btn-secondary"
							onClick={() =>
								photoLayout
									? setProfileImagePresentation({ imageLayout: undefined, contentLayout: undefined })
									: placeElementsFreeform()
							}
						>
							{photoLayout ? 'Return elements to About flow' : 'Place elements in Freeform'}
						</button>
					</div>
					<p className="muted">
						{photoLayout
							? 'The photo and About text are separate Freeform elements. Drag and resize either one in the preview.'
							: 'Freeform keeps the current photo-then-text arrangement as its starting point, then lets both elements move independently.'}
					</p>
					{!photoLayout && (
						<Field label="Photo width">
							<div className="gap-row">
								<input
									type="range"
									min={60}
									max={720}
									step={5}
									value={photoWidth}
									onChange={(event) =>
										setProfileImagePresentation({ imageWidth: Number(event.target.value) })
									}
									aria-label="About photo width"
								/>
								<span className="gap-unit">{photoWidth}px</span>
							</div>
						</Field>
					)}
				</div>
			)}

			<Field label="Bio" hint="Select text to format, size, align, or link it just like a Text block.">
				<RichTextEditor
					value={content.profile.bioRichText}
					legacyText={content.profile.bio}
					fontFamily={bioFont || content.theme.fontFamily}
					label="About bio"
					onChange={(text, richText) => setBio(text, richText)}
				/>
			</Field>
			<Field label="About text font" hint="This changes only the About bio. Leave it linked to follow the site font.">
				<select
					className="select-input"
					value={bioFont}
					onChange={(event) => setProfileBioFont(event.target.value || undefined)}
				>
					<option value="">Site font — linked</option>
					{fontOptions.map((font) => (
						<option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
							{font.label}
						</option>
					))}
				</select>
			</Field>

			<Field
				label="Public contact email"
				hint="Shown publicly in this About section. Form delivery email is configured separately inside each Contact form block."
				error={emailError}
			>
				<TextInput
					type="email"
					value={content.contact.email}
					placeholder="you@example.com"
					onChange={(event) => setEmail(event.target.value)}
				/>
			</Field>

			<Field
				label="Résumé"
				hint="Optional PDF linked with your social links."
				error={resumeError ?? undefined}
			>
				<div className="resume-row">
					<input
						ref={resumeInputRef}
						type="file"
						accept="application/pdf,.pdf"
						hidden
						onChange={(event) => {
							handleResumeFile(event.target.files?.[0]);
							event.target.value = '';
						}}
					/>
					<button type="button" className="btn-secondary" onClick={() => resumeInputRef.current?.click()}>
						{resumeName ? 'Replace PDF…' : 'Upload PDF…'}
					</button>
					{resumeName &&
						(resumeUrl ? (
							<a className="resume-name" href={resumeUrl} target="_blank" rel="noopener">
								{resumeName}
							</a>
						) : (
							<span className="resume-name">{resumeName}</span>
						))}
					{resumeName && (
						<button type="button" className="btn-ghost" onClick={removeResume}>
							Remove
						</button>
					)}
				</div>
			</Field>

			<div className="about-social-fields">
				<SocialLinksFields />
			</div>
			{cropOpen && profileUrl && (
				<ImageCropDialog
					src={profileUrl}
					name="About photo"
					initial={{
						aspect: photoAspect || undefined,
						focusX: content.profile.imageFocusX ?? 50,
						focusY: content.profile.imageFocusY ?? 50,
						zoom: content.profile.imageCropZoom ?? 1,
					}}
					onClose={() => setCropOpen(false)}
					onSave={(settings: ImageCropSettings) => {
						const ratio = parsedPhotoAspect(settings.aspect) ?? settings.naturalAspect;
						setProfileImagePresentation({
							imageAspect: settings.aspect,
							imageFocusX: settings.focusX,
							imageFocusY: settings.focusY,
							imageCropZoom: settings.zoom > 1.001 ? settings.zoom : undefined,
							imageLayout:
								photoLayout && ratio ? { ...photoLayout, ar: ratio } : photoLayout,
						});
						setCropOpen(false);
					}}
				/>
			)}
		</div>
	);
}
