import { Fragment } from 'react';
import SocialLinks from './SocialLinks';
import type { SocialLink } from './types';
import './About.css';

export interface AboutProps {
	name: string;
	/** Bio body: "\n" is a line break, "\n\n" a blank line. */
	bio: string;
	email: string;
	social: SocialLink[];
	profileImageSrc?: string;
	resume?: { label: string; href: string } | null;
	/** Editor-only empty-state guidance; never rendered on the published site. */
	editorPreview?: boolean;
}

/**
 * The About column. The bio text reproduces the exact Phase 1 break pattern:
 * name + 3 line breaks + the bio body + 2 line breaks + email.
 */
export default function About({ name, bio, email, social, profileImageSrc, resume, editorPreview = false }: AboutProps) {
	const shownBio = bio || (editorPreview ? 'Add your bio' : '');
	const bioLines = shownBio.split('\n');
	const bioNodes = bioLines.flatMap((line, i) =>
		i === 0
			? [<Fragment key={`l${i}`}>{line}</Fragment>]
			: [<br key={`b${i}`} />, <Fragment key={`l${i}`}>{line}</Fragment>],
	);

	return (
		<div className="bio-container">
			{profileImageSrc ? (
				<img className="profile-image" src={profileImageSrc} alt={name} />
			) : editorPreview ? (
				<div className="profile-image-placeholder">Add an About photo</div>
			) : null}
			<p className="bio-text">
				<span className={!name && editorPreview ? 'about-preview-placeholder' : undefined}>
					{name || (editorPreview ? 'Add your name' : '')}
				</span>
				<br />
				<br />
				<br />
				<span className={!bio && editorPreview ? 'about-preview-placeholder' : undefined}>{bioNodes}</span>
				<br />
				<br />
				<span className={!email && editorPreview ? 'about-preview-placeholder' : undefined}>
					{email || (editorPreview ? 'Add a public contact email' : '')}
				</span>
			</p>
			<SocialLinks social={social} resume={resume} />
			{editorPreview && social.length === 0 && !resume && (
				<span className="about-preview-placeholder about-preview-links">Add social links or a résumé</span>
			)}
		</div>
	);
}
