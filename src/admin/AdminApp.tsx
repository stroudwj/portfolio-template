import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { AccountClient, AccountError } from '../editor/lib/account/client';
import { clearSession, getSession } from '../editor/lib/account/session';
import './admin.css';

interface AdminActor {
	id: string;
	email: string;
}

interface AccountIdentity {
	id: string;
	email: string;
	googleConnected: boolean;
	createdAt: string;
}

interface AccountSiteSummary {
	id: string;
	subdomain: string | null;
	url: string | null;
	status: string;
	lastPublishedAt: string | null;
}

interface SearchResult {
	user: AccountIdentity;
	licensed: boolean;
	licenseCount: number;
	site: AccountSiteSummary | null;
}

interface LicenseDetail {
	id: string;
	key: string | null;
	orderId: string | null;
	buyerEmail: string | null;
	status: string;
	activatedAt: string | null;
	createdAt: string;
}

interface HostnameDetail {
	hostname: string;
	kind: string;
	createdAt: string;
}

interface AccountDetail {
	user: AccountIdentity;
	licensed: boolean;
	licenses: LicenseDetail[];
	site:
		| (AccountSiteSummary & {
				bytesUsed: number;
				requestsThisPeriod: number;
				createdAt: string;
				hostnames: HostnameDetail[];
		  })
		| null;
}

type AccessState = 'checking' | 'signed-out' | 'forbidden' | 'unconfigured' | 'ready' | 'error';

function dateTime(value: string | null | undefined): string {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}).format(date);
}

function bytes(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	const amount = value / 1024 ** exponent;
	return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}

function messageFor(error: unknown): string {
	return error instanceof AccountError ? error.friendly : 'Something went wrong. Please try again.';
}

function StatusBadge({ value }: { value: string }) {
	const normalized = value.toLowerCase().replace(/_/g, '-');
	return <span className={`admin-badge status-${normalized}`}>{value.replace(/_/g, ' ')}</span>;
}

export default function AdminApp({
	editorUrl,
	brandUrl,
}: {
	editorUrl: string;
	brandUrl: string;
}) {
	const [access, setAccess] = useState<AccessState>('checking');
	const [actor, setActor] = useState<AdminActor | null>(null);
	const [accessMessage, setAccessMessage] = useState('');
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [searched, setSearched] = useState(false);
	const [searchError, setSearchError] = useState('');
	const [detail, setDetail] = useState<AccountDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);

	const verifyAccess = useCallback(async () => {
		const stored = getSession();
		if (!stored) {
			setActor(null);
			setAccess('signed-out');
			setAccessMessage('');
			return;
		}
		setAccess('checking');
		setAccessMessage('');
		try {
			const { data } = await new AccountClient(stored.token).request<{ user: AdminActor }>('/admin/session');
			setActor(data.user);
			setAccess('ready');
		} catch (error) {
			if (error instanceof AccountError && error.status === 401) {
				clearSession();
				setActor(null);
				setAccess('signed-out');
			} else if (error instanceof AccountError && error.code === 'admin_forbidden') {
				setActor(stored.user);
				setAccess('forbidden');
			} else if (error instanceof AccountError && error.code === 'admin_unconfigured') {
				setActor(stored.user);
				setAccess('unconfigured');
			} else {
				setActor(stored.user);
				setAccess('error');
				setAccessMessage(messageFor(error));
			}
		}
	}, []);

	useEffect(() => {
		void verifyAccess();
	}, [verifyAccess]);

	const signOut = () => {
		clearSession();
		setActor(null);
		setResults([]);
		setDetail(null);
		setAccess('signed-out');
	};

	const search = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = query.trim();
		if (value.length < 2 || searching) return;
		const stored = getSession();
		if (!stored) {
			setAccess('signed-out');
			return;
		}
		setSearching(true);
		setSearchError('');
		setDetail(null);
		try {
			const { data } = await new AccountClient(stored.token).request<{ results: SearchResult[] }>(
				'/admin/accounts/search',
				{ body: { query: value } },
			);
			setResults(data.results);
			setSearched(true);
		} catch (error) {
			setSearchError(messageFor(error));
		} finally {
			setSearching(false);
		}
	};

	const openAccount = async (userId: string) => {
		const stored = getSession();
		if (!stored || detailLoading) return;
		setDetailLoading(true);
		setSearchError('');
		try {
			const { data } = await new AccountClient(stored.token).request<AccountDetail>('/admin/accounts/get', {
				body: { userId },
			});
			setDetail(data);
		} catch (error) {
			setSearchError(messageFor(error));
		} finally {
			setDetailLoading(false);
		}
	};

	if (access !== 'ready') {
		const title =
			access === 'checking'
				? 'Checking access'
				: access === 'signed-out'
					? 'Sign in to continue'
					: access === 'forbidden'
						? 'Access not granted'
						: access === 'unconfigured'
							? 'Console not configured'
							: 'Couldn’t check access';
		const description =
			access === 'checking'
				? 'Verifying your Hangwork account…'
				: access === 'signed-out'
					? 'The console uses your existing Hangwork account session. Open the editor in another tab, sign in, then check again here.'
					: access === 'forbidden'
						? `${actor?.email ?? 'This account'} is signed in, but it is not on the server-side operator allowlist.`
						: access === 'unconfigured'
							? 'Set ADMIN_EMAILS or ADMIN_GOOGLE_SUBS on the Hangwork API Worker before using this console.'
							: accessMessage;
		return (
			<main className="admin-access-shell">
				<section className="admin-access-card" aria-live="polite">
					<img src={brandUrl} alt="Hangwork" className="admin-logo" />
					<span className="admin-kicker">Operator console · Read only</span>
					<h1>{title}</h1>
					<p>{description}</p>
					{access !== 'checking' && (
						<div className="admin-actions">
							<a className="admin-button admin-button-primary" href={editorUrl} target="_blank" rel="noreferrer">
								Open editor sign-in ↗
							</a>
							<button className="admin-button" type="button" onClick={() => void verifyAccess()}>
								Check access again
							</button>
							{actor && (
								<button className="admin-text-button" type="button" onClick={signOut}>
									Sign out {actor.email}
								</button>
							)}
						</div>
					)}
				</section>
			</main>
		);
	}

	return (
		<div className="admin-shell">
			<header className="admin-topbar">
				<img src={brandUrl} alt="Hangwork" className="admin-logo" />
				<div>
					<span className="admin-kicker">Operator console</span>
					<h1>Accounts</h1>
				</div>
				<span className="admin-readonly">Read only</span>
				<div className="admin-actor">
					<span>{actor?.email}</span>
					<button type="button" onClick={signOut}>
						Sign out
					</button>
				</div>
			</header>

			<main className="admin-main">
				<section className="admin-search-panel" aria-labelledby="account-search-heading">
					<div>
						<h2 id="account-search-heading">Find an account</h2>
						<p>Search by email, account ID, subdomain, Lemon Squeezy order ID, or exact license key.</p>
					</div>
					<form className="admin-search-form" onSubmit={search}>
						<label htmlFor="admin-account-query">Account search</label>
						<div>
							<input
								id="admin-account-query"
								type="search"
								autoComplete="off"
								placeholder="artist@example.com or studio-name"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
							<button className="admin-button admin-button-primary" type="submit" disabled={query.trim().length < 2 || searching}>
								{searching ? 'Searching…' : 'Search'}
							</button>
						</div>
					</form>
					{searchError && <p className="admin-error">{searchError}</p>}
				</section>

				<div className="admin-workspace">
					<section className="admin-results" aria-labelledby="search-results-heading">
						<div className="admin-section-heading">
							<h2 id="search-results-heading">Results</h2>
							{searched && <span>{results.length} found</span>}
						</div>
						{!searched ? (
							<p className="admin-empty">Search for an account to begin.</p>
						) : results.length === 0 ? (
							<p className="admin-empty">No matching accounts.</p>
						) : (
							<div className="admin-table-wrap">
								<table>
									<thead>
										<tr>
											<th>Account</th>
											<th>License</th>
											<th>Site</th>
											<th>Last published</th>
										</tr>
									</thead>
									<tbody>
										{results.map((result) => (
											<tr key={result.user.id} className={detail?.user.id === result.user.id ? 'selected' : ''}>
												<td>
													<button
														type="button"
														className="admin-account-link"
														onClick={() => void openAccount(result.user.id)}
														disabled={detailLoading}
													>
														<strong>{result.user.email}</strong>
														<span>{result.user.id}</span>
													</button>
												</td>
												<td>
													<StatusBadge value={result.licensed ? 'active' : 'none'} />
													<small>{result.licenseCount} record{result.licenseCount === 1 ? '' : 's'}</small>
												</td>
												<td>
													{result.site ? (
														<>
															<strong>{result.site.subdomain || 'Unclaimed'}</strong>
															<StatusBadge value={result.site.status} />
														</>
													) : (
														<span className="admin-muted">No site</span>
													)}
												</td>
												<td>{dateTime(result.site?.lastPublishedAt)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>

					<section className="admin-detail" aria-labelledby="account-detail-heading">
						<div className="admin-section-heading">
							<h2 id="account-detail-heading">Account detail</h2>
							{detailLoading && <span>Loading…</span>}
						</div>
						{!detail ? (
							<p className="admin-empty">Select an account from the results.</p>
						) : (
							<div className="admin-detail-stack">
								<section className="admin-card">
									<div className="admin-card-heading">
										<div>
											<span className="admin-card-label">Account</span>
											<h3>{detail.user.email}</h3>
										</div>
										<StatusBadge value={detail.licensed ? 'licensed' : 'unlicensed'} />
									</div>
									<dl>
										<div>
											<dt>Account ID</dt>
											<dd>{detail.user.id}</dd>
										</div>
										<div>
											<dt>Google connected</dt>
											<dd>{detail.user.googleConnected ? 'Yes' : 'No'}</dd>
										</div>
										<div>
											<dt>Created</dt>
											<dd>{dateTime(detail.user.createdAt)}</dd>
										</div>
									</dl>
								</section>

								<section className="admin-card">
									<div className="admin-card-heading">
										<div>
											<span className="admin-card-label">Licenses</span>
											<h3>{detail.licenses.length} record{detail.licenses.length === 1 ? '' : 's'}</h3>
										</div>
									</div>
									{detail.licenses.length === 0 ? (
										<p className="admin-empty compact">No license records.</p>
									) : (
										<div className="admin-license-list">
											{detail.licenses.map((license) => (
												<article key={license.id} className="admin-license">
													<div>
														<strong>{license.key || 'Key pending'}</strong>
														<StatusBadge value={license.status} />
													</div>
													<dl>
														<div>
															<dt>Order</dt>
															<dd>{license.orderId || '—'}</dd>
														</div>
														<div>
															<dt>Buyer</dt>
															<dd>{license.buyerEmail || '—'}</dd>
														</div>
														<div>
															<dt>Activated</dt>
															<dd>{dateTime(license.activatedAt)}</dd>
														</div>
													</dl>
												</article>
											))}
										</div>
									)}
								</section>

								<section className="admin-card">
									<div className="admin-card-heading">
										<div>
											<span className="admin-card-label">Published site</span>
											<h3>{detail.site?.subdomain || 'No site'}</h3>
										</div>
										{detail.site && <StatusBadge value={detail.site.status} />}
									</div>
									{!detail.site ? (
										<p className="admin-empty compact">This account has not created a site.</p>
									) : (
										<>
											<dl>
												<div>
													<dt>Site ID</dt>
													<dd>{detail.site.id}</dd>
												</div>
												<div>
													<dt>Storage</dt>
													<dd>{bytes(detail.site.bytesUsed)}</dd>
												</div>
												<div>
													<dt>Requests this period</dt>
													<dd>{detail.site.requestsThisPeriod.toLocaleString()}</dd>
												</div>
												<div>
													<dt>Last published</dt>
													<dd>{dateTime(detail.site.lastPublishedAt)}</dd>
												</div>
											</dl>
											{detail.site.url && (
												<a className="admin-button admin-button-primary" href={detail.site.url} target="_blank" rel="noreferrer">
													Open published site ↗
												</a>
											)}
											{detail.site.hostnames.length > 0 && (
												<div className="admin-hostnames">
													<span className="admin-card-label">Hostnames</span>
													{detail.site.hostnames.map((hostname) => (
														<a key={hostname.hostname} href={`https://${hostname.hostname}`} target="_blank" rel="noreferrer">
															{hostname.hostname}
															<small>{hostname.kind}</small>
														</a>
													))}
												</div>
											)}
										</>
									)}
								</section>
							</div>
						)}
					</section>
				</div>
			</main>
		</div>
	);
}
