// A thin wrapper over the Hangwork Worker API for the browser — the account-flavored
// mirror of github/client.ts. Attaches `Authorization: Bearer <session JWT>` and maps
// the Worker's error codes to plain-language messages.
import { ACCOUNT_API_URL } from './config';

/** An account/API error carrying the HTTP status and a friendly, user-facing message. */
export class AccountError extends Error {
	constructor(
		public status: number,
		public code: string,
		public friendly: string,
	) {
		super(friendly);
		this.name = 'AccountError';
	}
}

export interface RequestOptions {
	method?: string;
	body?: unknown;
	/** Raw bytes body (uploads) — used instead of `body` when set. */
	bytes?: Uint8Array;
	/** Treat these statuses as success (return the response, don't throw). */
	allow?: number[];
}

/** Map Worker error codes to messages a non-technical artist can act on. */
export function friendlyMessage(status: number, code: string): string {
	switch (code) {
		case 'invalid_session':
			return 'Your sign-in has expired. Please sign in again.';
		case 'license_required':
			return 'Publishing needs your Hangwork license. Buy once, or sign in with the email you bought with.';
		case 'license_in_use':
			return 'That license key is already attached to a different account.';
		case 'name_taken':
			return 'That name is taken — pick another.';
		case 'invalid_name':
			return 'Use only lowercase letters, numbers and dashes for the name.';
		case 'rate_limited':
			return 'Too many attempts in a short time. Please wait a minute and try again.';
		case 'file_too_large':
			return 'One of your files is too large to publish. Please use a smaller version.';
		case 'over_quota':
			return 'Your site is over its storage limit. Remove some large files and try again.';
		case 'site_suspended':
		case 'site_taken_down':
			return 'This site is currently unavailable. Contact support if you think this is a mistake.';
		case 'accounts_unconfigured':
		case 'publishing_unconfigured':
			return 'Publishing isn’t switched on for this deployment yet.';
		case 'email_send_failed':
		case 'email_unconfigured':
			return 'The sign-in email couldn’t be sent right now. Please try again shortly.';
		case 'expired_token':
			return 'That sign-in link has expired or was already used. Request a fresh one.';
		case 'domain_taken':
			return 'That domain is already connected to another Hangwork site.';
		default:
			if (status === 0)
				return 'Couldn’t reach Hangwork. Check your connection (or an ad/privacy blocker) and try again.';
			return `Something went wrong (${code || `status ${status}`}). Please try again.`;
	}
}

export class AccountClient {
	constructor(private token: string | null) {}

	/** Perform a request; parse JSON; throw a friendly AccountError on failure. */
	async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<{ status: number; data: T }> {
		let res: Response;
		try {
			res = await fetch(ACCOUNT_API_URL + path, {
				method: opts.method ?? 'POST',
				headers: {
					...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
					...(opts.bytes ? {} : { 'Content-Type': 'application/json' }),
				},
				body: opts.bytes
					? (opts.bytes as unknown as BodyInit)
					: opts.body !== undefined
						? JSON.stringify(opts.body)
						: opts.method === 'GET'
							? undefined
							: '{}',
			});
		} catch {
			throw new AccountError(0, 'unreachable', friendlyMessage(0, 'unreachable'));
		}
		const data = (await res.json().catch(() => ({}))) as T & { error?: string };
		if (res.ok || opts.allow?.includes(res.status)) return { status: res.status, data };
		const code = typeof data?.error === 'string' ? data.error : '';
		throw new AccountError(res.status, code, friendlyMessage(res.status, code));
	}
}
