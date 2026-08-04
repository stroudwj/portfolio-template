/**
 * Address handling for the contact block.
 *
 * Every published page inlines its entire Content as `window.__HW__` (see
 * staticgen/html.ts), so an address kept in plain text would ship to the served page
 * whether or not the renderer printed it. Contact blocks therefore never store the
 * address: they store the local part and the domain separately, each as hex code
 * points, and the `mailto:` href is assembled in the browser only when the visitor
 * presses the button. Nothing in the served HTML joins the two halves with an `@`.
 *
 * This is obfuscation, not secrecy — a person reading the page can still work the
 * address out, which is the point. It defeats bulk address harvesting, which is the
 * thing artists actually ask for.
 */

/** An address split in two and encoded. Neither half contains the `@`. */
export interface ContactEmailParts {
	/** Local part ("jane") as hex code points joined by "-". */
	user: string;
	/** Domain ("example.com") as hex code points joined by "-". */
	domain: string;
}

export const EMPTY_CONTACT_EMAIL: ContactEmailParts = { user: '', domain: '' };

/** The button label used when the artist hasn't chosen their own words. */
export const DEFAULT_CONTACT_BUTTON_LABEL = 'Email me';

/** Matches validation.ts's isEmail so the editor and the renderer agree. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isContactEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value.trim());
}

/** Encode one half as "-"-joined hex code points. Unicode-safe (iterates code points). */
export function encodeEmailPart(value: string): string {
	return [...value].map((character) => character.codePointAt(0)!.toString(16)).join('-');
}

/** Reverse encodeEmailPart. Returns '' for anything that isn't well-formed. */
export function decodeEmailPart(value: string): string {
	if (!value) return '';
	let decoded = '';
	for (const chunk of value.split('-')) {
		if (!/^[0-9a-f]{1,6}$/i.test(chunk)) return '';
		const code = Number.parseInt(chunk, 16);
		// Lone surrogates and out-of-range values would throw; refuse the whole value.
		if (!Number.isInteger(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
		decoded += String.fromCodePoint(code);
	}
	return decoded;
}

/** Split a plain address into encoded halves. Returns empty parts when unusable. */
export function encodeContactEmail(plain: string): ContactEmailParts {
	const trimmed = plain.trim();
	if (!isContactEmail(trimmed)) return EMPTY_CONTACT_EMAIL;
	const at = trimmed.lastIndexOf('@');
	return {
		user: encodeEmailPart(trimmed.slice(0, at)),
		domain: encodeEmailPart(trimmed.slice(at + 1)),
	};
}

/**
 * Rebuild the plain address for the editor's own field. Returns '' when either half
 * is malformed or the pair doesn't recombine into a valid address — hand-edited
 * content.json reaches this code too.
 */
export function decodeContactEmail(parts: ContactEmailParts | undefined): string {
	const user = decodeEmailPart(parts?.user ?? '');
	const domain = decodeEmailPart(parts?.domain ?? '');
	if (!user || !domain) return '';
	const address = `${user}@${domain}`;
	return isContactEmail(address) ? address : '';
}

/**
 * The href for the button, assembled at click time. Each half is percent-encoded
 * before the `@` is added, so a hand-edited part cannot smuggle `?bcc=…` headers into
 * the visitor's mail client.
 */
export function contactMailtoHref(parts: ContactEmailParts | undefined): string | undefined {
	const address = decodeContactEmail(parts);
	if (!address) return undefined;
	const at = address.lastIndexOf('@');
	const user = encodeURIComponent(address.slice(0, at));
	const domain = encodeURIComponent(address.slice(at + 1));
	return `mailto:${user}@${domain}`;
}

/**
 * The address a visitor can read and retype when scripting is off: the served HTML's
 * only rendering of it, and deliberately not a working address.
 */
export function contactEmailFallback(parts: ContactEmailParts | undefined): string {
	const address = decodeContactEmail(parts);
	if (!address) return '';
	const at = address.lastIndexOf('@');
	const user = address.slice(0, at);
	const domain = address.slice(at + 1).split('.').join(' [dot] ');
	return `${user} [at] ${domain}`;
}
