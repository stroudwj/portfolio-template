import { Fragment, type CSSProperties } from 'react';
import type { RichTextParagraph } from '../lib/content';
import SocialLinks from './SocialLinks';
import type { SocialLink } from './types';
import { TextContent } from './TextBlock';
import './About.css';

export interface AboutProps {
	name: string;
	/** Bio body: "\n" is a line break, "\n\n" a blank line. */
	bio: string;
	bioRichText?: RichTextParagraph[];
	bioFontFamily?: string;
	email: string;
	social: SocialLink[];
	profileImageSrc?: string;
	imageWidth?: number;
	imageAspect?: string;
	imageFocusX?: number;
	imageFocusY?: number;
	imageCropZoom?: number;
	/** The photo is rendered separately on a freeform canvas. */
	profileImageFreeform?: boolean;
	resume?: { label: string; href: string } | null;
	/** Editor-only empty-state guidance; never rendered on the published site. */
	editorPreview?: boolean;
}

/**
 * The About column. The bio text reproduces the exact Phase 1 break pattern:
 * name + 3 line breaks + the bio body + 2 line breaks + email.
 */
export default function About({ name, bio, bioRichText, bioFontFamily, email, social, profileImageSrc, imageWidth, imageAspect, imageFocusX, imageFocusY, imageCropZoom, profileImageFreeform = false, resume, editorPreview = false }: AboutProps) {
	const shownBio = bio || (editorPreview ? 'Add your bio' : '');
	const bioLines = shownBio.split('\n');
	const bioNodes = bioLines.flatMap((line, i) =>
		i === 0
			? [<Fragment key={`l${i}`}>{line}</Fragment>]
			: [<br key={`b${i}`} />, <Fragment key={`l${i}`}>{line}</Fragment>],
	);
	const ratioMatch = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(imageAspect ?? '');
	const ratio = ratioMatch ? Number(ratioMatch[1]) / Number(ratioMatch[2]) : undefined;
	const imageFrameStyle = {
		'--about-image-width': `${Math.min(Math.max(imageWidth ?? 160, 60), 720)}px`,
		...(ratio ? { aspectRatio: String(ratio) } : {}),
	} as CSSProperties;
	const imageStyle = {
		objectPosition: `${imageFocusX ?? 50}% ${imageFocusY ?? 50}%`,
		transform: imageCropZoom && imageCropZoom > 1 ? `scale(${imageCropZoom})` : undefined,
		transformOrigin: `${imageFocusX ?? 50}% ${imageFocusY ?? 50}%`,
	} as CSSProperties;

	return (
		<div className="bio-container">
			{profileImageSrc ? (
				<span className={`profile-image-frame${ratio ? ' is-cropped' : ''}`} style={imageFrameStyle}>
					<img className="profile-image" style={imageStyle} src={profileImageSrc} alt={name} />
				</span>
			) : editorPreview && !profileImageFreeform ? (
				<div className="profile-image-placeholder">Add an About photo</div>
			) : null}
			<div className="bio-text" style={bioFontFamily ? { fontFamily: bioFontFamily } : undefined}>
				<span className={!name && editorPreview ? 'about-preview-placeholder' : undefined}>
					{name || (editorPreview ? 'Add your name' : '')}
				</span>
				<div className={`about-bio-copy${!bio && editorPreview ? ' about-preview-placeholder' : ''}`}>
					{bioRichText && bio ? (
						<TextContent text={bio} richText={bioRichText} fontFamily={bioFontFamily} />
					) : bioNodes}
				</div>
				<span className={!email && editorPreview ? 'about-preview-placeholder' : undefined}>
					{email || (editorPreview ? 'Add a public contact email' : '')}
				</span>
			</div>
			<SocialLinks social={social} resume={resume} />
			{editorPreview && social.length === 0 && !resume && (
				<span className="about-preview-placeholder about-preview-links">Add social links or a résumé</span>
			)}
		</div>
	);
}
