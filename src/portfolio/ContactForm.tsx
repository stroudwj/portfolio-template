import { useId, useState, type SubmitEvent } from 'react';
import './ContactForm.css';

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
	fields: readonly ContactFormField[];
	/** No-setup fallback: opens the visitor's email app when no form service is connected. */
	fallbackEmail?: string;
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

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
	fields,
	fallbackEmail = '',
}: ContactFormProps) {
	const formId = useId();
	const [submitState, setSubmitState] = useState<SubmitState>('idle');
	const endpointIsSafe = isHttpsEndpoint(action);
	const emailFallbackIsReady = isEmail(fallbackEmail);
	const isAvailable = endpointIsSafe || emailFallbackIsReady;
	const trimmedHeading = heading.trim();
	const feedbackId = `${formId}-feedback`;

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
		if (!endpointIsSafe && emailFallbackIsReady) {
			const body = fields
				.map((field) => `${field.label}:\n${String(data.get(field.name) ?? '').trim()}`)
				.join('\n\n');
			const subject = trimmedHeading || 'Portfolio message';
			const recipient = encodeURIComponent(fallbackEmail.trim()).replace(/%40/gi, '@');
			window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
			setSubmitState('success');
		} catch {
			setSubmitState('failure');
		}
	};

	const effectiveState: SubmitState = !isAvailable ? 'unavailable' : submitState;
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
						? 'This contact form isn\u2019t ready yet. Please use another way to get in touch.'
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
								{field.required && <span className="contact-form-required">Required</span>}
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

				<button
					className="contact-form-send"
					type="submit"
					disabled={!isAvailable || effectiveState === 'sending'}
				>
					{effectiveState === 'sending' ? 'Sending\u2026' : endpointIsSafe ? 'Send message' : 'Continue in email'}
				</button>

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
