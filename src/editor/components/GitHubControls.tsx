// Topbar GitHub area: a "Connect GitHub" button until connected, then a connection chip
// plus the primary "Publish website" call to action. Owns the two modals' open state.
import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import { useGitHub } from './useGitHub';
import type { LicenseSession } from './useLicense';
import { shouldResumePublish, clearResumePublish } from '../lib/license/flow';
import { hasPublishableContent } from '../lib/validation';
import ConnectGitHubModal from './ConnectGitHubModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';

export default function GitHubControls({ license }: { license: LicenseSession }) {
	const { doc } = useEditor();
	const gh = useGitHub();
	const [showConnect, setShowConnect] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showPublish, setShowPublish] = useState(false);

	// Publishing needs two independent things, in either order: a built site and an
	// unlocked account. Built-but-unpaid → the license gate (the warm pay-to-publish
	// flow); paid-but-empty → Publish simply waits for content, no payment prompt.
	const built = doc ? hasPublishableContent(doc) : false;
	const needsLicense = license.required && license.status !== 'licensed';

	// After a checkout round-trip (buyer clicked Buy, paid, and got auto-unlocked on reload),
	// reopen Publish right where they left off. Wait until GitHub is connected AND the license has
	// activated; if activation didn't land, just drop the breadcrumb rather than reopening the gate.
	useEffect(() => {
		if (!shouldResumePublish()) return;
		if (gh.status === 'connected' && license.status === 'licensed') {
			clearResumePublish();
			if (built) setShowPublish(true);
		} else if (license.status === 'unlicensed') {
			clearResumePublish();
		}
	}, [gh.status, license.status, built]);

	if (gh.status === 'checking') {
		return <span className="gh-chip muted-chip">Checking GitHub…</span>;
	}

	const onPublishClick = () => {
		if (!built) return;
		if (needsLicense) setShowLicense(true);
		else setShowPublish(true);
	};

	return (
		<>
			{gh.status === 'connected' && gh.user ? (
				<>
					<span className="gh-chip">
						<img src={gh.user.avatarUrl} alt="" className="gh-avatar" />
						<span className="gh-login">@{gh.user.login}</span>
						<button type="button" className="gh-signout" onClick={gh.signOut}>
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
					{gh.error && <span className="gh-chip gh-error-chip">{gh.error}</span>}
					<button type="button" className="btn-primary" onClick={() => setShowConnect(true)}>
						Claim your space
					</button>
				</>
			)}

			{showConnect && (
				<ConnectGitHubModal
					connect={gh.connect}
					authorize={() => gh.authorize('editor')}
					oauthEnabled={gh.oauthEnabled}
					onClose={() => setShowConnect(false)}
					onConnected={() => {
						setShowConnect(false);
						// Honor the license gate on this path too — an unlicensed user who reaches
						// Publish via Connect must still see LicenseGateModal, not PublishModal.
						onPublishClick();
					}}
				/>
			)}
			{showLicense && (
				<LicenseGateModal
					activate={license.activate}
					revalidate={license.revalidate}
					onClose={() => setShowLicense(false)}
					onUnlocked={() => {
						setShowLicense(false);
						if (built) setShowPublish(true);
					}}
				/>
			)}
			{showPublish && gh.user && <PublishModal user={gh.user} onClose={() => setShowPublish(false)} />}
		</>
	);
}
