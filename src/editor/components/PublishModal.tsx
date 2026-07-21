// Drives a publish end to end: pick a repo name (first time only), watch progress, then
// see the live URL. All GitHub specifics live behind GitHubTarget — this component only
// builds the bundle, calls target.publish(bundle, onProgress), and renders the result.
import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { useEditor } from '../store';
import { buildBundle, type PublishProgress, type PublishResult } from '../lib/exporter';
import { collectIssues } from '../lib/validation';
import { GitHubClient, GitHubError } from '../lib/github/client';
import { getToken, type GitHubUser } from '../lib/github/session';
import { GitHubTarget } from '../lib/github/target';
import { PublishConflictError } from '../lib/github/runtime';
import { localRepoStore, loadRepoInfo, clearRepoInfo } from '../lib/github/store';
import { getRepo, getBuildStatus, getRepoNameStatus, pagesUrl } from '../lib/github/repo';
import {
	checkSubdomain,
	claimSubdomain,
	isValidSiteName,
	sanitizeSiteNameInput,
	slugifySiteName,
	subdomainFor,
	SITES_ROOT_DOMAIN,
} from '../lib/github/subdomain';
import { ProgressList, appendStep } from './ui/ProgressList';
import CustomDomainModal from './CustomDomainModal';

type Phase = 'configure' | 'publishing' | 'success' | 'error';
// After the commit lands, the Pages build still takes ~1 min. 'building' polls the
// build; 'timeout' is the graceful degradation (old optimistic screen) when we can't
// tell — polling error, no commit sha, or >3 min without completion.
type BuildState = 'building' | 'live' | 'timeout' | 'failed';

export default function PublishModal({ user, onClose }: { user: GitHubUser; onClose: () => void }) {
	const { doc } = useEditor();
	const [saved, setSaved] = useState(() => loadRepoInfo());
	const [verifying, setVerifying] = useState(() => loadRepoInfo() != null);
	const firstPublish = !saved;

	const [repoName, setRepoName] = useState(() => saved?.repo ?? slugifySiteName(doc?.content.site.name || user.login + '-portfolio'));
	const [nameState, setNameState] = useState<'idle' | 'checking' | 'available' | 'recoverable' | 'taken'>('idle');
	const [phase, setPhase] = useState<Phase>('configure');
	const [log, setLog] = useState<PublishProgress[]>([]);
	const [result, setResult] = useState<PublishResult | null>(null);
	const [build, setBuild] = useState<BuildState>('building');
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState<PublishConflictError | null>(null);
	const [copied, setCopied] = useState(false);
	const [showDomain, setShowDomain] = useState(false);

	// The domain modal edits the saved repo info (pagesUrl/customDomain) — re-read on close.
	const closeDomainModal = () => {
		setShowDomain(false);
		setSaved(loadRepoInfo());
	};

	// The saved repo pointer lives in localStorage and can go stale — e.g. the user deleted the
	// repo on GitHub. Verify it still exists on open; if it's gone (404), drop the pointer and
	// fall back to a first publish, so we show the name field instead of offering to "update" a
	// site that no longer exists.
	useEffect(() => {
		const info = loadRepoInfo();
		if (!info) return;
		let alive = true;
		getRepo(new GitHubClient(getToken() ?? ''), info.owner, info.repo)
			.then((ref) => {
				if (!alive) return;
				if (!ref) {
					clearRepoInfo();
					setSaved(null);
				}
				setVerifying(false);
			})
			.catch(() => {
				// Network/permission hiccup — don't wrongly downgrade to a first publish.
				if (alive) setVerifying(false);
			});
		return () => {
			alive = false;
		};
	}, []);

	// Poll the Pages build for the publish commit so "live" means actually live (a
	// brand-new site 404s for ~1 min after publish, which reads as a failure).
	useEffect(() => {
		if (phase !== 'success' || !result) return;
		const { owner, repo, commitSha } = result;
		if (!owner || !repo || !commitSha) {
			setBuild('timeout');
			return;
		}
		const client = new GitHubClient(getToken() ?? '');
		const started = Date.now();
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		const tick = async () => {
			let status;
			try {
				status = await getBuildStatus(client, owner, repo, commitSha);
			} catch {
				status = null; // can't tell — fall back to the optimistic screen
			}
			if (!alive) return;
			if (status === 'success') setBuild('live');
			else if (status === 'failure') setBuild('failed');
			else if (status === null || Date.now() - started > 3 * 60_000) setBuild('timeout');
			else timer = setTimeout(tick, 5000);
		};
		timer = setTimeout(tick, 5000);
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [phase, result]);

	if (!doc) return null;
	if (showDomain) return <CustomDomainModal onClose={closeDomainModal} />;
	const issues = collectIssues(doc);
	const nameIsValid = !firstPublish || isValidSiteName(repoName);
	const nameProblem = !repoName
		? 'Enter a website name before publishing.'
		: repoName.endsWith('-')
			? 'A website name cannot end with a dash.'
			: !nameIsValid
				? 'Use only letters, numbers and dashes.'
				: null;
	// The default address for a new site. If the address service is unreachable at
	// publish time, the publish still succeeds at pagesUrl(login, repoName) instead.
	const targetUrl = `https://${subdomainFor(nameIsValid ? repoName : 'your-name')}`;

	// ---- Verifying the saved repo still exists (avoids flashing "update" for a deleted site) ----
	if (verifying) {
		return (
			<Modal title="Publish" onClose={onClose}>
				<p className="modal-note">Checking your published site…</p>
			</Modal>
		);
	}

	const checkName = async () => {
		if (!firstPublish || !isValidSiteName(repoName)) return;
		setNameState('checking');
		try {
			const name = repoName.trim();
			// The name must be free in BOTH namespaces: the user's repos and *.hangwork.art.
			// 'unknown' (address service unreachable) doesn't block — publish falls back.
			const [repoStatus, sub] = await Promise.all([
				getRepoNameStatus(new GitHubClient(getToken() ?? ''), user.login, name),
				checkSubdomain(getToken() ?? '', name),
			]);
			setNameState(repoStatus !== 'taken' && sub !== 'taken' ? repoStatus : 'taken');
		} catch {
			setNameState('idle');
		}
	};

	const runPublish = async (forceRuntimeUpgrade = false) => {
		if (firstPublish && (!isValidSiteName(repoName) || nameState === 'taken')) return;
		setPhase('publishing');
		setLog([]);
		setError(null);
		setConflict(null);
		setBuild('building');
		try {
			const bundle = await buildBundle(doc);
			const target = new GitHubTarget({
				client: new GitHubClient(getToken() ?? ''),
				login: user.login,
				store: localRepoStore,
				desiredRepoName: repoName.trim(),
				claimAddress: (name) => claimSubdomain(getToken() ?? '', name),
				forceRuntimeUpgrade,
			});
			const res = await target.publish(bundle, (p) => setLog((prev) => appendStep(prev, p)));
			setResult(res);
			setPhase('success');
		} catch (err) {
			if (err instanceof PublishConflictError) setConflict(err);
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
		if (build === 'building') {
			return (
				<Modal title="Almost there…" onClose={onClose} footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
					<div className="publish-success">
						<h3>Building your site…</h3>
						<span className="live-url">{result.url}</span>
						<p className="modal-note">This usually takes about a minute — the link goes live the moment it’s done.</p>
					</div>
				</Modal>
			);
		}
		return (
			<Modal title="Published" onClose={onClose} footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
				<div className="publish-success">
					<h3>{build === 'failed' ? 'The update was saved, but its build failed' : 'Your site is live.'}</h3>
					<a className="live-url" href={result.url} target="_blank" rel="noopener noreferrer">
						{result.url}
					</a>
					{build === 'timeout' && (
						<p className="modal-note">It can take a minute for a brand-new site to finish building. Refresh if it isn’t up yet.</p>
					)}
					{result.url?.includes(`.${SITES_ROOT_DOMAIN}`) && build !== 'failed' && (
						<p className="modal-note">
							A brand-new address can take a few minutes to finish its security (HTTPS) setup — if your browser shows a
							privacy warning, give it a moment and refresh.
						</p>
					)}
					{build === 'failed' && result.repoUrl && (
						<p className="modal-note">
							Your previous successful deployment remains the rollback point in Git history. Check the{' '}
							<a href={`${result.repoUrl}/actions`} target="_blank" rel="noopener noreferrer">
								build log
							</a>{' '}
							to see what happened.
						</p>
					)}
					<div className="success-actions">
						<a className="btn-primary" href={result.url} target="_blank" rel="noopener noreferrer">
							Open website ↗
						</a>
						<button type="button" className="btn-secondary" onClick={copyUrl}>
							{copied ? 'Copied' : 'Copy address'}
						</button>
						<button type="button" className="btn-ghost" onClick={() => setShowDomain(true)}>
							Custom domain…
						</button>
						{result.repoUrl && (
							<a className="btn-ghost" href={result.repoUrl} target="_blank" rel="noopener noreferrer">
								View on GitHub ↗
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
		const canReplaceRuntime = conflict?.kind === 'managed-file-change';
		return (
			<Modal
				title="Publishing failed"
				onClose={onClose}
				footer={
					<>
						<button type="button" className="btn-ghost" onClick={onClose}>
							Close
						</button>
						{canReplaceRuntime ? (
							<button type="button" className="btn-primary" onClick={() => void runPublish(true)}>
								Replace system files and publish
							</button>
						) : (
							<button type="button" className="btn-primary" onClick={() => setPhase('configure')}>
								Try again
							</button>
						)}
					</>
				}
			>
				<p className="publish-error">{error}</p>
				{conflict?.paths.length ? (
					<ul className="issues">
						{conflict.paths.map((path) => <li key={path}><code>{path}</code></li>)}
					</ul>
				) : null}
				{canReplaceRuntime && (
					<p className="modal-note">Replacing these files keeps the previous versions in Git history, but discards their current custom code.</p>
				)}
			</Modal>
		);
	}

	// ---- Configure screen ----
	return (
		<Modal
			title="Publish"
			onClose={onClose}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={() => void runPublish()} disabled={!nameIsValid || nameState === 'taken'}>
						{firstPublish ? 'Publish' : 'Publish update'}
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
								setRepoName(sanitizeSiteNameInput(e.target.value));
								setNameState('idle');
							}}
							onBlur={checkName}
							placeholder="my-portfolio"
						/>
						<span className="field-hint">
							{nameProblem ?? (
								<>
									{nameState === 'checking' && 'Checking availability…'}
									{nameState === 'available' && 'Available.'}
									{nameState === 'recoverable' && 'Ready to finish the repository GitHub already created.'}
									{nameState === 'taken' && 'That name is taken — pick another.'}
									{nameState === 'idle' && 'Letters, numbers and dashes. This becomes your web address.'}
								</>
							)}
						</span>
					</label>
					<p className="url-preview">
						Your site will be at <strong>{targetUrl}</strong>
					</p>
				</>
			) : (
				<>
					<p className="url-preview">
						Updating your existing site at <strong>{saved?.pagesUrl || pagesUrl(user.login, repoName)}</strong>.
					</p>
					<button type="button" className="btn-link" onClick={() => setShowDomain(true)}>
						{saved?.customDomain && !saved.customDomain.endsWith(`.${SITES_ROOT_DOMAIN}`)
							? `Custom domain: ${saved.customDomain}`
							: 'Use a custom domain…'}
					</button>
				</>
			)}
		</Modal>
	);
}
