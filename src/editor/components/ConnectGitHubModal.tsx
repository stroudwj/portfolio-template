// Guides a non-technical user through creating a fine-grained token and pasting it.
// No OAuth: the token IS the connection. Copy here mirrors GitHub's own UI labels so
// the steps are followable without prior GitHub knowledge.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { GitHubError } from '../lib/github/client';
import { NEW_TOKEN_URL, REQUIRED_PERMISSIONS } from '../lib/github/config';
import type { GitHubUser } from '../lib/github/session';

export default function ConnectGitHubModal({
	onClose,
	onConnected,
	connect,
}: {
	onClose: () => void;
	onConnected: (user: GitHubUser) => void;
	connect: (token: string) => Promise<GitHubUser>;
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

	return (
		<Modal
			title="Connect GitHub"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={submit} disabled={busy || !token.trim()}>
						{busy ? 'Connecting…' : 'Connect'}
					</button>
				</>
			}
		>
			<p className="modal-lead">
				Publishing puts your site on your own GitHub account. Connect it once with a personal access token — a private
				key you create in a couple of clicks.
			</p>

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

			<p className="modal-note">
				Your token is stored only in this browser and is never sent anywhere except GitHub. You can remove it anytime with
				“Sign out”. Once your site exists, you can swap in a token limited to just that one repository — see the README.
			</p>
		</Modal>
	);
}
