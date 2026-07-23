// React state for the Hangwork account — the editor's identity source, replacing
// useGitHub. There IS a server session now (a 30-day JWT from the Worker), but the shape
// mirrors useGitHub so the swap in the start/onboarding flow is mechanical: validate the
// stored session on load, expose sign-in methods and signOut.
import { useCallback, useEffect, useState } from 'react';
import {
	getSession,
	setSession,
	clearSession,
	type AccountSummary,
	type AccountUser,
	type AccountSiteSummary,
} from '../lib/account/session';
import { AccountClient, AccountError } from '../lib/account/client';
import { completeAuthRedirect, startGoogleOAuth, startMagicLink } from '../lib/account/flow';
import { isAccountsConfigured, isGoogleConfigured } from '../lib/account/config';
import { clearSiteInfo } from '../lib/account/site-store';
import { completeLicenseRedirect } from '../lib/license/flow';
import { maybeSendPostPurchaseEmail } from '../lib/license/handoff';

export type AccountStatus = 'checking' | 'signed-out' | 'signed-in';

export interface AccountSession {
	status: AccountStatus;
	user: AccountUser | null;
	/** Whether this ACCOUNT owns an active license (the server-side publish gate). */
	licensed: boolean;
	site: AccountSiteSummary | null;
	/** Email a single-use sign-in link. Throws AccountError for the UI to show. */
	sendMagicLink(email: string): Promise<void>;
	/** Start Google sign-in (redirects away). */
	signInWithGoogle(): void;
	/** Attach a purchased license key to the signed-in account. Throws AccountError. */
	bindLicense(key: string): Promise<void>;
	/** Re-fetch the account summary (e.g. after checkout in another tab). */
	refresh(): Promise<void>;
	signOut(): void;
	/** Whether accounts are configured at all / whether Google is offered. */
	accountsEnabled: boolean;
	googleEnabled: boolean;
	/** A message from a failed sign-in return, for the UI to surface. */
	error: string | null;
}

export function useAccount(): AccountSession {
	const [status, setStatus] = useState<AccountStatus>(isAccountsConfigured() ? 'checking' : 'signed-out');
	const [user, setUser] = useState<AccountUser | null>(null);
	const [licensed, setLicensed] = useState(false);
	const [site, setSite] = useState<AccountSiteSummary | null>(null);
	const [error, setError] = useState<string | null>(null);

	const applySummary = useCallback((summary: AccountSummary) => {
		setUser(summary.user);
		setLicensed(summary.licensed);
		setSite(summary.site);
		setStatus('signed-in');
	}, []);

	// On load: finish a sign-in return if this page load is one, then validate whatever
	// session we now hold (also covers "stored session expired"). If checkout dropped a
	// `?license_key=` in the URL and we're signed in, bind it to the account.
	useEffect(() => {
		if (!isAccountsConfigured()) return;
		let alive = true;
		void (async () => {
			const redirect = await completeAuthRedirect(); // memoized — safe across hook instances
			if (!alive) return;
			if (redirect.error) setError(redirect.error);
			if (redirect.session) {
				setSession({ token: redirect.session.token, user: redirect.session.user });
			}

			const stored = getSession();
			if (!stored) {
				setStatus('signed-out');
				return;
			}
			try {
				const client = new AccountClient(stored.token);
				const licenseKey = completeLicenseRedirect(); // scrubs the URL either way
				const { data } = await client.request<AccountSummary>('/auth/session');
				if (!alive) return;
				let summary = data;
				if (licenseKey && !summary.licensed) {
					try {
						const bound = await client.request<AccountSummary>('/auth/license/bind', {
							body: { license_key: licenseKey },
						});
						summary = bound.data;
						// A fresh purchase just landed: send the "you own it" email with the
						// desktop link (fire-and-forget, once per key).
						maybeSendPostPurchaseEmail(licenseKey);
					} catch {
						/* invalid/duplicate key from the URL — the summary stands */
					}
				}
				if (!alive) return;
				applySummary(summary);
			} catch (err) {
				if (!alive) return;
				if (err instanceof AccountError && err.status === 401) {
					clearSession();
					setStatus('signed-out');
				} else {
					// Network hiccup — keep the stored identity visible rather than logging
					// the user out; every server action re-authenticates anyway.
					setUser(stored.user);
					setStatus('signed-in');
				}
			}
		})();
		return () => {
			alive = false;
		};
	}, [applySummary]);

	const sendMagicLink = useCallback(async (email: string) => {
		await startMagicLink(email); // throws AccountError — caller shows the message
		setError(null);
	}, []);

	const signInWithGoogle = useCallback(() => {
		startGoogleOAuth(); // navigates away
	}, []);

	const bindLicense = useCallback(
		async (key: string) => {
			const stored = getSession();
			if (!stored) throw new AccountError(401, 'invalid_session', 'Sign in before adding your license.');
			const { data } = await new AccountClient(stored.token).request<AccountSummary>('/auth/license/bind', {
				body: { license_key: key.trim() },
			});
			applySummary(data);
		},
		[applySummary],
	);

	const refresh = useCallback(async () => {
		const stored = getSession();
		if (!stored) return;
		try {
			const { data } = await new AccountClient(stored.token).request<AccountSummary>('/auth/session');
			applySummary(data);
		} catch {
			/* transient — keep current state */
		}
	}, [applySummary]);

	const signOut = useCallback(() => {
		// The session is a stateless JWT — forgetting it IS the sign-out. Also drop the
		// saved site pointer so the next account in this browser can't see the last one's.
		clearSession();
		clearSiteInfo();
		setUser(null);
		setLicensed(false);
		setSite(null);
		setStatus('signed-out');
	}, []);

	return {
		status,
		user,
		licensed,
		site,
		sendMagicLink,
		signInWithGoogle,
		bindLicense,
		refresh,
		signOut,
		accountsEnabled: isAccountsConfigured(),
		googleEnabled: isGoogleConfigured(),
		error,
	};
}
