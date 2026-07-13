// Topbar GitHub area: a "Connect GitHub" button until connected, then a connection chip
// plus the primary "Publish website" call to action. Owns the two modals' open state.
import { useState } from 'react';
import { useGitHub } from './useGitHub';
import ConnectGitHubModal from './ConnectGitHubModal';
import PublishModal from './PublishModal';

export default function GitHubControls() {
	const gh = useGitHub();
	const [showConnect, setShowConnect] = useState(false);
	const [showPublish, setShowPublish] = useState(false);

	if (gh.status === 'checking') {
		return <span className="gh-chip muted-chip">Checking GitHub…</span>;
	}

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
					<button type="button" className="btn-primary" onClick={() => setShowPublish(true)}>
						Publish website
					</button>
				</>
			) : (
				<button type="button" className="btn-primary" onClick={() => setShowConnect(true)}>
					Connect GitHub
				</button>
			)}

			{showConnect && (
				<ConnectGitHubModal
					connect={gh.connect}
					onClose={() => setShowConnect(false)}
					onConnected={() => {
						setShowConnect(false);
						setShowPublish(true);
					}}
				/>
			)}
			{showPublish && gh.user && <PublishModal user={gh.user} onClose={() => setShowPublish(false)} />}
		</>
	);
}
