// Spec 36, audit row E4 (spec 35's table, SOURCES.md §spec 35). The contact
// form used to speak words no artist owned: the submit button, the "Required"
// marker beside each required question, and the sentence shown when the form has
// nowhere to send were literals inside ContactForm.tsx. They are block fields
// now. These checks lock both halves of the deal:
//   * absent field  → the words the renderer always supplied (an existing draft
//     publishes exactly what it published before — no schema-version bump),
//   * empty string  → a deletion: the element collapses instead of falling back
//     to the template's words.
// The end-to-end proof that an artist can reach zero is the empty harness
// (tests/starter-empty.test.ts); this file pins the renderer's own rules.
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ContactForm, { type ContactFormProps } from '../src/portfolio/ContactForm';
import { encodeContactEmail } from '../src/portfolio/contactEmail';

const FIELDS = [{ name: 'message', type: 'textarea' as const, label: 'Message', required: true }];

function render(props: Partial<ContactFormProps> = {}): string {
	return renderToStaticMarkup(
		createElement(ContactForm, {
			heading: 'Get in touch',
			action: '',
			fallbackEmail: encodeContactEmail('artist@example.com'),
			fields: FIELDS,
			...props,
		}),
	);
}

describe('contact form words an artist owns (spec 36 / E4)', () => {
	it('keeps the old wording when a draft carries none of the new fields', () => {
		expect(render()).toContain('Continue in email');
		expect(render({ action: 'https://formspree.io/f/abc' })).toContain('Send message');
		expect(render()).toContain('Required');
		// No delivery route at all is the unavailable state.
		expect(render({ fallbackEmail: undefined })).toContain(
			'This contact form isn’t ready yet.',
		);
	});

	it('says the artist’s words instead when they are set', () => {
		const markup = render({
			emailSubmitLabel: 'Write to me',
			requiredLabel: 'Needed',
			fields: FIELDS,
		});
		expect(markup).toContain('Write to me');
		expect(markup).not.toContain('Continue in email');
		expect(markup).toContain('Needed');
		expect(markup).not.toContain('>Required<');
		expect(render({ fallbackEmail: undefined, unavailableMessage: 'Email me instead.' })).toContain(
			'Email me instead.',
		);
	});

	it('collapses each element when its words are deleted', () => {
		const noButton = render({ emailSubmitLabel: '' });
		expect(noButton).not.toContain('contact-form-send');
		expect(noButton).not.toContain('Continue in email');
		// The direct-send label is a separate deletion: emptying one setup's words
		// must not silently borrow the other's.
		expect(render({ action: 'https://formspree.io/f/abc', submitLabel: '' })).not.toContain(
			'contact-form-send',
		);

		const noMarker = render({ requiredLabel: '' });
		expect(noMarker).not.toContain('contact-form-required');
		expect(noMarker).not.toContain('Required');
		// The question itself is untouched — only its marker went away.
		expect(noMarker).toContain('Message');

		const silent = render({ fallbackEmail: undefined, unavailableMessage: '' });
		expect(silent).not.toContain('contact-form-feedback');
		expect(silent).not.toContain('ready yet');
	});
});
