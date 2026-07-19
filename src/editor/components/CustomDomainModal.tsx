// Connect a custom domain to the published site without ever opening GitHub: we set the
// domain in the repo's Pages settings via the API, rewrite astro.config's site/base and
// commit it (so links/assets resolve at the domain), and show the exact DNS records to
// add at the registrar — the one step GitHub can't do for us. The repo's Pages cname is
// the source of truth; publishes read it back, so the domain survives every re-publish.
import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { GitHubClient, GitHubError } from '../lib/github/client';
import { getToken } from '../lib/github/session';
import { loadRepoInfo, saveRepoInfo } from '../lib/github/store';
import { ASTRO_CONFIG_PATH } from '../lib/github/config';
import { commitFiles } from '../lib/github/gitdata';
import {
	getPagesInfo,
	setCustomDomain,
	removeCustomDomain,
	getDomainHealth,
	enforceHttps,
	readAstroConfig,
	rewriteSiteAndBase,
	getBuildStatus,
	pagesUrl,
	type DomainHealth,
	type RepoRef,
} from '../lib/github/repo';

/** "https://www.Example.com/x." → "www.example.com" (what Pages stores as the cname). */
export function normalizeDomain(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
		.replace(/\/.*$/, '')
		.replace(/\.+$/, '');
}

/** Plain hostname with at least one dot; each label ≤63 chars, no leading/trailing '-'. */
export function isValidDomain(domain: string): boolean {
	return (
		domain.length <= 253 &&
		domain.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
		domain.includes('.')
	);
}

type Busy = 'none' | 'loading' | 'saving' | 'removing' | 'checking';
type Rebuild = 'idle' | 'building' | 'done' | 'failed';

export default function CustomDomainModal({ onClose }: { onClose: () => void }) {
	const info = loadRepoInfo();
	const [busy, setBusy] = useState<Busy>('loading');
	const [cname, setCname] = useState<string | null>(null);
	const [input, setInput] = useState('');
	const [health, setHealth] = useState<DomainHealth | null>(null);
	const [rebuild, setRebuild] = useState<Rebuild>('idle');
	const [error, setError] = useState<string | null>(null);

	const client = new GitHubClient(getToken() ?? '');
	const ref: RepoRef | null = info ? { owner: info.owner, repo: info.repo, branch: info.branch } : null;

	useEffect(() => {
		if (!ref) return;
		let alive = true;
		getPagesInfo(client, ref)
			.then((pages) => {
				if (!alive) return;
				setCname(pages?.cname ?? null);
				setBusy('none');
			})
			.catch((err) => {
				if (!alive) return;
				setError(err instanceof GitHubError ? err.friendly : 'Couldn’t read your site’s settings.');
				setBusy('none');
			});
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!info || !ref) {
		return (
			<Modal title="Custom domain" onClose={onClose}>
				<p className="modal-note">Publish your website first — then you can connect a custom domain to it.</p>
			</Modal>
		);
	}

	// Rewrite astro.config for `domain` (or back to the github.io URL when null) and wait
	// for the Pages rebuild, so the site's links/assets actually resolve at the new address.
	// Skipped when the config already matches (e.g. re-applying the same domain).
	const applyConfig = async (domain: string | null) => {
		const current = await readAstroConfig(client, ref);
		const desired = domain
			? rewriteSiteAndBase(current, `https://${domain}`, '/')
			: rewriteSiteAndBase(current, `https://${ref.owner}.github.io`, `/${ref.repo}`);
		if (desired === current) return;
		setRebuild('building');
		const sha = await commitFiles(client, {
			owner: ref.owner,
			repo: ref.repo,
			branch: ref.branch,
			message: domain ? `Use custom domain ${domain}` : 'Use the github.io address',
			files: [{ path: ASTRO_CONFIG_PATH, text: desired }],
		});
		const started = Date.now();
		while (Date.now() - started < 3 * 60_000) {
			await new Promise((r) => setTimeout(r, 5000));
			let status;
			try {
				status = await getBuildStatus(client, ref.owner, ref.repo, sha);
			} catch {
				break; // can't tell — the build finishes on its own
			}
			if (status === 'success') {
				setRebuild('done');
				return;
			}
			if (status === 'failure') {
				setRebuild('failed');
				return;
			}
		}
		setRebuild('done'); // polling gave out; the build almost certainly finishes on its own
	};

	const save = async () => {
		const domain = normalizeDomain(input);
		if (!isValidDomain(domain)) {
			setError('That doesn’t look like a domain. Enter it like example.com or www.example.com.');
			return;
		}
		setError(null);
		setHealth(null);
		setBusy('saving');
		try {
			await setCustomDomain(client, ref, domain);
			saveRepoInfo({ ...info, customDomain: domain, pagesUrl: `https://${domain}/` });
			setCname(domain);
			await applyConfig(domain);
		} catch (err) {
			setError(err instanceof GitHubError ? err.friendly : 'Couldn’t set the domain.');
		}
		setBusy('none');
	};

	const remove = async () => {
		if (!confirm(`Disconnect ${cname}? Your site will go back to ${pagesUrl(ref.owner, ref.repo)}`)) return;
		setError(null);
		setHealth(null);
		setBusy('removing');
		try {
			await removeCustomDomain(client, ref);
			saveRepoInfo({ ...info, customDomain: undefined, pagesUrl: pagesUrl(ref.owner, ref.repo) });
			setCname(null);
			setInput('');
			await applyConfig(null);
		} catch (err) {
			setError(err instanceof GitHubError ? err.friendly : 'Couldn’t remove the domain.');
		}
		setBusy('none');
	};

	const checkDns = async () => {
		setBusy('checking');
		const result = await getDomainHealth(client, ref);
		setHealth(result);
		if (result === 'live') void enforceHttps(client, ref).catch(() => {});
		setBusy('none');
	};

	// Apex domains (example.com) need A records; subdomains (www.example.com) use a CNAME.
	const isApex = cname != null && cname.split('.').length === 2;

	return (
		<Modal
			title="Custom domain"
			onClose={onClose}
			footer={
				<button type="button" className="btn-primary" onClick={onClose} disabled={busy === 'saving' || busy === 'removing'}>
					Done
				</button>
			}
		>
			{busy === 'loading' ? (
				<p className="modal-note">Checking your domain settings…</p>
			) : cname === null ? (
				<>
					<p className="modal-lead">
						Point a domain you own at your site — like <strong>www.yourname.com</strong> instead of{' '}
						<strong>{pagesUrl(ref.owner, ref.repo).replace('https://', '')}</strong>.
					</p>
					<label className="field">
						<span className="field-label">Your domain</span>
						<input
							className="text-input"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="www.example.com"
							disabled={busy === 'saving'}
						/>
						<span className="field-hint">You need to own this domain already (from Namecheap, GoDaddy, Cloudflare…).</span>
					</label>
					{error && <p className="publish-error">{error}</p>}
					<div className="success-actions">
						<button type="button" className="btn-primary" onClick={save} disabled={busy === 'saving' || !input.trim()}>
							{busy === 'saving' ? 'Connecting…' : 'Connect domain'}
						</button>
					</div>
				</>
			) : (
				<>
					<p className="modal-lead">
						Your site is set to <strong>https://{cname}</strong>. One thing left: add this DNS record at your domain
						registrar (where you bought the domain).
					</p>
					{isApex ? (
						<div className="dns-records">
							<p className="modal-note">
								Add these four <strong>A records</strong> for <code>{cname}</code> (host/name: <code>@</code>):
							</p>
							<code>185.199.108.153</code> <code>185.199.109.153</code> <code>185.199.110.153</code>{' '}
							<code>185.199.111.153</code>
							<p className="modal-note">
								Tip: also add <code>www</code> as a CNAME pointing to <code>{ref.owner}.github.io</code> so
								www.{cname} works too.
							</p>
						</div>
					) : (
						<div className="dns-records">
							<p className="modal-note">
								Add a <strong>CNAME record</strong> — host/name <code>{cname.split('.')[0]}</code>, pointing to:
							</p>
							<code>{ref.owner}.github.io</code>
						</div>
					)}
					<p className="modal-note">
						DNS changes usually take a few minutes, sometimes up to an hour. GitHub turns on HTTPS automatically once
						it can see your records.
					</p>
					{rebuild === 'building' && <p className="modal-note">Rebuilding your site for the new address…</p>}
					{rebuild === 'failed' && (
						<p className="publish-error">
							The site rebuild reported an error — check the{' '}
							<a href={`https://github.com/${ref.owner}/${ref.repo}/actions`} target="_blank" rel="noopener noreferrer">
								build log
							</a>{' '}
							to see what happened.
						</p>
					)}
					{health === 'live' && <p className="modal-note">DNS looks good — your domain is connected.</p>}
					{health === 'pending' && (
						<p className="modal-note">DNS isn’t pointing at GitHub yet — records can take up to an hour to propagate.</p>
					)}
					{health === 'unknown' && (
						<p className="modal-note">
							We couldn’t verify automatically. Your site will work once the DNS records above are in place.
						</p>
					)}
					{error && <p className="publish-error">{error}</p>}
					<div className="success-actions">
						<button type="button" className="btn-secondary" onClick={checkDns} disabled={busy !== 'none'}>
							{busy === 'checking' ? 'Checking…' : 'Check DNS'}
						</button>
						<button type="button" className="btn-ghost" onClick={remove} disabled={busy !== 'none'}>
							{busy === 'removing' ? 'Disconnecting…' : 'Disconnect domain'}
						</button>
					</div>
				</>
			)}
		</Modal>
	);
}
