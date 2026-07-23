// Rename an already-published site — Cloudflare edition. A site's address is just a
// routing row (subdomain → siteId), so a rename is one claim call: the Worker updates
// sites.subdomain, swaps the hostnames row, and re-mirrors KV. The old address stops
// resolving immediately; stored files never move (the R2 prefix is the stable siteId).
// A domain the user owns is untouched — it isn't derived from the site name at all.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountClient, AccountError } from '../lib/account/client';
import { getSession } from '../lib/account/session';
import { loadSiteInfo, saveSiteInfo } from '../lib/account/site-store';
import { isValidSiteName, sanitizeSiteNameInput, subdomainFor } from '../lib/github/subdomain';

type NameState = 'idle' | 'checking' | 'available' | 'taken';
type Phase = 'idle' | 'renaming' | 'done' | 'error';

export default function RenameSiteModal({ onClose }: { onClose: () => void }) {
	const info = loadSiteInfo();
	const [input, setInput] = useState(() => info?.subdomain ?? '');
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
	const unchanged = slug === info.subdomain;

	const client = () => new AccountClient(getSession()?.token ?? null);

	const checkName = async () => {
		if (!nameIsValid || unchanged) return;
		setNameState('checking');
		try {
			const { status } = await client().request('/site/subdomain/check', { body: { name: slug }, allow: [409] });
			setNameState(status === 409 ? 'taken' : 'available');
		} catch {
			setNameState('idle');
		}
	};

	const rename = async () => {
		if (!nameIsValid || unchanged || nameState === 'taken') return;
		setPhase('renaming');
		setError(null);
		try {
			const { data } = await client().request<{ domain: string }>('/site/subdomain/claim', { body: { name: slug } });
			const url = `https://${data.domain}`;
			saveSiteInfo({ ...info, subdomain: slug, url });
			setNewUrl(url);
			setPhase('done');
		} catch (err) {
			if (err instanceof AccountError && err.code === 'name_taken') setNameState('taken');
			setError(err instanceof AccountError ? err.friendly : 'Couldn’t rename the site.');
			setPhase('error');
		}
	};

	if (phase === 'done' && newUrl) {
		return (
			<Modal title="Renamed" onClose={onClose} footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
				<div className="publish-success">
					<h3>Your site moved to its new address.</h3>
					<a className="live-url" href={newUrl} target="_blank" rel="noopener noreferrer">
						{newUrl}
					</a>
					<p className="modal-note">
						The old address stops working right away — update anywhere you shared it. Publish an update when
						convenient so the links inside your pages point at the new address too.
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
						onClick={() => void rename()}
						disabled={phase === 'renaming' || !nameIsValid || unchanged || nameState === 'taken'}
					>
						{phase === 'renaming' ? 'Renaming…' : 'Rename'}
					</button>
				</>
			}
		>
			<p className="modal-lead">
				Your site is at <strong>{info.subdomain ? subdomainFor(info.subdomain) : ''}</strong>. Pick its new name:
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
				/>
				<span className="field-hint">
					{nameProblem ?? (
						<>
							{unchanged && 'This is the current name.'}
							{!unchanged && nameState === 'checking' && 'Checking availability…'}
							{!unchanged && nameState === 'available' && `Available — your site will move to ${subdomainFor(slug)}.`}
							{!unchanged && nameState === 'taken' && 'That name is taken — pick another.'}
							{!unchanged && nameState === 'idle' && 'Letters, numbers and dashes.'}
						</>
					)}
				</span>
			</label>
			{info.customDomain && (
				<p className="modal-note">Your custom domain ({info.customDomain}) is not affected by a rename.</p>
			)}
			{error && <p className="publish-error">{error}</p>}
		</Modal>
	);
}
