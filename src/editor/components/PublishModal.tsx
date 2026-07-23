// Drives a publish end to end: pick a web address (first time only), watch progress,
// then see the live URL. All hosting specifics live behind CloudflareTarget — this
// component only builds the bundle, calls target.publish(bundle, onProgress), and
// renders the result. Publishes are live the moment they finish (no remote build).
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { useEditor } from '../store';
import { buildBundle, type PublishProgress, type PublishResult } from '../lib/exporter';
import { collectIssues } from '../lib/validation';
import { AccountClient, AccountError } from '../lib/account/client';
import { getSession } from '../lib/account/session';
import { CloudflareTarget } from '../lib/account/target';
import { localSiteStore, loadSiteInfo } from '../lib/account/site-store';
import type { AccountSession } from './useAccount';
import {
	isValidSiteName,
	sanitizeSiteNameInput,
	slugifySiteName,
	subdomainFor,
	SITES_ROOT_DOMAIN,
} from '../lib/github/subdomain';
import { ProgressList, appendStep } from './ui/ProgressList';
import CustomDomainModal from './CustomDomainModal';

type Phase = 'configure' | 'publishing' | 'success' | 'error';

export default function PublishModal({ account, onClose }: { account: AccountSession; onClose: () => void }) {
	const { doc } = useEditor();
	const [saved, setSaved] = useState(() => loadSiteInfo());
	// The account may know this browser's site even when localStorage doesn't (fresh
	// device): the saved pointer wins, the account summary fills in behind it.
	const knownSubdomain = saved?.subdomain ?? account.site?.subdomain ?? null;
	const firstPublish = !knownSubdomain;

	const [siteName, setSiteName] = useState(() => knownSubdomain ?? slugifySiteName(doc?.content.site.name || 'my-portfolio'));
	const [nameState, setNameState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
	const [phase, setPhase] = useState<Phase>('configure');
	const [log, setLog] = useState<PublishProgress[]>([]);
	const [result, setResult] = useState<PublishResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [showDomain, setShowDomain] = useState(false);

	// The domain modal edits the saved site info (customDomain) — re-read on close.
	const closeDomainModal = () => {
		setShowDomain(false);
		setSaved(loadSiteInfo());
	};

	if (!doc) return null;
	if (showDomain) return <CustomDomainModal onClose={closeDomainModal} />;
	const issues = collectIssues(doc);
	const nameIsValid = !firstPublish || isValidSiteName(siteName);
	const nameProblem = !siteName
		? 'Enter a website name before publishing.'
		: siteName.endsWith('-')
			? 'A website name cannot end with a dash.'
			: !nameIsValid
				? 'Use only letters, numbers and dashes.'
				: null;
	const targetUrl = `https://${subdomainFor(nameIsValid ? siteName : 'your-name')}`;
	const savedUrl = saved?.customDomain ? `https://${saved.customDomain}` : saved?.url ?? (knownSubdomain ? `https://${subdomainFor(knownSubdomain)}` : '');

	const client = () => new AccountClient(getSession()?.token ?? null);

	const checkName = async () => {
		if (!firstPublish || !isValidSiteName(siteName)) return;
		setNameState('checking');
		try {
			const { status } = await client().request('/site/subdomain/check', {
				body: { name: siteName.trim() },
				allow: [409],
			});
			setNameState(status === 409 ? 'taken' : 'available');
		} catch {
			setNameState('idle'); // service unreachable — don't block, publish re-checks
		}
	};

	const runPublish = async () => {
		if (firstPublish && (!isValidSiteName(siteName) || nameState === 'taken')) return;
		setPhase('publishing');
		setLog([]);
		setError(null);
		try {
			const bundle = await buildBundle(doc);
			const target = new CloudflareTarget({
				client: client(),
				store: localSiteStore,
				desiredSubdomain: siteName.trim(),
				editorBase: import.meta.env.BASE_URL,
			});
			const res = await target.publish(bundle, (p) => setLog((prev) => appendStep(prev, p)));
			setResult(res);
			setSaved(loadSiteInfo());
			setPhase('success');
			void account.refresh(); // the summary now knows the site/subdomain
		} catch (err) {
			if (err instanceof AccountError && err.code === 'name_taken') setNameState('taken');
			setError(err instanceof AccountError ? err.friendly : err instanceof Error ? err.message : 'Publishing failed.');
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
					<h3>Your site is live.</h3>
					<a className="live-url" href={result.url} target="_blank" rel="noopener noreferrer">
						{result.url}
					</a>
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
							value={siteName}
							onChange={(e) => {
								setSiteName(sanitizeSiteNameInput(e.target.value));
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
						Updating your existing site at <strong>{savedUrl}</strong>.
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
