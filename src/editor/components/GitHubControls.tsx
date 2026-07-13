// Topbar GitHub area: a "Connect GitHub" button until connected, then a connection chip
// plus the primary "Publish website" call to action. Owns the two modals' open state.
import { useState } from 'react';
import { useGitHub } from './useGitHub';
import { useLicense } from './useLicense';
import ConnectGitHubModal from './ConnectGitHubModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';

export default function GitHubControls() {
	const gh = useGitHub();
	const license = useLicense();
	const [showConnect, setShowConnect] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showPublish, setShowPublish] = useState(false);

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
						Publish website
					</button>
				</>
			) : (
				<>
					{gh.error && <span className="gh-chip gh-error-chip">{gh.error}</span>}
					<button type="button" className="btn-primary" onClick={() => setShowConnect(true)}>
						Connect GitHub
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
						setShowPublish(true);
					}}
				/>
			)}
			{showLicense && (
				<LicenseGateModal
					activate={license.activate}
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
