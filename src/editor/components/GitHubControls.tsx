// Topbar GitHub area: a "Connect GitHub" button until connected, then a connection chip
// plus the primary "Publish website" call to action. Owns the two modals' open state.
import { useEffect, useState } from 'react';
import { useGitHub } from './useGitHub';
import type { LicenseSession } from './useLicense';
import { shouldResumePublish, clearResumePublish } from '../lib/license/flow';
import ConnectGitHubModal from './ConnectGitHubModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';

export default function GitHubControls({ license }: { license: LicenseSession }) {
	const gh = useGitHub();
	const [showConnect, setShowConnect] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showPublish, setShowPublish] = useState(false);

	// After a checkout round-trip (buyer clicked Buy, paid, and got auto-unlocked on reload),
	// reopen Publish right where they left off. Wait until GitHub is connected AND the license has
	// activated; if activation didn't land, just drop the breadcrumb rather than reopening the gate.
	useEffect(() => {
		if (!shouldResumePublish()) return;
		if (gh.status === 'connected' && license.status === 'licensed') {
			clearResumePublish();
			setShowPublish(true);
		} else if (license.status === 'unlicensed') {
			clearResumePublish();
		}
	}, [gh.status, license.status]);

	if (gh.status === 'checking') {
		return <span className="gh-chip muted-chip">Checking GitHub…</span>;
	}

	// Publishing (not building/previewing) requires a license when the gate is configured.
	const needsLicense = license.required && license.status !== 'licensed';
	const onPublishClick = () => (needsLicense ? setShowLicense(true) : setShowPublish(true));

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
					<button type="button" className="btn-primary" onClick={onPublishClick}>
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
					authorize={gh.authorize}
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
						setShowPublish(true);
					}}
				/>
			)}
			{showPublish && gh.user && <PublishModal user={gh.user} onClose={() => setShowPublish(false)} />}
		</>
	);
}
