// Connect the user's GitHub. Two ways in, same result: one-click OAuth (preferred, when
// configured) or a hand-made fine-grained token (always available — and the only option for
// local dev, where the OAuth callback can't come back to localhost). Token copy mirrors
// GitHub's own UI labels so the steps are followable without prior GitHub knowledge.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { GitHubError } from '../lib/github/client';
import { NEW_TOKEN_URL, REQUIRED_PERMISSIONS } from '../lib/github/config';
import type { GitHubUser } from '../lib/github/session';

export default function ConnectGitHubModal({
	onClose,
	onConnected,
	connect,
	authorize,
	oauthEnabled,
}: {
	onClose: () => void;
	onConnected: (user: GitHubUser) => void;
	connect: (token: string) => Promise<GitHubUser>;
	authorize: () => void;
	oauthEnabled: boolean;
}) {
	const [token, setToken] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!token.trim()) return;
		setBusy(true);
		setError(null);
		try {
			const user = await connect(token.trim());
			onConnected(user);
		} catch (err) {
			setError(err instanceof GitHubError ? err.friendly : "That token didn't work. Please double-check and try again.");
		} finally {
			setBusy(false);
		}
	};

	const tokenSteps = (
		<>
			<ol className="steps">
				<li>
					<a className="btn-secondary btn-inline" href={NEW_TOKEN_URL} target="_blank" rel="noopener noreferrer">
						Open GitHub token page ↗
					</a>
				</li>
				<li>
					Under <strong>Repository access</strong>, choose <strong>All repositories</strong> (needed to create your site
					the first time).
				</li>
				<li>
					Under <strong>Permissions → Repository permissions</strong>, set each of these to <strong>Read and write</strong>:
					<ul className="perm-list">
						{REQUIRED_PERMISSIONS.map((p) => (
							<li key={p.name}>
								<strong>{p.name}</strong> — {p.access} <span className="perm-why">(to {p.why})</span>
							</li>
						))}
					</ul>
				</li>
				<li>
					Click <strong>Generate token</strong>, copy it, and paste it below.
				</li>
			</ol>

			<label className="field">
				<span className="field-label">Personal access token</span>
				<input
					className={`text-input${error ? ' invalid' : ''}`}
					type="password"
					autoComplete="off"
					placeholder="github_pat_…"
					value={token}
					onChange={(e) => setToken(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && submit()}
				/>
				{error && <span className="field-error">{error}</span>}
			</label>
		</>
	);

	const connectBtn = (
		<button type="button" className="btn-primary" onClick={submit} disabled={busy || !token.trim()}>
			{busy ? 'Connecting…' : 'Connect with token'}
		</button>
	);

	return (
		<Modal
			title="Claim your space"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					{!oauthEnabled && connectBtn}
				</>
			}
		>
			{oauthEnabled ? (
				<>
					<p className="modal-lead">
						Your site is stored in a free GitHub account you own — that’s what makes it yours. Approve the
						connection on GitHub and you’ll come right back.
					</p>
					<button type="button" className="btn-primary btn-authorize" onClick={authorize}>
						Continue with GitHub ↗
					</button>
					<details className="advanced">
						<summary>Prefer a personal access token? (advanced)</summary>
						{tokenSteps}
						<div className="advanced-actions">{connectBtn}</div>
					</details>
				</>
			) : (
				<>
					<p className="modal-lead">
						Your site is stored in a free GitHub account you own — that’s what makes it yours. Connect it once
						with a personal access token — a private key you create in a couple of clicks.
					</p>
					{tokenSteps}
				</>
			)}

			<p className="modal-note">
				Your connection is stored only in this browser and is never sent anywhere except GitHub. You can remove it anytime
				with “Sign out”.
			</p>
		</Modal>
	);
}
