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
	profileImageSrcSet?: string;
	resume?: { label: string; href: string } | null;
}

/**
 * The About column. The bio text reproduces the exact Phase 1 break pattern:
 * name + 3 line breaks + the bio body + 2 line breaks + email.
 */
export default function About({ name, bio, email, social, profileImageSrc, profileImageSrcSet, resume }: AboutProps) {
	const bioLines = bio.split('\n');
	const bioNodes = bioLines.flatMap((line, i) =>
		i === 0
			? [<Fragment key={`l${i}`}>{line}</Fragment>]
			: [<br key={`b${i}`} />, <Fragment key={`l${i}`}>{line}</Fragment>],
	);

	return (
		<div className="bio-container">
			{profileImageSrc && (
				<img className="profile-image" src={profileImageSrc} srcSet={profileImageSrcSet} alt={name} />
			)}
			<p className="bio-text">
				{name}
				<br />
				<br />
				<br />
				{bioNodes}
				<br />
				<br />
				{email}
			</p>
			<SocialLinks social={social} resume={resume} />
		</div>
	);
}
