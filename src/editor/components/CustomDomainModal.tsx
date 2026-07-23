// Connect a custom domain to the published site — Cloudflare-for-SaaS edition. The
// Worker registers the hostname (Cloudflare issues + renews the certificate) and this
// modal shows the exact DNS records to add at the registrar: one CNAME that routes the
// domain here, plus the TXT records that prove ownership and pass certificate checks.
// D1's hostnames table is the source of truth; the local SiteInfo only mirrors it.
import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountClient, AccountError } from '../lib/account/client';
import { getSession } from '../lib/account/session';
import { loadSiteInfo, saveSiteInfo } from '../lib/account/site-store';
import { SITES_ROOT_DOMAIN } from '../lib/github/subdomain';

/** "https://www.Example.com/x." → "www.example.com". */
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

interface DnsRecord {
	purpose: 'routing' | 'ownership' | 'certificate';
	type: string;
	name: string;
	value: string;
}

interface HostnameView {
	domain: string;
	status: string;
	sslStatus?: string;
	records: DnsRecord[];
}

type Busy = 'none' | 'loading' | 'saving' | 'removing' | 'checking';

const PURPOSE_LABEL: Record<DnsRecord['purpose'], string> = {
	routing: 'Points your domain at your site',
	ownership: 'Proves the domain is yours',
	certificate: 'Enables HTTPS (the padlock)',
};

export default function CustomDomainModal({ onClose }: { onClose: () => void }) {
	const [info, setInfo] = useState(() => loadSiteInfo());
	const [busy, setBusy] = useState<Busy>(info?.customDomain ? 'loading' : 'none');
	const [view, setView] = useState<HostnameView | null>(null);
	const [input, setInput] = useState('');
	const [error, setError] = useState<string | null>(null);

	const client = () => new AccountClient(getSession()?.token ?? null);

	// A saved custom domain? Load its live status (and the records, for re-display).
	useEffect(() => {
		const domain = info?.customDomain;
		if (!domain) return;
		let alive = true;
		client()
			.request<HostnameView>('/site/custom-hostname/status', { body: { domain } })
			.then(({ data }) => {
				if (!alive) return;
				setView(data);
				setBusy('none');
			})
			.catch(() => {
				if (!alive) return;
				setBusy('none'); // records unavailable right now — the domain itself stands
			});
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!info) {
		return (
			<Modal title="Custom domain" onClose={onClose}>
				<p className="modal-note">Publish your website first — then you can connect a custom domain to it.</p>
			</Modal>
		);
	}

	const connected = view?.status === 'active' && (view.sslStatus === 'active' || !view.sslStatus);

	const save = async () => {
		const domain = normalizeDomain(input);
		if (!isValidDomain(domain)) {
			setError('That doesn’t look like a domain. Enter it like example.com or www.example.com.');
			return;
		}
		if (domain === SITES_ROOT_DOMAIN || domain.endsWith(`.${SITES_ROOT_DOMAIN}`)) {
			setError(`${SITES_ROOT_DOMAIN} addresses are assigned automatically when you publish — enter a domain you own.`);
			return;
		}
		setError(null);
		setBusy('saving');
		try {
			const { data } = await client().request<HostnameView>('/site/custom-hostname', { body: { domain } });
			setView(data);
			const latest = loadSiteInfo() ?? info;
			saveSiteInfo({ ...latest, customDomain: domain });
			setInfo({ ...latest, customDomain: domain });
		} catch (err) {
			setError(err instanceof AccountError ? err.friendly : 'Couldn’t set the domain.');
		}
		setBusy('none');
	};

	const check = async () => {
		if (!info.customDomain) return;
		setBusy('checking');
		try {
			const { data } = await client().request<HostnameView>('/site/custom-hostname/status', {
				body: { domain: info.customDomain },
			});
			setView(data);
		} catch {
			/* transient — keep showing what we have */
		}
		setBusy('none');
	};

	const remove = async () => {
		if (!info.customDomain) return;
		if (!confirm(`Disconnect ${info.customDomain}? Your site stays live at https://${info.subdomain}.${SITES_ROOT_DOMAIN}`)) return;
		setError(null);
		setBusy('removing');
		try {
			await client().request('/site/custom-hostname/remove', { body: { domain: info.customDomain } });
			const latest = loadSiteInfo() ?? info;
			saveSiteInfo({ ...latest, customDomain: undefined });
			setInfo({ ...latest, customDomain: undefined });
			setView(null);
			setInput('');
		} catch (err) {
			setError(err instanceof AccountError ? err.friendly : 'Couldn’t remove the domain.');
		}
		setBusy('none');
	};

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
			) : !info.customDomain ? (
				<>
					<p className="modal-lead">
						Point a domain you own at your site — like <strong>www.yourname.com</strong> instead of{' '}
						<strong>
							{info.subdomain}.{SITES_ROOT_DOMAIN}
						</strong>
						.
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
						Your site is set to <strong>https://{info.customDomain}</strong>.
						{connected
							? ' The domain is connected and HTTPS is on.'
							: ' One thing left: add these DNS records at your domain registrar (where you bought the domain).'}
					</p>
					{!connected && view?.records?.length ? (
						<div className="dns-records">
							{view.records.map((record) => (
								<p className="modal-note" key={`${record.type}:${record.name}`}>
									<strong>{record.type} record</strong> — {PURPOSE_LABEL[record.purpose]}:<br />
									name/host <code>{record.name}</code> → <code>{record.value}</code>
								</p>
							))}
						</div>
					) : null}
					{!connected && (
						<p className="modal-note">
							DNS changes usually take a few minutes, sometimes up to an hour. HTTPS switches on automatically once the
							records are visible.
						</p>
					)}
					{error && <p className="publish-error">{error}</p>}
					<div className="success-actions">
						<button type="button" className="btn-secondary" onClick={check} disabled={busy !== 'none'}>
							{busy === 'checking' ? 'Checking…' : connected ? 'Re-check' : 'Check connection'}
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
