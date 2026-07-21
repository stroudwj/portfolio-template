// Rename an already-published site: renames the GitHub repo itself (GitHub keeps
// Pages/custom-domain settings and redirects the old name for a while), then fixes
// up whatever the new name changes:
//   - No custom domain set  -> the site's URL is {owner}.github.io/{repo}, so astro.config's
//     `base` must be rewritten to the new repo name and re-committed, or every asset 404s.
//   - A hangwork.art address -> best-effort re-claimed under the new name (a failed claim
//     just leaves the old address working, same "soft failure" as everywhere else this
//     service is called).
//   - A domain the user owns -> untouched; it isn't derived from the repo name at all.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { GitHubClient, GitHubError } from '../lib/github/client';
import { getToken } from '../lib/github/session';
import { loadRepoInfo, saveRepoInfo, type RepoInfo } from '../lib/github/store';
import { TEMPLATE_REPO } from '../lib/github/config';
import { commitProjectLocation } from '../lib/github/runtime';
import { renameRepo, isRepoNameAvailable, setCustomDomain, pagesUrl, type RepoRef } from '../lib/github/repo';
import {
	checkSubdomain,
	claimSubdomain,
	isValidSiteName,
	sanitizeSiteNameInput,
	subdomainFor,
	SITES_ROOT_DOMAIN,
} from '../lib/github/subdomain';

type NameState = 'idle' | 'checking' | 'available' | 'taken' | 'same';
type Phase = 'idle' | 'renaming' | 'done' | 'error';

export default function RenameSiteModal({ onClose }: { onClose: () => void }) {
	const info = loadRepoInfo();
	const [input, setInput] = useState(() => info?.repo ?? '');
	const [nameState, setNameState] = useState<NameState>('idle');
	const [phase, setPhase] = useState<Phase>('idle');
	const [error, setError] = useState<string | null>(null);
	const [newUrl, setNewUrl] = useState<string | null>(null);

	if (!info) {
		return (
			<Modal title="Rename site" onClose={onClose}>
				<p className="modal-note">Publish your website first — then you can rename it.</p>
			</Modal>
		);
	}

	const slug = input;
	const nameIsValid = isValidSiteName(slug);
	const nameProblem = !slug
		? 'Enter a website name.'
		: slug.endsWith('-')
			? 'A website name cannot end with a dash.'
			: !nameIsValid
				? 'Use only letters, numbers and dashes.'
				: null;
	const unchanged = slug === info.repo;
	const isIncluded = info.customDomain?.endsWith(`.${SITES_ROOT_DOMAIN}`) ?? false;
	const hasOwnDomain = Boolean(info.customDomain) && !isIncluded;

	const checkName = async () => {
		if (!nameIsValid) return;
		if (unchanged) {
			setNameState('same');
			return;
		}
		setNameState('checking');
		try {
			const token = getToken() ?? '';
			const [repoFree, sub] = await Promise.all([
				isRepoNameAvailable(new GitHubClient(token), info.owner, slug),
				isIncluded ? checkSubdomain(token, slug) : Promise.resolve<'available' | 'taken' | 'unknown'>('available'),
			]);
			setNameState(repoFree && sub !== 'taken' ? 'available' : 'taken');
		} catch {
			setNameState('idle');
		}
	};

	const rename = async () => {
		if (!nameIsValid || unchanged || nameState === 'taken') return;
		if (slug === info.repo || (info.owner === TEMPLATE_REPO.owner && slug === TEMPLATE_REPO.repo)) {
			setError('That name isn’t available — pick another.');
			return;
		}
		setPhase('renaming');
		setError(null);
		try {
			const token = getToken() ?? '';
			const client = new GitHubClient(token);
			const oldRef: RepoRef = { owner: info.owner, repo: info.repo, branch: info.branch };
			const renamed = await renameRepo(client, oldRef, slug);

			const patch: Partial<RepoInfo> = { repo: slug };

			if (hasOwnDomain) {
				// The domain doesn't reference the repo name — nothing else to fix.
				setNewUrl(info.pagesUrl ?? `https://${info.customDomain}/`);
			} else if (isIncluded) {
				let claimed = await claimSubdomain(token, slug).catch(() => null);
				if (claimed) {
					try {
						await setCustomDomain(client, renamed, claimed);
					} catch {
						claimed = null;
					}
				}
				if (claimed) {
					const location = await commitProjectLocation(
						client,
						renamed,
						{ siteUrl: `https://${claimed}`, basePath: '/' },
						`Use ${claimed}`,
					);
					patch.customDomain = claimed;
					patch.pagesUrl = `https://${claimed}/`;
					patch.lastCommitSha = location.commitSha;
					setNewUrl(patch.pagesUrl);
				} else {
					// Keep the old hangwork.art address — it still serves this repo fine,
					// it just won't match the new name.
					setNewUrl(info.pagesUrl ?? `https://${subdomainFor(info.repo)}/`);
				}
			} else {
				// Bare github.io URL: base must move from /{old} to /{new} or every asset 404s.
				const location = await commitProjectLocation(
					client,
					renamed,
					{ siteUrl: `https://${renamed.owner}.github.io`, basePath: `/${slug}` },
					'Rename site',
				);
				patch.lastCommitSha = location.commitSha;
				patch.pagesUrl = pagesUrl(renamed.owner, slug);
				setNewUrl(patch.pagesUrl);
			}

			saveRepoInfo({ ...info, ...patch });
			setPhase('done');
		} catch (err) {
			setError(err instanceof GitHubError ? err.friendly : err instanceof Error ? err.message : 'Renaming failed.');
			setPhase('error');
		}
	};

	if (phase === 'done') {
		return (
			<Modal title="Renamed" onClose={onClose} footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
				<div className="publish-success">
					<h3>Your site is now at</h3>
					<a className="live-url" href={newUrl ?? undefined} target="_blank" rel="noopener noreferrer">
						{newUrl}
					</a>
					<p className="modal-note">
						It can take a minute for the new address to finish rebuilding. Old links to{' '}
						{isIncluded || hasOwnDomain ? 'the previous address' : `${info.owner}.github.io/${info.repo}`} will stop working.
					</p>
				</div>
			</Modal>
		);
	}

	return (
		<Modal
			title="Rename site"
			onClose={onClose}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={phase === 'renaming'}>
						Cancel
					</button>
					<button
						type="button"
						className="btn-primary"
						onClick={rename}
						disabled={phase === 'renaming' || !nameIsValid || unchanged || nameState === 'taken'}
					>
						{phase === 'renaming' ? 'Renaming…' : 'Rename'}
					</button>
				</>
			}
		>
			<p className="modal-lead">
				Changes your site's name{hasOwnDomain ? '' : ' and web address'}. This doesn't touch your content — only where it lives.
			</p>
			<label className="field">
				<span className="field-label">Website name</span>
				<input
					className="text-input"
					value={input}
					onChange={(e) => {
						setInput(sanitizeSiteNameInput(e.target.value));
						setNameState('idle');
					}}
					onBlur={checkName}
					placeholder="my-portfolio"
					disabled={phase === 'renaming'}
				/>
				<span className="field-hint">
					{nameProblem ?? (
						<>
							{nameState === 'checking' && 'Checking availability…'}
							{nameState === 'available' && 'Available.'}
							{nameState === 'taken' && 'That name is taken — pick another.'}
							{nameState === 'same' && 'That’s already your site’s name.'}
							{nameState === 'idle' && 'Letters, numbers and dashes.'}
						</>
					)}
				</span>
			</label>
			{!unchanged && nameIsValid && (
				<p className="url-preview">
					{hasOwnDomain
						? `Your custom domain (${info.customDomain}) stays the same.`
						: isIncluded
							? <>Your site will move to <strong>https://{subdomainFor(slug)}</strong>.</>
							: <>Your site will move to <strong>{pagesUrl(info.owner, slug)}</strong>.</>}
				</p>
			)}
			{error && <p className="publish-error">{error}</p>}
		</Modal>
	);
}
