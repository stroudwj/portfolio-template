import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, TextInput, TextArea, Section } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetUrl, getAssetPreviewUrl } from '../lib/assets';
import { isEmail, isPdfFile, MAX_PDF_BYTES, MAX_PDF_MB } from '../lib/validation';

export default function ProfileEditor() {
	const {
		doc,
		setName,
		setLogoText,
		setBio,
		setEmail,
		setProfileImage,
		removeProfileImage,
		setLogoImage,
		removeLogoImage,
		setResumeFile,
		removeResume,
		setTheme,
	} = useEditor();
	const resumeInputRef = useRef<HTMLInputElement>(null);
	const [resumeError, setResumeError] = useState<string | null>(null);
	if (!doc) return null;
	const c = doc.content;
	const profileUrl = getAssetPreviewUrl(doc.profileImage.assetId);
	const logoUrl = getAssetPreviewUrl(doc.logoImage?.assetId);
	const emailError = c.contact.email && !isEmail(c.contact.email) ? 'Enter a valid email address.' : undefined;
	const resumeName = doc.resumeFile?.filename ?? '';
	const resumeUrl = getAssetUrl(doc.resumeFile?.assetId);
	const logoScale = c.theme.logoScale ?? 100;
	const logoPosition = c.theme.logoPosition ?? 'center';
	const logoX = c.theme.logoX ?? 50;
	const logoY = c.theme.logoY ?? 40;

	const applyLogoScale = (value: number) => {
		const clamped = Math.max(50, Math.min(Math.round(value), 200));
		setTheme({ logoScale: clamped === 100 ? undefined : clamped });
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
		<Section title="Profile" sectionKey="_profile">
			<Field label="Name">
				<TextInput value={c.site.name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
			</Field>
			<Field label="Header text" hint="Optional. Leave blank to use your name; this can be any text you like.">
				<TextInput
					value={c.site.logo ?? ''}
					placeholder={c.site.name || 'Your name'}
					onChange={(e) => setLogoText(e.target.value)}
				/>
			</Field>
			<Field label="Header logo (optional)" hint="Shown at the top of every page instead of your name.">
				<div className="image-picker">
					{logoUrl && <img className="thumb logo-thumb" src={logoUrl} alt="" />}
					<ImageDrop onFiles={(files) => setLogoImage(files[0])}>
						<span>{logoUrl ? 'Replace logo' : 'Click or drop a logo image'}</span>
					</ImageDrop>
					{(logoUrl || doc.logoImage?.filename) && (
						<button type="button" className="btn-ghost" onClick={removeLogoImage}>
							Remove
						</button>
					)}
				</div>
			</Field>
			<Field label="Logo size" hint="Scales the header logo — your name or the uploaded image.">
				<div className="gap-row">
					<input
						type="range"
						min={50}
						max={200}
						step={5}
						value={logoScale}
						onChange={(e) => applyLogoScale(Number(e.target.value))}
						aria-label="Logo size"
					/>
					<span className="gap-unit">{logoScale}%</span>
					{logoScale !== 100 && (
						<button type="button" className="btn-icon btn-chip" onClick={() => applyLogoScale(100)} title="Back to the default size">
							Reset
						</button>
					)}
				</div>
			</Field>
			<Field label="Header position" hint="Place your name or logo at the left, centered, or at your own coordinates on every page.">
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
							onClick={() => setTheme({ logoPosition: value === 'center' ? undefined : value })}
						>
							{label}
						</button>
					))}
				</div>
			</Field>
			{logoPosition === 'freeform' && (
				<>
					<Field label="Header horizontal position">
						<div className="gap-row">
							<input
								type="range"
								min={0}
								max={100}
								step={1}
								value={logoX}
								onChange={(e) => setTheme({ logoX: Number(e.target.value) })}
								aria-label="Header horizontal position"
							/>
							<span className="gap-unit">{logoX}%</span>
						</div>
					</Field>
					<Field label="Header distance from top">
						<div className="gap-row">
							<input
								type="range"
								min={0}
								max={400}
								step={1}
								value={logoY}
								onChange={(e) => setTheme({ logoY: Number(e.target.value) })}
								aria-label="Header distance from top"
							/>
							<span className="gap-unit">{logoY}px</span>
						</div>
					</Field>
				</>
			)}
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
