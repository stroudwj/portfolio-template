import { useId, useState, type SubmitEvent } from 'react';
import './ContactForm.css';
import {
	DEFAULT_FORM_EMAIL_SUBMIT_LABEL,
	DEFAULT_FORM_REQUIRED_LABEL,
	DEFAULT_FORM_SUBMIT_LABEL,
	DEFAULT_FORM_UNAVAILABLE_MESSAGE,
	contactMailtoHref,
	type ContactEmailParts,
} from './contactEmail';

export type ContactFormFieldType = 'name' | 'email' | 'text' | 'textarea';

export interface ContactFormField {
	/** The field name sent to the artist's form service. */
	name: string;
	type: ContactFormFieldType;
	label: string;
	required?: boolean;
}

export interface ContactFormProps {
	heading?: string;
	/** The artist-owned HTTPS address that receives the message. */
	action: string;
	successMessage?: string;
	/** Submit words when the message posts to a form service. `''` = no button. */
	submitLabel?: string;
	/** Submit words in the email fallback. `''` = no button. */
	emailSubmitLabel?: string;
	/** Marker beside a required question's label. `''` = no marker. */
	requiredLabel?: string;
	/** Sentence shown when the form has nowhere to send. `''` = say nothing. */
	unavailableMessage?: string;
	fields: readonly ContactFormField[];
	/** No-setup fallback: opens the visitor's email app when no form service is
	 * connected. Split + encoded like the contact block's address — never a
	 * readable address. See ./contactEmail.ts. */
	fallbackEmail?: ContactEmailParts;
}

type SubmitState = 'idle' | 'sending' | 'success' | 'email' | 'failure' | 'unavailable';

const HONEYPOT_NAME = '__hangwork_company_website';

function isHttpsEndpoint(value: string): boolean {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}

function fieldInput(field: ContactFormField, id: string, disabled: boolean) {
	const common = {
		id,
		name: field.name,
		required: field.required,
		disabled,
	};

	if (field.type === 'textarea') {
		return <textarea {...common} rows={6} />;
	}

	return (
		<input
			{...common}
			type={field.type === 'email' ? 'email' : 'text'}
			autoComplete={field.type === 'name' ? 'name' : field.type === 'email' ? 'email' : undefined}
		/>
	);
}

/**
 * A static-site-friendly contact form. Messages go straight to the artist's
 * chosen form service; Hangwork never receives or stores them.
 */
export default function ContactForm({
	heading = 'Get in touch',
	action,
	successMessage = 'Your message was sent.',
	// Spec 36 (E4): these were literals in this file, so a starter's form shipped
	// words no artist could rename or remove. They are block fields now; the
	// defaults here only cover a caller that passes nothing, and an empty string
	// is a deliberate deletion — the button, marker or sentence is not rendered.
	submitLabel = DEFAULT_FORM_SUBMIT_LABEL,
	emailSubmitLabel = DEFAULT_FORM_EMAIL_SUBMIT_LABEL,
	requiredLabel = DEFAULT_FORM_REQUIRED_LABEL,
	unavailableMessage = DEFAULT_FORM_UNAVAILABLE_MESSAGE,
	fields,
	fallbackEmail,
}: ContactFormProps) {
	const formId = useId();
	const [submitState, setSubmitState] = useState<SubmitState>('idle');
	const endpointIsSafe = isHttpsEndpoint(action);
	// Assembled from the encoded halves only here, at render/click time — never
	// stored or printed as a joined address. undefined when there's nothing usable.
	const fallbackMailto = contactMailtoHref(fallbackEmail);
	const emailFallbackIsReady = !!fallbackMailto;
	const isAvailable = endpointIsSafe || emailFallbackIsReady;
	const trimmedHeading = heading.trim();
	const feedbackId = `${formId}-feedback`;
	const recordInquiry = () => window.dispatchEvent(new Event('hangwork:inquiry'));

	const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (submitState === 'sending') return;

		if (!isAvailable) {
			setSubmitState('unavailable');
			return;
		}

		const form = event.currentTarget;
		const data = new FormData(form);
		if (String(data.get(HONEYPOT_NAME) ?? '').trim()) {
			form.reset();
			setSubmitState('success');
			return;
		}
		if (!endpointIsSafe && fallbackMailto) {
			const body = fields
				.map((field) => `${field.label}:\n${String(data.get(field.name) ?? '').trim()}`)
				.join('\n\n');
			const subject = trimmedHeading || 'Portfolio message';
			window.location.href = `${fallbackMailto}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
			recordInquiry();
			setSubmitState('email');
			return;
		}

		setSubmitState('sending');
		try {
			const response = await fetch(action, {
				method: 'POST',
				body: data,
				headers: { Accept: 'application/json' },
			});
			if (!response.ok) throw new Error('Message delivery failed');

			form.reset();
			recordInquiry();
			setSubmitState('success');
		} catch {
			setSubmitState('failure');
		}
	};

	const effectiveState: SubmitState = !isAvailable ? 'unavailable' : submitState;
	// Two setups, two sets of words: posting to a form service really does send the
	// message, while the fallback hands it to the visitor's email app. Whichever
	// applies, an artist who empties it gets no button rather than the words back.
	const sendLabel = (endpointIsSafe ? submitLabel : emailSubmitLabel).trim();
	const feedback =
		effectiveState === 'sending'
			? 'Sending your message.'
				: effectiveState === 'success'
					? successMessage.trim() || 'Your message was sent.'
					: effectiveState === 'email'
						? 'Your email app should open with this message ready. Review it there, then press Send.'
					: effectiveState === 'failure'
					? 'Your message wasn\u2019t sent. Everything you wrote is still here, so you can try again.'
					: effectiveState === 'unavailable'
						? unavailableMessage.trim()
						: '';

	return (
		<section className="contact-form-block" aria-labelledby={trimmedHeading ? `${formId}-heading` : undefined}>
			{trimmedHeading && (
				<h2 id={`${formId}-heading`} className="contact-form-heading">
					{trimmedHeading}
				</h2>
			)}
			<form
				className="contact-form"
				action={endpointIsSafe ? action : undefined}
				method="post"
				onSubmit={handleSubmit}
				aria-labelledby={trimmedHeading ? `${formId}-heading` : undefined}
				aria-label={trimmedHeading ? undefined : 'Contact form'}
				aria-busy={effectiveState === 'sending'}
				aria-describedby={feedback ? feedbackId : undefined}
			>
				{fields.map((field, index) => {
					const id = `${formId}-field-${index}`;
					return (
						<div className="contact-form-field" key={`${field.name}-${index}`}>
							<label htmlFor={id}>
								{field.label}
								{field.required && requiredLabel.trim() && (
									<span className="contact-form-required">{requiredLabel.trim()}</span>
								)}
							</label>
					{fieldInput(field, id, !isAvailable)}
						</div>
					);
				})}

				<div className="contact-form-honeypot" aria-hidden="true">
					<label htmlFor={`${formId}-website`}>Leave this field empty</label>
					<input
						id={`${formId}-website`}
						name={HONEYPOT_NAME}
						type="text"
						tabIndex={-1}
						autoComplete="off"
					disabled={!isAvailable}
					/>
				</div>

				{sendLabel && (
					<button
						className="contact-form-send"
						type="submit"
						disabled={!isAvailable || effectiveState === 'sending'}
					>
						{effectiveState === 'sending' ? 'Sending\u2026' : sendLabel}
					</button>
				)}

				{feedback && (
					<p
						id={feedbackId}
						className={`contact-form-feedback${
							effectiveState === 'failure' || effectiveState === 'unavailable'
								? ' contact-form-feedback-error'
								: ''
						}`}
						role={effectiveState === 'failure' || effectiveState === 'unavailable' ? 'alert' : 'status'}
					>
						{feedback}
					</p>
				)}
			</form>
		</section>
	);
}
