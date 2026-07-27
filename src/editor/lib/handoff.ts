// Cross-device handoff for the phone door and the post-purchase confirmation.
// A signed-in buyer is addressed from their Hangwork session; everyone else supplies
// an email. No purchase key is placed in the URL or sent through the browser.
import { WORKER_TOKEN_URL } from './oauth/config';
import { getSession } from './account/session';

export const HANDOFF_URL = WORKER_TOKEN_URL ? `${WORKER_TOKEN_URL}/handoff` : '';

export class HandoffError extends Error {
	constructor(public friendly: string) {
		super(friendly);
		this.name = 'HandoffError';
	}
}

const QUIET = 'Email is being quiet right now. Copy the link instead — it opens the same canvas.';
const SENT_FLAG_PREFIX = 'portfolio-editor:welcome-sent:';
const JUST_SENT_KEY = 'portfolio-editor:link-just-sent';

export const HANDOFF_SENT_EVENT = 'hangwork:handoff-sent';

export function desktopLinkUrl(): string {
	if (typeof window === 'undefined') return '';
	return new URL(window.location.origin + window.location.pathname).toString();
}

export async function sendDesktopLink(email?: string): Promise<{ email: string }> {
	if (!HANDOFF_URL) throw new HandoffError(QUIET);
	const session = getSession();
	const normalizedEmail = email?.trim() || '';
	if (!session && !normalizedEmail) throw new HandoffError('Add your email and I’ll send the link there.');

	let res: Response;
	try {
		res = await fetch(HANDOFF_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(session ? { Authorization: `Bearer ${session.token}` } : {}),
			},
			body: JSON.stringify(session ? {} : { email: normalizedEmail }),
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
	return { email: data.email || normalizedEmail };
}

/**
 * Send the signed-in buyer one reassurance email after a confirmed Polar return.
 * The checkout id is used only as a local idempotency key and is never transmitted.
 */
export function maybeSendPostPurchaseEmail(checkoutId: string): void {
	const flag = SENT_FLAG_PREFIX + checkoutId.slice(-12);
	try {
		if (localStorage.getItem(flag)) return;
		localStorage.setItem(flag, 'sending');
	} catch {
		/* storage blocked — the Worker rate limit still prevents a burst */
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
			try {
				localStorage.removeItem(flag);
			} catch {
				/* ignore */
			}
		});
}

export function justSentTo(): string | null {
	try {
		return sessionStorage.getItem(JUST_SENT_KEY);
	} catch {
		return null;
	}
}
