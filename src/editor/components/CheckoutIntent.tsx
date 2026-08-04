// Handles marketing-site "pay upfront" links on every editor surface, including phones
// and the pre-document start screen. The intent survives magic-link/Google redirects in
// sessionStorage, then opens authenticated Polar checkout once the account is ready.
import { useEffect, useState } from 'react';
import { useAccount } from './useAccount';
import SignInModal from './SignInModal';
import LicenseGateModal from './LicenseGateModal';
import type { HangworkPlan } from '../lib/polar-checkout';

const INTENT_KEY = 'portfolio-editor:unlock-intent';

function initialIntent(): HangworkPlan | null {
	if (typeof window === 'undefined') return null;
	const url = new URL(window.location.href);
	const fromUrl = url.searchParams.get('unlock') === '1';
	const requestedPlan: HangworkPlan = url.searchParams.get('plan') === 'monthly' ? 'monthly' : 'lifetime';
	if (fromUrl) {
		try {
			sessionStorage.setItem(INTENT_KEY, requestedPlan);
		} catch {
			/* the in-memory intent still works */
		}
		url.searchParams.delete('unlock');
		url.searchParams.delete('plan');
		window.history.replaceState({}, '', url.pathname + url.search + url.hash);
	}
	try {
		if (fromUrl) return requestedPlan;
		const stored = sessionStorage.getItem(INTENT_KEY);
		return stored === 'monthly' ? 'monthly' : stored === 'lifetime' || stored === '1' ? 'lifetime' : null;
	} catch {
		return fromUrl ? requestedPlan : null;
	}
}

export default function CheckoutIntent() {
	const account = useAccount();
	const [intent, setIntent] = useState<HangworkPlan | null>(initialIntent);

	const clearIntent = () => {
		setIntent(null);
		try {
			sessionStorage.removeItem(INTENT_KEY);
		} catch {
			/* ignore */
		}
	};

	useEffect(() => {
		if (account.plan === 'lifetime' || (intent === 'monthly' && account.plan === 'monthly')) clearIntent();
	}, [intent, account.plan]);

	if (!intent || account.status === 'checking') return null;

	if (account.status === 'signed-out') {
		return (
			<SignInModal
				sendMagicLink={account.sendMagicLink}
				signInWithGoogle={account.signInWithGoogle}
				googleEnabled={account.googleEnabled}
				onClose={clearIntent}
			/>
		);
	}

	if (account.plan === 'lifetime' || (account.plan === 'monthly' && intent === 'monthly')) return null;

	return (
		<LicenseGateModal
			context="unlock"
			defaultPlan={intent}
			currentPlan={account.plan}
			onClose={clearIntent}
		/>
	);
}
