import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, TextArea, TextInput } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl, getAssetUrl } from '../lib/assets';
import { sampleArtworkUrl } from '../lib/sample-artwork';
import { isEmail, isPdfFile, MAX_PDF_BYTES, MAX_PDF_MB } from '../lib/validation';
import { SocialLinksFields } from './SocialLinksEditor';

/** The content rendered by an About block. It lives in the page workspace so
 * artists can edit the words and immediately see that page update beside it. */
export default function AboutContentEditor() {
	const {
		doc,
		setName,
		setBio,
		setEmail,
		setProfileImage,
		removeProfileImage,
		setResumeFile,
		removeResume,
	} = useEditor();
	const resumeInputRef = useRef<HTMLInputElement>(null);
	const [resumeError, setResumeError] = useState<string | null>(null);
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
			<Field label="Name shown here" hint="This is also your site name and is reused in browser titles.">
				<TextInput
					value={content.site.name}
					placeholder="Your name"
					onChange={(event) => setName(event.target.value)}
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

			<Field label="Bio" hint="One blank line makes a paragraph break.">
				<TextArea
					rows={7}
					value={content.profile.bio}
					placeholder="Write about your work, practice, and background…"
					onChange={(event) => setBio(event.target.value)}
				/>
			</Field>

			<Field
				label="Public contact email"
				hint="Shown on this About section and used by contact forms without a form service."
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
		</div>
	);
}
