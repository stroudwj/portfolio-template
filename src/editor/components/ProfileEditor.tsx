import { useEditor } from '../store';
import { Field, TextInput, TextArea, Section } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetUrl } from '../lib/assets';
import { isEmail } from '../lib/validation';

export default function ProfileEditor() {
	const { doc, setName, setBio, setEmail, setProfileImage, removeProfileImage } = useEditor();
	if (!doc) return null;
	const c = doc.content;
	const profileUrl = getAssetUrl(doc.profileImage.assetId);
	const emailError = c.contact.email && !isEmail(c.contact.email) ? 'Enter a valid email address.' : undefined;

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
		</Section>
	);
}
