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

interface ManualEntitlementDetail {
	id: string;
	status: string;
	reason: string;
	createdAt: string;
	revokedReason: string | null;
	revokedAt: string | null;
}

interface SuspensionDetail {
	id: string;
	previousStatus: string;
	reason: string;
	suspendedAt: string;
}

interface AuditDetail {
	id: string;
	actorEmail: string;
	action: string;
	reason: string;
	before: unknown;
	after: unknown;
	createdAt: string;
}

interface AccountDetail {
	user: AccountIdentity;
	licensed: boolean;
	licenses: LicenseDetail[];
	manualEntitlements: ManualEntitlementDetail[];
	site:
		| (AccountSiteSummary & {
				bytesUsed: number;
				requestsThisPeriod: number;
				createdAt: string;
				hostnames: HostnameDetail[];
				suspension: SuspensionDetail | null;
		  })
		| null;
	audit: AuditDetail[];
}

type AccessState = 'checking' | 'signed-out' | 'forbidden' | 'unconfigured' | 'ready' | 'error';
type ActionKind = 'grant' | 'revoke' | 'suspend' | 'restore';

interface PendingAction {
	kind: ActionKind;
	title: string;
	description: string;
	confirmLabel: string;
	entitlementId?: string;
}

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
	const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState('');
	const [actionBusy, setActionBusy] = useState(false);
	const [actionError, setActionError] = useState('');
	const [actionNotice, setActionNotice] = useState('');

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

	const beginAction = (action: PendingAction) => {
		setPendingAction(action);
		setReason('');
		setActionError('');
	};

	const closeAction = () => {
		if (actionBusy) return;
		setPendingAction(null);
		setReason('');
		setActionError('');
	};

	const submitAction = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		const stored = getSession();
		const current = detail;
		const action = pendingAction;
		const trimmedReason = reason.trim();
		if (!stored || !current || !action || trimmedReason.length < 6 || actionBusy) return;

		setActionBusy(true);
		setActionError('');
		setActionNotice('');
		try {
			let path: string;
			let body: Record<string, string>;
			if (action.kind === 'grant') {
				path = '/admin/licenses/grant';
				body = { userId: current.user.id, reason: trimmedReason };
			} else if (action.kind === 'revoke') {
				path = '/admin/licenses/revoke';
				body = { entitlementId: action.entitlementId || '', reason: trimmedReason };
			} else {
				path = '/admin/sites/status';
				body = { siteId: current.site?.id || '', action: action.kind, reason: trimmedReason };
			}
			await new AccountClient(stored.token).request(path, { body });
			setPendingAction(null);
			setReason('');
			setActionNotice(
				action.kind === 'grant'
					? 'Manual access granted.'
					: action.kind === 'revoke'
						? 'Manual access revoked.'
						: action.kind === 'suspend'
							? 'Site suspended.'
							: 'Site restored.',
			);
			const { data } = await new AccountClient(stored.token).request<AccountDetail>('/admin/accounts/get', {
				body: { userId: current.user.id },
			});
			setDetail(data);
			setResults((previous) =>
				previous.map((result) =>
					result.user.id === data.user.id
						? {
								...result,
								licensed: data.licensed,
								licenseCount: data.licenses.length + data.manualEntitlements.length,
								site: data.site
									? {
											id: data.site.id,
											subdomain: data.site.subdomain,
											url: data.site.url,
											status: data.site.status,
											lastPublishedAt: data.site.lastPublishedAt,
										}
									: null,
							}
						: result,
				),
			);
		} catch (error) {
			setActionError(messageFor(error));
		} finally {
			setActionBusy(false);
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
					<span className="admin-kicker">Operator console · Audited controls</span>
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
				<span className="admin-readonly">Audited controls</span>
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
					{actionNotice && <p className="admin-notice">{actionNotice}</p>}
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
										<div className="admin-card-actions">
											<StatusBadge value={detail.licensed ? 'licensed' : 'unlicensed'} />
											{!detail.licensed && (
												<button
													type="button"
													className="admin-button admin-button-primary admin-button-small"
													onClick={() =>
														beginAction({
															kind: 'grant',
															title: 'Grant manual access',
															description: `Give ${detail.user.email} publishing access without creating or changing a Lemon Squeezy purchase.`,
															confirmLabel: 'Grant access',
														})
													}
												>
													Grant manual access
												</button>
											)}
										</div>
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
											<span className="admin-card-label">Lemon Squeezy licenses</span>
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
											<span className="admin-card-label">Manual access</span>
											<h3>
												{detail.manualEntitlements.length} grant{detail.manualEntitlements.length === 1 ? '' : 's'}
											</h3>
										</div>
									</div>
									{detail.manualEntitlements.length === 0 ? (
										<p className="admin-empty compact">No manual access history.</p>
									) : (
										<div className="admin-license-list">
											{detail.manualEntitlements.map((entitlement) => (
												<article key={entitlement.id} className="admin-license">
													<div>
														<strong>Manual entitlement</strong>
														<div className="admin-inline-actions">
															<StatusBadge value={entitlement.status} />
															{entitlement.status === 'active' && (
																<button
																	type="button"
																	className="admin-text-button admin-danger-text"
																	onClick={() =>
																		beginAction({
																			kind: 'revoke',
																			title: 'Revoke manual access',
																			description: `Remove this manual grant from ${detail.user.email}. Paid Lemon Squeezy licenses, if any, remain untouched.`,
																			confirmLabel: 'Revoke access',
																			entitlementId: entitlement.id,
																		})
																	}
																>
																	Revoke
																</button>
															)}
														</div>
													</div>
													<dl>
														<div>
															<dt>Granted</dt>
															<dd>{dateTime(entitlement.createdAt)}</dd>
														</div>
														<div>
															<dt>Reason</dt>
															<dd>{entitlement.reason}</dd>
														</div>
														{entitlement.revokedAt && (
															<>
																<div>
																	<dt>Revoked</dt>
																	<dd>{dateTime(entitlement.revokedAt)}</dd>
																</div>
																<div>
																	<dt>Revoke reason</dt>
																	<dd>{entitlement.revokedReason || '—'}</dd>
																</div>
															</>
														)}
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
										{detail.site && (
											<div className="admin-card-actions">
												<StatusBadge value={detail.site.status} />
												{detail.site.status === 'suspended' ? (
													<button
														type="button"
														className="admin-button admin-button-small"
														onClick={() =>
															beginAction({
																kind: 'restore',
																title: 'Restore published site',
																description: `Restore ${detail.site?.subdomain || detail.user.email} to its visibility before suspension.`,
																confirmLabel: 'Restore site',
															})
														}
													>
														Restore site
													</button>
												) : ['active', 'offline', 'under_construction'].includes(detail.site.status) ? (
													<button
														type="button"
														className="admin-button admin-button-danger admin-button-small"
														onClick={() =>
															beginAction({
																kind: 'suspend',
																title: 'Suspend published site',
																description: `Immediately stop ${detail.site?.subdomain || detail.user.email} from being served. The prior visibility will be remembered for restoration.`,
																confirmLabel: 'Suspend site',
															})
														}
													>
														Suspend site
													</button>
												) : null}
											</div>
										)}
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
											{detail.site.suspension && (
												<div className="admin-suspension-note">
													<strong>Active suspension</strong>
													<span>{detail.site.suspension.reason}</span>
													<small>
														Since {dateTime(detail.site.suspension.suspendedAt)} · previously{' '}
														{detail.site.suspension.previousStatus.replace(/_/g, ' ')}
													</small>
												</div>
											)}
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

								<section className="admin-card">
									<div className="admin-card-heading">
										<div>
											<span className="admin-card-label">Operator history</span>
											<h3>{detail.audit.length} recent action{detail.audit.length === 1 ? '' : 's'}</h3>
										</div>
									</div>
									{detail.audit.length === 0 ? (
										<p className="admin-empty compact">No operator actions for this account.</p>
									) : (
										<div className="admin-audit-list">
											{detail.audit.map((entry) => (
												<article key={entry.id}>
													<div>
														<strong>{entry.action.replace(/[._]/g, ' ')}</strong>
														<time>{dateTime(entry.createdAt)}</time>
													</div>
													<p>{entry.reason}</p>
													<small>{entry.actorEmail}</small>
												</article>
											))}
										</div>
									)}
								</section>
							</div>
						)}
					</section>
				</div>
			</main>
			{pendingAction && detail && (
				<div className="admin-dialog-backdrop" role="presentation" onMouseDown={closeAction}>
					<section
						className="admin-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="admin-action-title"
						onMouseDown={(event) => event.stopPropagation()}
					>
						<span className="admin-kicker">Operator action</span>
						<h2 id="admin-action-title">{pendingAction.title}</h2>
						<p>{pendingAction.description}</p>
						<form onSubmit={submitAction}>
							<label htmlFor="admin-action-reason">
								Reason
								<span>Required · recorded permanently in the audit log</span>
							</label>
							<textarea
								id="admin-action-reason"
								autoFocus
								maxLength={500}
								placeholder="Support case, policy reason, or internal reference…"
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								disabled={actionBusy}
							/>
							{actionError && <p className="admin-error">{actionError}</p>}
							<div className="admin-dialog-actions">
								<button className="admin-button" type="button" onClick={closeAction} disabled={actionBusy}>
									Cancel
								</button>
								<button
									className={`admin-button ${
										pendingAction.kind === 'revoke' || pendingAction.kind === 'suspend'
											? 'admin-button-danger'
											: 'admin-button-primary'
									}`}
									type="submit"
									disabled={reason.trim().length < 6 || actionBusy}
								>
									{actionBusy ? 'Saving…' : pendingAction.confirmLabel}
								</button>
							</div>
						</form>
					</section>
				</div>
			)}
		</div>
	);
}
