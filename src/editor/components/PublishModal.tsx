// Drives a publish end to end: pick a repo name (first time only), watch progress, then
// see the live URL. All GitHub specifics live behind GitHubTarget — this component only
// builds the bundle, calls target.publish(bundle, onProgress), and renders the result.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { useEditor } from '../store';
import { buildBundle, type PublishProgress, type PublishResult } from '../lib/exporter';
import { collectIssues } from '../lib/validation';
import { GitHubClient, GitHubError } from '../lib/github/client';
import { getToken, type GitHubUser } from '../lib/github/session';
import { GitHubTarget } from '../lib/github/target';
import { localRepoStore, loadRepoInfo } from '../lib/github/store';
import { isRepoNameAvailable, pagesUrl } from '../lib/github/repo';
import { ProgressList, appendStep } from './ui/ProgressList';

type Phase = 'configure' | 'publishing' | 'success' | 'error';

function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^[-.]+|[-.]+$/g, '')
			.slice(0, 90) || 'my-portfolio'
	);
}

export default function PublishModal({ user, onClose }: { user: GitHubUser; onClose: () => void }) {
	const { doc } = useEditor();
	const [saved] = useState(() => loadRepoInfo());
	const firstPublish = !saved;

	const [repoName, setRepoName] = useState(() => saved?.repo ?? slugify(doc?.content.site.name || user.login + '-portfolio'));
	const [nameState, setNameState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
	const [phase, setPhase] = useState<Phase>('configure');
	const [log, setLog] = useState<PublishProgress[]>([]);
	const [result, setResult] = useState<PublishResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	if (!doc) return null;
	const issues = collectIssues(doc);
	const targetUrl = pagesUrl(user.login, repoName);

	const checkName = async () => {
		if (!firstPublish || !repoName.trim()) return;
		setNameState('checking');
		try {
			const free = await isRepoNameAvailable(new GitHubClient(getToken() ?? ''), user.login, repoName.trim());
			setNameState(free ? 'available' : 'taken');
		} catch {
			setNameState('idle');
		}
	};

	const runPublish = async () => {
		setPhase('publishing');
		setLog([]);
		setError(null);
		try {
			const bundle = await buildBundle(doc);
			const target = new GitHubTarget({
				client: new GitHubClient(getToken() ?? ''),
				login: user.login,
				store: localRepoStore,
				desiredRepoName: repoName.trim(),
			});
			const res = await target.publish(bundle, (p) => setLog((prev) => appendStep(prev, p)));
			setResult(res);
			setPhase('success');
		} catch (err) {
			setError(err instanceof GitHubError ? err.friendly : err instanceof Error ? err.message : 'Publishing failed.');
			setPhase('error');
		}
	};

	const copyUrl = async () => {
		if (!result?.url) return;
		try {
			await navigator.clipboard.writeText(result.url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard blocked — the link is still visible to copy manually */
		}
	};

	// ---- Success screen ----
	if (phase === 'success' && result) {
		return (
			<Modal title="Published" onClose={onClose} footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
				<div className="publish-success">
					<div className="success-emoji">✅</div>
					<h3>Your portfolio is live!</h3>
					<a className="live-url" href={result.url} target="_blank" rel="noopener noreferrer">
						{result.url}
					</a>
					<p className="modal-note">It can take a minute for a brand-new site to finish building. Refresh if it isn’t up yet.</p>
					<div className="success-actions">
						<a className="btn-primary" href={result.url} target="_blank" rel="noopener noreferrer">
							Open website ↗
						</a>
						<button type="button" className="btn-secondary" onClick={copyUrl}>
							{copied ? 'Copied!' : 'Copy URL'}
						</button>
						{result.repoUrl && (
							<a className="btn-ghost" href={result.repoUrl} target="_blank" rel="noopener noreferrer">
								View repository ↗
							</a>
						)}
					</div>
				</div>
			</Modal>
		);
	}

	// ---- Progress screen ----
	if (phase === 'publishing') {
		return (
			<Modal title="Publishing…" onClose={onClose} dismissable={false}>
				<ProgressList log={log} />
			</Modal>
		);
	}

	// ---- Error screen ----
	if (phase === 'error') {
		return (
			<Modal
				title="Publishing failed"
				onClose={onClose}
				footer={
					<>
						<button type="button" className="btn-ghost" onClick={onClose}>
							Close
						</button>
						<button type="button" className="btn-primary" onClick={() => setPhase('configure')}>
							Try again
						</button>
					</>
				}
			>
				<p className="publish-error">{error}</p>
			</Modal>
		);
	}

	// ---- Configure screen ----
	return (
		<Modal
			title="Publish website"
			onClose={onClose}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={runPublish} disabled={!repoName.trim()}>
						{firstPublish ? 'Publish website' : 'Publish update'}
					</button>
				</>
			}
		>
			{issues.length > 0 && (
				<div className="issues">
					<strong>Heads up — some things are still empty:</strong>
					<ul>
						{issues.map((issue, i) => (
							<li key={i}>{issue}</li>
						))}
					</ul>
					You can publish anyway and fix them later.
				</div>
			)}

			{firstPublish ? (
				<>
					<label className="field">
						<span className="field-label">Website name</span>
						<input
							className="text-input"
							value={repoName}
							onChange={(e) => {
								setRepoName(slugify(e.target.value));
								setNameState('idle');
							}}
							onBlur={checkName}
							placeholder="my-portfolio"
						/>
						<span className="field-hint">
							{nameState === 'checking' && 'Checking availability…'}
							{nameState === 'available' && '✓ Available'}
							{nameState === 'taken' && '✕ You already have a repository with this name — pick another.'}
							{nameState === 'idle' && 'Letters, numbers and dashes. This becomes part of your web address.'}
						</span>
					</label>
					<p className="url-preview">
						Your site will be at <strong>{targetUrl}</strong>
					</p>
				</>
			) : (
				<p className="url-preview">
					Updating your existing site at <strong>{saved?.pagesUrl || targetUrl}</strong> (repository{' '}
					<strong>
						{saved?.owner}/{saved?.repo}
					</strong>
					).
				</p>
			)}
		</Modal>
	);
}
