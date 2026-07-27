// Topbar account area: a "Claim your space" button until signed in, then an account chip
// plus the primary "Publish website" call to action. Owns the two modals' open state.
// (The account-flavored replacement for GitHubControls.)
import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import { useAccount } from './useAccount';
import { shouldResumePublish, clearResumePublish } from '../lib/polar-checkout';
import { hasPublishableContent } from '../lib/validation';
import SignInModal from './SignInModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';

export default function AccountControls() {
	const { doc } = useEditor();
	const account = useAccount({ returnToEditorAfterGoogle: Boolean(doc) });
	const [showSignIn, setShowSignIn] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showPublish, setShowPublish] = useState(false);

	// Publishing needs two independent things, in either order: a built site and an
	// account entitlement. The Worker's D1 ledger is authoritative.
	const built = doc ? hasPublishableContent(doc) : false;
	const unlocked = account.licensed;
	const signedIn = account.status === 'signed-in';

	// After a checkout round-trip (buyer clicked Buy, paid, and got auto-unlocked on
	// reload), reopen Publish right where they left off — once signed in AND unlocked.
	useEffect(() => {
		if (!shouldResumePublish()) return;
		if (signedIn && unlocked) {
			clearResumePublish();
			if (built) setShowPublish(true);
		}
	}, [signedIn, unlocked, built]);

	if (account.status === 'checking') {
		return <span className="gh-chip muted-chip">Checking sign-in…</span>;
	}

	const onPublishClick = () => {
		if (!built) return;
		if (!signedIn) setShowSignIn(true);
		else if (!unlocked) setShowLicense(true);
		else setShowPublish(true);
	};

	return (
		<>
			{signedIn && account.user ? (
				<>
					<span className="gh-chip">
						<span className="gh-login">{account.user.email}</span>
						<button type="button" className="gh-signout" onClick={account.signOut}>
							Sign out
						</button>
					</span>
					<button
						type="button"
						className="btn-primary"
						onClick={onPublishClick}
						disabled={!built}
						title={built ? undefined : 'Hang your first piece, then publish.'}
					>
						Publish
					</button>
				</>
			) : (
				<>
					{account.error && <span className="gh-chip gh-error-chip">{account.error}</span>}
					<button type="button" className="btn-primary" onClick={() => setShowSignIn(true)}>
						{built ? 'Claim your space' : 'Sign in'}
					</button>
				</>
			)}

			{showSignIn && (
				<SignInModal
					sendMagicLink={account.sendMagicLink}
					signInWithGoogle={account.signInWithGoogle}
					googleEnabled={account.googleEnabled}
					onClose={() => setShowSignIn(false)}
				/>
			)}
			{showLicense && (
				<LicenseGateModal
					redeemTestAccess={account.redeemTestAccess}
					onClose={() => setShowLicense(false)}
					onUnlocked={() => {
						setShowLicense(false);
						if (built) setShowPublish(true);
					}}
				/>
			)}
			{showPublish && <PublishModal account={account} onClose={() => setShowPublish(false)} />}
		</>
	);
}
