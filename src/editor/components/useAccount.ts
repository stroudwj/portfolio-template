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
	SESSION_STORAGE_KEY,
} from '../lib/account/session';
import { AccountClient, AccountError } from '../lib/account/client';
import { completeAuthRedirect, startGoogleOAuth, startMagicLink } from '../lib/account/flow';
import { isAccountsConfigured, isGoogleConfigured } from '../lib/account/config';
import { clearSiteInfo } from '../lib/account/site-store';
import { completePolarCheckoutReturn, getPolarCheckoutStatus } from '../lib/polar-checkout';
import { maybeSendPostPurchaseEmail } from '../lib/handoff';
import { funnelStep } from '../../lib/funnel';

export type AccountStatus = 'checking' | 'signed-out' | 'signed-in';

export interface AccountSession {
	status: AccountStatus;
	user: AccountUser | null;
	/** Whether this ACCOUNT owns an active license (the server-side publish gate). */
	licensed: boolean;
	/** Active access tier. Lifetime includes downloads; monthly requires continued payment. */
	plan: 'lifetime' | 'monthly' | null;
	canDownload: boolean;
	site: AccountSiteSummary | null;
	/** Email a single-use sign-in link. Throws AccountError for the UI to show. */
	sendMagicLink(email: string): Promise<void>;
	/** Start Google sign-in (redirects away). */
	signInWithGoogle(): void;
	/** Redeem the shared tester code for a revocable manual publishing grant. */
	redeemTestAccess(code: string): Promise<void>;
	/** Change the published site's visibility: 'active' | 'offline' | 'under_construction'. */
	setSiteStatus(status: string): Promise<void>;
	/** Permanently delete the published site. `confirm` must echo the site's name. */
	deleteSite(confirm: string): Promise<void>;
	/** Re-fetch the account summary (e.g. after checkout in another tab). */
	refresh(): Promise<void>;
	signOut(): void;
	/** Whether accounts are configured at all / whether Google is offered. */
	accountsEnabled: boolean;
	googleEnabled: boolean;
	/** A message from a failed sign-in return, for the UI to surface. */
	error: string | null;
}

export function useAccount({ returnToEditorAfterGoogle = false }: { returnToEditorAfterGoogle?: boolean } = {}): AccountSession {
	const [status, setStatus] = useState<AccountStatus>(isAccountsConfigured() ? 'checking' : 'signed-out');
	const [user, setUser] = useState<AccountUser | null>(null);
	const [licensed, setLicensed] = useState(false);
	const [plan, setPlan] = useState<'lifetime' | 'monthly' | null>(null);
	const [canDownload, setCanDownload] = useState(false);
	const [site, setSite] = useState<AccountSiteSummary | null>(null);
	const [error, setError] = useState<string | null>(null);

	const applySummary = useCallback((summary: AccountSummary) => {
		// Funnel step 4 of 7 — a session is established (fresh sign-in or a stored one
		// validated). Once per tab session; no identity leaves the browser.
		funnelStep('signin');
		setUser(summary.user);
		setLicensed(summary.licensed);
		setPlan(summary.plan ?? null);
		setCanDownload(summary.canDownload ?? summary.plan === 'lifetime');
		setSite(summary.site);
		setStatus('signed-in');
	}, []);

	// On load: finish a sign-in return, validate the stored session, and reconcile a
	// successful Polar checkout. The webhook is authoritative; a short bounded poll
	// covers the normal race between the browser redirect and webhook delivery.
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
				const checkoutReturn = completePolarCheckoutReturn();
				const { data } = await client.request<AccountSummary>('/auth/session');
				if (!alive) return;
				let summary = data;
				if (checkoutReturn) {
					try {
						const checkout = await getPolarCheckoutStatus(checkoutReturn.checkoutId);
						if (checkout.status === 'succeeded') {
							for (const waitMs of [0, 200, 400, 800, 1200, 1800]) {
								if (summary.plan === checkout.plan) break;
								if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
								const refreshed = await client.request<AccountSummary>('/auth/session');
								summary = refreshed.data;
								if (!alive) return;
							}
							if (summary.plan === checkout.plan) {
								maybeSendPostPurchaseEmail(checkoutReturn.checkoutId);
							} else {
								setError('Your payment completed. Polar is still confirming access — refresh this page in a moment.');
							}
						} else {
							setError('Polar returned from checkout, but the completed payment could not be confirmed.');
						}
					} catch {
						setError('Polar returned from checkout, but Hangwork could not confirm it yet. Refresh this page in a moment.');
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

	// A sign-in finished in ANOTHER tab (magic links open the emailed link in a
	// fresh tab) writes the session to localStorage — pick it up here so this
	// tab's "Sign in" chip flips without a reload.
	useEffect(() => {
		if (!isAccountsConfigured()) return;
		const onStorage = (event: StorageEvent) => {
			if (event.key !== SESSION_STORAGE_KEY) return;
			const stored = getSession();
			if (!stored) {
				setUser(null);
				setLicensed(false);
				setPlan(null);
				setCanDownload(false);
				setSite(null);
				setStatus('signed-out');
				return;
			}
			void (async () => {
				try {
					const { data } = await new AccountClient(stored.token).request<AccountSummary>('/auth/session');
					applySummary(data);
				} catch {
					setUser(stored.user);
					setStatus('signed-in');
				}
			})();
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, [applySummary]);

	const sendMagicLink = useCallback(async (email: string) => {
		await startMagicLink(email); // throws AccountError — caller shows the message
		setError(null);
	}, []);

	const signInWithGoogle = useCallback(() => {
		startGoogleOAuth(returnToEditorAfterGoogle); // navigates away
	}, [returnToEditorAfterGoogle]);

	const redeemTestAccess = useCallback(
		async (code: string) => {
			const stored = getSession();
			if (!stored) throw new AccountError(401, 'invalid_session', 'Sign in before adding tester access.');
			const { data } = await new AccountClient(stored.token).request<AccountSummary>('/auth/test-access/redeem', {
				body: { code: code.trim() },
			});
			applySummary(data);
		},
		[applySummary],
	);

	const setSiteStatus = useCallback(async (nextStatus: string) => {
		const stored = getSession();
		if (!stored) throw new AccountError(401, 'invalid_session', 'Sign in before changing your site.');
		const { data } = await new AccountClient(stored.token).request<{ status: string }>('/site/status', {
			body: { status: nextStatus },
		});
		setSite((prev) => (prev ? { ...prev, status: data.status } : prev));
	}, []);

	const deleteSite = useCallback(async (confirm: string) => {
		const stored = getSession();
		if (!stored) throw new AccountError(401, 'invalid_session', 'Sign in before deleting your site.');
		await new AccountClient(stored.token).request('/site/delete', { body: { confirm } });
		// The site is gone server-side; forget this browser's pointer so a fresh publish
		// starts a brand-new site rather than diffing against the deleted one.
		clearSiteInfo();
		setSite(null);
	}, []);

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
		setPlan(null);
		setCanDownload(false);
		setSite(null);
		setStatus('signed-out');
	}, []);

	return {
		status,
		user,
		licensed,
		plan,
		canDownload,
		site,
		sendMagicLink,
		signInWithGoogle,
		redeemTestAccess,
		setSiteStatus,
		deleteSite,
		refresh,
		signOut,
		accountsEnabled: isAccountsConfigured(),
		googleEnabled: isGoogleConfigured(),
		error,
	};
}
