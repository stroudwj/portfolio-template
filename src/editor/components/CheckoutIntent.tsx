// Handles marketing-site "pay upfront" links on every editor surface, including phones
// and the pre-document start screen. The intent survives magic-link/Google redirects in
// sessionStorage, then opens authenticated Polar checkout once the account is ready.
import { useEffect, useState } from 'react';
import { useAccount } from './useAccount';
import SignInModal from './SignInModal';
import LicenseGateModal from './LicenseGateModal';

const INTENT_KEY = 'portfolio-editor:unlock-intent';

function initialIntent(): boolean {
	if (typeof window === 'undefined') return false;
	const url = new URL(window.location.href);
	const fromUrl = url.searchParams.get('unlock') === '1';
	if (fromUrl) {
		try {
			sessionStorage.setItem(INTENT_KEY, '1');
		} catch {
			/* the in-memory intent still works */
		}
		url.searchParams.delete('unlock');
		url.searchParams.delete('plan');
		window.history.replaceState({}, '', url.pathname + url.search + url.hash);
	}
	try {
		return fromUrl || sessionStorage.getItem(INTENT_KEY) === '1';
	} catch {
		return fromUrl;
	}
}

export default function CheckoutIntent() {
	const account = useAccount();
	const [intent, setIntent] = useState(initialIntent);

	const clearIntent = () => {
		setIntent(false);
		try {
			sessionStorage.removeItem(INTENT_KEY);
		} catch {
			/* ignore */
		}
	};

	useEffect(() => {
		if (intent && account.licensed) clearIntent();
	}, [intent, account.licensed]);

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

	if (account.licensed) return null;

	return (
		<LicenseGateModal
			context="unlock"
			onClose={clearIntent}
		/>
	);
}
