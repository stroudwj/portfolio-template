// Pulls the user's live portfolio back into the editor. Resolves which repo is theirs
// (the saved one, or discovered from the template), downloads content + images, then
// opens the document. All GitHub specifics live behind loadPublishedPortfolio — this
// component only shows progress and, on success, hands the finished doc to the editor.
import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui/Modal';
import type { EditorDoc } from '../lib/types';
import type { PublishProgress } from '../lib/exporter';
import { GitHubClient, GitHubError } from '../lib/github/client';
import { getToken } from '../lib/github/session';
import { loadPublishedPortfolio } from '../lib/github/load';
import { loadRepoInfo, saveRepoInfo } from '../lib/github/store';
import { pagesUrl, type RepoRef } from '../lib/github/repo';

type Phase = 'loading' | 'error';

export default function LoadPublishedModal({
	onClose,
	onLoaded,
}: {
	onClose: () => void;
	onLoaded: (doc: EditorDoc) => void;
}) {
	const [phase, setPhase] = useState<Phase>('loading');
	const [log, setLog] = useState<PublishProgress[]>([]);
	const [error, setError] = useState<string | null>(null);
	const started = useRef(false);

	const run = async () => {
		setPhase('loading');
		setLog([]);
		setError(null);
		const token = getToken();
		if (!token) {
			setError('Please connect GitHub first, then try again.');
			setPhase('error');
			return;
		}
		try {
			const client = new GitHubClient(token);
			const saved = loadRepoInfo();
			const savedRef: RepoRef | null = saved ? { owner: saved.owner, repo: saved.repo, branch: saved.branch } : null;
			const { doc, ref, managedPaths } = await loadPublishedPortfolio(client, savedRef, (p) =>
				setLog((prev) => appendStep(prev, p)),
			);
			// Remember this repo so the next Publish UPDATES it instead of creating a new one
			// (crucial when the repo was discovered on a fresh browser with no saved info).
			saveRepoInfo({
				owner: ref.owner,
				repo: ref.repo,
				branch: ref.branch,
				pagesUrl: saved?.pagesUrl ?? pagesUrl(ref.owner, ref.repo),
				lastManifest: managedPaths,
			});
			onLoaded(doc);
		} catch (err) {
			setError(err instanceof GitHubError ? err.friendly : err instanceof Error ? err.message : 'Could not load your site.');
			setPhase('error');
		}
	};

	// Kick off exactly once on mount (guard against StrictMode double-invoke).
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void run();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (phase === 'error') {
		return (
			<Modal
				title="Couldn’t open your site"
				onClose={onClose}
				footer={
					<>
						<button type="button" className="btn-ghost" onClick={onClose}>
							Close
						</button>
						<button
							type="button"
							className="btn-primary"
							onClick={() => {
								started.current = true;
								void run();
							}}
						>
							Try again
						</button>
					</>
				}
			>
				<p className="publish-error">{error}</p>
			</Modal>
		);
	}

	return (
		<Modal title="Opening your published site…" onClose={onClose} dismissable={false}>
			<ul className="progress-list">
				{log.map((p, i) => {
					const last = i === log.length - 1;
					return (
						<li key={p.step} className={last ? 'active' : 'done'}>
							<span className="progress-mark">{last ? '◐' : '✓'}</span>
							<span>
								{p.step}
								{p.detail ? <span className="progress-detail"> {p.detail}</span> : null}
							</span>
						</li>
					);
				})}
			</ul>
		</Modal>
	);
}

/** Append a new step, or update the detail of the current one, for the checklist. */
function appendStep(log: PublishProgress[], p: PublishProgress): PublishProgress[] {
	if (log.length && log[log.length - 1].step === p.step) {
		const next = log.slice();
		next[next.length - 1] = p;
		return next;
	}
	return [...log, p];
}
