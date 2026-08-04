import './ContactBlock.css';
import {
	DEFAULT_CONTACT_BUTTON_LABEL,
	contactEmailFallback,
	contactMailtoHref,
	type ContactEmailParts,
} from './contactEmail';

export interface ContactBlockProps {
	heading?: string;
	text?: string;
	/** The address, split and encoded — see contactEmail.ts. */
	email?: ContactEmailParts;
	buttonLabel?: string;
	/** The editor preview keeps the block visible while the address is still blank. */
	editorPreview?: boolean;
}

/**
 * "Email me about commissions" — a heading, a line of text, and a button that opens
 * the visitor's mail app. The address is assembled from its encoded halves at click
 * time and never rendered as a working address; visitors without scripting read the
 * spelled-out form underneath.
 */
export default function ContactBlock({
	heading,
	text,
	email,
	buttonLabel,
	editorPreview,
}: ContactBlockProps) {
	const href = contactMailtoHref(email);
	const fallback = contactEmailFallback(email);
	const trimmedHeading = heading?.trim() ?? '';
	const trimmedText = text?.trim() ?? '';
	const label = buttonLabel?.trim() || DEFAULT_CONTACT_BUTTON_LABEL;

	// Nothing to contact yet. The published site simply omits the block; the editor
	// keeps a placeholder so the artist can see what they're filling in.
	if (!href && !editorPreview) return null;

	const openMail = () => {
		if (href) window.location.href = href;
	};

	return (
		<section className="contact-block">
			{trimmedHeading && <h2 className="contact-block-heading">{trimmedHeading}</h2>}
			{trimmedText && <p className="contact-block-text">{trimmedText}</p>}
			<button
				type="button"
				className="contact-block-button"
				onClick={openMail}
				disabled={!href}
			>
				{label}
			</button>
			{fallback ? (
				<p className="contact-block-address">{fallback}</p>
			) : (
				editorPreview && <p className="contact-block-address">Add an email address</p>
			)}
		</section>
	);
}
