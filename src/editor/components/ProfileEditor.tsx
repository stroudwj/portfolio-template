import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, TextInput, TextArea, Section } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetUrl } from '../lib/assets';
import { isEmail, isPdfFile, MAX_PDF_BYTES, MAX_PDF_MB } from '../lib/validation';

export default function ProfileEditor() {
	const { doc, setName, setBio, setEmail, setProfileImage, removeProfileImage, setResumeFile, removeResume } =
		useEditor();
	const resumeInputRef = useRef<HTMLInputElement>(null);
	const [resumeError, setResumeError] = useState<string | null>(null);
	if (!doc) return null;
	const c = doc.content;
	const profileUrl = getAssetUrl(doc.profileImage.assetId);
	const emailError = c.contact.email && !isEmail(c.contact.email) ? 'Enter a valid email address.' : undefined;
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
		<Section title="Profile">
			<Field label="Name">
				<TextInput value={c.site.name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
			</Field>
			<Field label="Bio" hint="One blank line makes a paragraph break.">
				<TextArea rows={6} value={c.profile.bio} placeholder="Write a short bio…" onChange={(e) => setBio(e.target.value)} />
			</Field>
			<Field label="Email" error={emailError}>
				<TextInput
					type="email"
					value={c.contact.email}
					placeholder="you@example.com"
					onChange={(e) => setEmail(e.target.value)}
				/>
			</Field>
			<Field label="Profile image">
				<div className="image-picker">
					{profileUrl && <img className="thumb" src={profileUrl} alt="" />}
					<ImageDrop onFiles={(files) => setProfileImage(files[0])}>
						<span>{profileUrl ? 'Replace image' : 'Click or drop an image'}</span>
					</ImageDrop>
					{profileUrl && (
						<button type="button" className="btn-ghost" onClick={removeProfileImage}>
							Remove
						</button>
					)}
				</div>
			</Field>
			<Field
				label="Résumé (PDF)"
				hint="Linked from your About section. Remove it and no link is shown."
				error={resumeError ?? undefined}
			>
				<div className="resume-row">
					<input
						ref={resumeInputRef}
						type="file"
						accept="application/pdf,.pdf"
						hidden
						onChange={(e) => {
							handleResumeFile(e.target.files?.[0]);
							e.target.value = '';
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
		</Section>
	);
}
