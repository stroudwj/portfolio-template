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
import { pagesUrl, getPagesInfo, type RepoRef } from '../lib/github/repo';
import { ProgressList, appendStep } from './ui/ProgressList';

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
			setError('Connect your GitHub account first, then try again.');
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
			// The Pages cname is the source of truth for the site's address — a fresh browser
			// must recover the hangwork.art/custom domain, not fall back to github.io.
			const domain = (await getPagesInfo(client, ref).catch(() => null))?.cname ?? null;
			saveRepoInfo({
				owner: ref.owner,
				repo: ref.repo,
				branch: ref.branch,
				pagesUrl: domain ? `https://${domain}/` : (saved?.pagesUrl ?? pagesUrl(ref.owner, ref.repo)),
				customDomain: domain ?? undefined,
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
			<ProgressList log={log} />
		</Modal>
	);
}
