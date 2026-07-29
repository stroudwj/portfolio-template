// Handles marketing-site "pay upfront" links on every editor surface, including phones
// and the pre-document start screen. The intent survives magic-link/Google redirects in
// sessionStorage, then opens authenticated Polar checkout once the account is ready.
import { useEffect, useState } from 'react';
import { useAccount } from './useAccount';
import SignInModal from './SignInModal';
import LicenseGateModal from './LicenseGateModal';
import type { PolarCheckoutPlan } from '../lib/polar-checkout';

const INTENT_KEY = 'portfolio-editor:unlock-intent';
const PLAN_KEY = 'portfolio-editor:unlock-plan';

function initialIntent(): { active: boolean; plan: PolarCheckoutPlan } {
	if (typeof window === 'undefined') return { active: false, plan: 'lifetime' };
	const url = new URL(window.location.href);
	const fromUrl = url.searchParams.get('unlock') === '1';
	const requestedPlan = url.searchParams.get('plan') === 'monthly' ? 'monthly' : 'lifetime';
	if (fromUrl) {
		try {
			sessionStorage.setItem(INTENT_KEY, '1');
			sessionStorage.setItem(PLAN_KEY, requestedPlan);
		} catch {
			/* the in-memory intent still works */
		}
		url.searchParams.delete('unlock');
		url.searchParams.delete('plan');
		window.history.replaceState({}, '', url.pathname + url.search + url.hash);
	}
	try {
		const storedPlan = sessionStorage.getItem(PLAN_KEY) === 'monthly' ? 'monthly' : 'lifetime';
		return {
			active: fromUrl || sessionStorage.getItem(INTENT_KEY) === '1',
			plan: fromUrl ? requestedPlan : storedPlan,
		};
	} catch {
		return { active: fromUrl, plan: requestedPlan };
	}
}

export default function CheckoutIntent() {
	const account = useAccount();
	const [intent, setIntent] = useState(initialIntent);

	const clearIntent = () => {
		setIntent((current) => ({ ...current, active: false }));
		try {
			sessionStorage.removeItem(INTENT_KEY);
			sessionStorage.removeItem(PLAN_KEY);
		} catch {
			/* ignore */
		}
	};

	useEffect(() => {
		if (intent.active && account.licensed) clearIntent();
	}, [intent.active, account.licensed]);

	if (!intent.active || account.status === 'checking') return null;

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

	if (account.licensed) return null;

	return (
		<LicenseGateModal
			context="unlock"
			initialPlan={intent.plan}
			redeemTestAccess={account.redeemTestAccess}
			onClose={clearIntent}
			onUnlocked={clearIntent}
		/>
	);
}
