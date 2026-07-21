// "Send me the link" — the cross-device handoff. Building happens on a desktop, so the
// editor (mainly its phone door screen) emails people their own editor link via the
// Worker's /handoff route. Buyers are identified by their stored license key and the
// Worker mails the address on the purchase (with an auto-unlock ?license_key= link);
// everyone else supplies an address. When the Worker or its email service isn't
// configured, callers fall back to showing the same link for the person to copy.
//
// TODO(mobile-light-edit): when phones later gain "add a piece to an existing published
// gallery", this module is the seam — the emailed link should then deep-link back into
// that flow rather than the editor root. First-build stays desktop-only.
import { WORKER_TOKEN_URL } from '../oauth/config';
import { getLicense } from './session';

export const HANDOFF_URL = WORKER_TOKEN_URL ? `${WORKER_TOKEN_URL}/handoff` : '';

/** A handoff failure the UI can show in Hangwork's voice (no "error", no "sorry"). */
export class HandoffError extends Error {
	constructor(public friendly: string) {
		super(friendly);
		this.name = 'HandoffError';
	}
}

const QUIET = 'Email is being quiet right now. Copy the link instead — it opens the same canvas.';

/**
 * The exact link the email carries, for the copy-the-link fallback: this editor page,
 * plus the auto-unlock key when this device has one. Safe to show — it's the person's
 * own key, the same one Lemon Squeezy already emailed them.
 */
export function desktopLinkUrl(): string {
	if (typeof window === 'undefined') return '';
	const url = new URL(window.location.origin + window.location.pathname);
	const stored = getLicense();
	if (stored) url.searchParams.set('license_key', stored.key);
	return url.toString();
}

/**
 * Email the desktop link. With a stored license the Worker picks the recipient from the
 * purchase itself (no address needed); otherwise `email` is required. Resolves with the
 * address the mail went to. Throws HandoffError when sending isn't possible — callers
 * offer the copy-the-link fallback then.
 */
export async function sendDesktopLink(email?: string): Promise<{ email: string }> {
	if (!HANDOFF_URL) throw new HandoffError(QUIET);
	const stored = getLicense();
	const body = stored ? { license_key: stored.key } : { email: email?.trim() };
	if (!stored && !body.email) throw new HandoffError('Add your email and I’ll send the link there.');

	let res: Response;
	try {
		res = await fetch(HANDOFF_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	} catch {
		throw new HandoffError(QUIET);
	}
	const data = (await res.json().catch(() => ({}))) as { sent?: boolean; email?: string; error?: string };
	if (!res.ok || !data.sent) {
		if (data.error === 'rate_limited') {
			throw new HandoffError('That link was sent just a moment ago — give your inbox a minute.');
		}
		throw new HandoffError(QUIET);
	}
	return { email: data.email || email?.trim() || '' };
}

// --- Post-purchase email ("You own Hangwork now") ---------------------------------
//
// Fired once per purchase, right after a checkout return auto-activates the key (both
// platforms — it matters most for phone buyers, who leave with nothing visible built).
// localStorage remembers per key tail so revisiting the unlock link doesn't re-send;
// sessionStorage carries the recipient so the door screen can open on "On its way."

const SENT_FLAG_PREFIX = 'portfolio-editor:welcome-sent:';
const JUST_SENT_KEY = 'portfolio-editor:link-just-sent';

/** Fired (with the recipient as detail) when the post-purchase email goes out, so an
 *  already-mounted door screen can flip to its "On its way." state. */
export const HANDOFF_SENT_EVENT = 'hangwork:handoff-sent';

export function maybeSendPostPurchaseEmail(licenseKey: string): void {
	const flag = SENT_FLAG_PREFIX + licenseKey.slice(-8);
	try {
		if (localStorage.getItem(flag)) return;
	} catch {
		/* storage blocked — worst case is one extra email */
	}
	sendDesktopLink()
		.then(({ email }) => {
			try {
				localStorage.setItem(flag, '1');
				sessionStorage.setItem(JUST_SENT_KEY, email);
			} catch {
				/* ignore */
			}
			window.dispatchEvent(new CustomEvent(HANDOFF_SENT_EVENT, { detail: email }));
		})
		.catch(() => {
			// Quietly drop it: Lemon Squeezy's own receipt (with the key) already went out,
			// and the door screen still offers "Send me the link" by hand.
		});
}

/** The address the post-purchase email just went to this page load, if any. */
export function justSentTo(): string | null {
	try {
		return sessionStorage.getItem(JUST_SENT_KEY);
	} catch {
		return null;
	}
}
