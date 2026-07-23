// Topbar account area: a "Claim your space" button until signed in, then an account chip
// plus the primary "Publish website" call to action. Owns the two modals' open state.
// (The account-flavored replacement for GitHubControls.)
import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import { useAccount } from './useAccount';
import type { LicenseSession } from './useLicense';
import { shouldResumePublish, clearResumePublish } from '../lib/license/flow';
import { getLicense } from '../lib/license/session';
import { hasPublishableContent } from '../lib/validation';
import SignInModal from './SignInModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';

export default function AccountControls({ license }: { license: LicenseSession }) {
	const { doc } = useEditor();
	const account = useAccount();
	const [showSignIn, setShowSignIn] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showPublish, setShowPublish] = useState(false);

	// Publishing needs two independent things, in either order: a built site and an
	// unlocked account. The account's server-side license is authoritative; a locally
	// activated key still counts during the transition (the Worker re-checks anyway).
	const built = doc ? hasPublishableContent(doc) : false;
	const unlocked = account.licensed || !license.required || license.status === 'licensed';
	const signedIn = account.status === 'signed-in';

	// After a checkout round-trip (buyer clicked Buy, paid, and got auto-unlocked on
	// reload), reopen Publish right where they left off — once signed in AND unlocked.
	useEffect(() => {
		if (!shouldResumePublish()) return;
		if (signedIn && unlocked) {
			clearResumePublish();
			if (built) setShowPublish(true);
		} else if (license.status === 'unlicensed' && !account.licensed && account.status !== 'checking') {
			clearResumePublish();
		}
	}, [signedIn, unlocked, built, license.status, account.licensed, account.status]);

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
					activate={license.activate}
					revalidate={license.revalidate}
					onClose={() => setShowLicense(false)}
					onUnlocked={() => {
						setShowLicense(false);
						// Record the unlock on the ACCOUNT too (the server-side gate) —
						// best-effort; the stored key re-binds on the next sign-in either way.
						const stored = getLicense();
						if (stored) void account.bindLicense(stored.key).catch(() => {});
						if (built) setShowPublish(true);
					}}
				/>
			)}
			{showPublish && <PublishModal account={account} onClose={() => setShowPublish(false)} />}
		</>
	);
}
