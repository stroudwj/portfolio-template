// The 🚀 Publish tab: everything about where the site lives — web address
// (subdomain or custom domain), Hangwork account, license status — plus the
// same Publish action as the topbar button (which stays where it is).
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Section } from './ui/controls';
import { useAccount } from './useAccount';
import type { LicenseSession } from './useLicense';
import { hasPublishableContent } from '../lib/validation';
import { currentPriceText, pricing, regularPriceText } from '../../lib/pricing';
import { loadSiteInfo } from '../lib/account/site-store';
import { AccountError } from '../lib/account/client';
import { ACCOUNT_API_URL } from '../lib/account/config';
import { getSession } from '../lib/account/session';
import { getLicense } from '../lib/license/session';
import { SITES_ROOT_DOMAIN, slugifySiteName, subdomainFor } from '../lib/github/subdomain';
import { downloadEditorBackup, importEditorBackup, readEditorBackup } from '../lib/backup';
import { saveNamedVersion } from '../lib/persistence';
import SignInModal from './SignInModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';
import CustomDomainModal from './CustomDomainModal';
import RenameSiteModal from './RenameSiteModal';
import VersionHistory from './VersionHistory';

export default function PublishPanel({ license }: { license: LicenseSession }) {
	const { doc, openDoc } = useEditor();
	const account = useAccount();
	const [showSignIn, setShowSignIn] = useState(false);
	// Why the license modal is open decides its copy + what follows unlocking:
	// 'publish' resumes into Publish, 'unlock' (paying upfront) just unlocks.
	const [showLicense, setShowLicense] = useState<null | 'publish' | 'unlock'>(null);
	const [showPublish, setShowPublish] = useState(false);
	const [showDomain, setShowDomain] = useState(false);
	const [showRename, setShowRename] = useState(false);
	const [backupState, setBackupState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const [backupError, setBackupError] = useState('');
	const [restoreState, setRestoreState] = useState<'idle' | 'restoring' | 'restored' | 'error'>('idle');
	const [restoreError, setRestoreError] = useState('');
	const [exportState, setExportState] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
	const [exportError, setExportError] = useState('');
	const restoreInput = useRef<HTMLInputElement>(null);
	// Re-read the saved site pointer after any modal closes (publish/domain change it).
	const [, setRefresh] = useState(0);
	const bump = () => setRefresh((n) => n + 1);

	if (!doc) return null;
	const info = loadSiteInfo();
	const signedIn = account.status === 'signed-in';
	const published = Boolean(info?.subdomain || account.site?.subdomain);
	// Two independent publish conditions, satisfiable in either order: the site is
	// built, and the account is unlocked. Built-but-unpaid gets the license gate;
	// paid-but-empty just waits for content (no payment prompt).
	const built = hasPublishableContent(doc);
	const unlocked = account.licensed || !license.required || license.status === 'licensed';
	const onPublishClick = () => {
		if (!built) return;
		if (!signedIn) setShowSignIn(true);
		else if (!unlocked) setShowLicense('publish');
		else setShowPublish(true);
	};

	const liveUrl = info?.customDomain
		? `https://${info.customDomain}`
		: info?.url ?? (account.site?.subdomain ? `https://${subdomainFor(account.site.subdomain)}` : undefined);
	const plannedAddress = `https://${subdomainFor(slugifySiteName(doc.content.site.name || 'my-portfolio'))}`;

	const downloadBackup = async () => {
		setBackupState('saving');
		setBackupError('');
		try {
			await downloadEditorBackup(doc);
			setBackupState('saved');
		} catch (error) {
			setBackupError(error instanceof Error ? error.message : 'Something went wrong while making the backup.');
			setBackupState('error');
		}
	};
	const restoreBackup = async (file: File) => {
		if (!confirm('Open this backup? First, your current work will be saved as a version in this browser so you can return to it.')) return;
		setRestoreState('restoring');
		setRestoreError('');
		try {
			const prepared = await readEditorBackup(file);
			await saveNamedVersion(doc, 'Before restoring a downloaded backup');
			const restored = await importEditorBackup(prepared);
			await openDoc(restored);
			setRestoreState('restored');
		} catch (error) {
			setRestoreError(error instanceof Error ? error.message : 'That backup could not be restored.');
			setRestoreState('error');
		}
	};

	// The ownership guarantee, in a button: the Worker zips the site's served files on
	// demand — the exact artifact any static host (Netlify Drop, Cloudflare Pages,
	// a plain web server) can serve as-is.
	const exportSite = async () => {
		setExportState('exporting');
		setExportError('');
		try {
			const token = getSession()?.token;
			if (!token) throw new AccountError(401, 'invalid_session', 'Sign in first, then export.');
			// AccountClient parses JSON; the zip needs the raw response — fetch directly.
			const res = await fetch(`${ACCOUNT_API_URL}/site/export`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new AccountError(res.status, data.error ?? '', data.error === 'nothing_published' ? 'Publish once first — then your site can be exported.' : 'The export couldn’t be prepared. Please try again.');
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${info?.subdomain ?? 'site'}-export.zip`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			setExportState('done');
		} catch (error) {
			setExportError(error instanceof AccountError ? error.friendly : error instanceof Error ? error.message : 'The export failed.');
			setExportState('error');
		}
	};

	return (
		<>
			<Section title="Your web address" sectionKey="_publish-address">
				{published && liveUrl ? (
					<>
						<p className="muted" style={{ marginTop: 0 }}>
							Your site is published at
						</p>
						<a className="live-url" href={liveUrl} target="_blank" rel="noopener noreferrer">
							{liveUrl}
						</a>
						{info?.customDomain && !info.customDomain.endsWith(`.${SITES_ROOT_DOMAIN}`) && (
							<p className="muted">Custom domain connected: {info.customDomain}</p>
						)}
						<div className="publish-panel-actions">
							<button type="button" className="btn-secondary" onClick={() => setShowDomain(true)} disabled={!signedIn}>
								{info?.customDomain ? 'Manage custom domain…' : 'Use a custom domain…'}
							</button>
							<button type="button" className="btn-secondary" onClick={() => setShowRename(true)} disabled={!signedIn}>
								Rename site…
							</button>
						</div>
					</>
				) : (
					<>
						<p className="muted" style={{ marginTop: 0 }}>
							Not published yet. When you publish, your site gets its own address:
						</p>
						<span className="live-url">{plannedAddress}</span>
						<p className="muted">You can connect a domain you own afterwards.</p>
					</>
				)}
			</Section>

			<Section title="Account & license" sectionKey="_publish-account">
				<div className="status-row">
					<span className="status-label">Account</span>
					{signedIn && account.user ? (
						<span className="status-value">{account.user.email}</span>
					) : account.status === 'checking' ? (
						<span className="status-value muted">checking…</span>
					) : (
						<button type="button" className="btn-secondary" onClick={() => setShowSignIn(true)}>
							Sign in
						</button>
					)}
				</div>
				<div className="status-row">
					<span className="status-label">License</span>
					{!license.required ? (
						<span className="status-value">Not required</span>
					) : unlocked ? (
						<span className="status-value">✓ Unlocked — yours forever</span>
					) : license.status === 'checking' || account.status === 'checking' ? (
						<span className="status-value muted">checking…</span>
					) : (
						<button type="button" className="btn-secondary" onClick={() => setShowLicense('unlock')}>
							Unlock now…
						</button>
					)}
				</div>
				{/* Quiet, optional pay-upfront path. The default flow stays pay-at-publish —
				    this is only for people who prefer to settle it before they build. */}
				{license.required && !unlocked && license.status === 'unlicensed' && pricing.launchPricingActive && (
					<p className="muted license-lock-note">
						Lock in {currentPriceText} before it becomes {regularPriceText}. Same one-time price, forever. You
						can also just pay when you publish.
					</p>
				)}
				<div className="publish-panel-actions">
					<button
						type="button"
						className="btn-primary"
						onClick={onPublishClick}
						disabled={!built}
						title={built ? undefined : 'Hang your first piece, then publish.'}
					>
						{published ? 'Publish update' : 'Publish website'}
					</button>
				</div>
				{!built && <p className="muted">Hang your first piece, then publish.</p>}
			</Section>

			<Section title="Own it forever" sectionKey="_publish-own">
				<p className="muted" style={{ marginTop: 0 }}>
					Download your published site as plain files — HTML, images, everything. It works on any web host
					exactly as it is, with or without Hangwork.
				</p>
				<div className="publish-panel-actions">
					<button
						type="button"
						className="btn-secondary"
						onClick={exportSite}
						disabled={exportState === 'exporting' || !signedIn || !published}
						title={!signedIn ? 'Sign in first.' : !published ? 'Publish once first.' : undefined}
					>
						{exportState === 'exporting' ? 'Preparing your files…' : 'Download my site (zip)'}
					</button>
				</div>
				<p className="muted" role="status" aria-live="polite">
					{exportState === 'done' && 'Downloaded. Drop the unzipped folder on Netlify, Cloudflare Pages, or any host.'}
					{exportState === 'error' && exportError}
				</p>
			</Section>

			<VersionHistory />

			<Section title="Back up your work" sectionKey="_publish-backup">
				<p className="muted" style={{ marginTop: 0 }}>
					Download one backup file with your editable pages, drafts, and uploaded files. This does not publish or change your live website.
				</p>
				<div className="publish-panel-actions">
					<button
						type="button"
						className="btn-secondary"
						onClick={downloadBackup}
						disabled={backupState === 'saving'}
						aria-describedby="backup-download-status"
					>
						{backupState === 'saving' ? 'Preparing backup…' : 'Download backup file'}
					</button>
				</div>
				<p id="backup-download-status" className="muted" role="status" aria-live="polite">
					{backupState === 'saving' && 'Gathering your pages, drafts, and uploaded files…'}
					{backupState === 'saved' && 'Backup downloaded.'}
					{backupState === 'error' && `Could not download the backup. ${backupError}`}
				</p>
				<div className="publish-panel-actions backup-restore-actions">
					<input
						ref={restoreInput}
						type="file"
						accept=".zip,application/zip"
						hidden
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void restoreBackup(file);
							event.target.value = '';
						}}
					/>
					<button type="button" className="btn-secondary" aria-describedby="backup-restore-status" disabled={restoreState === 'restoring'} onClick={() => restoreInput.current?.click()}>
						{restoreState === 'restoring' ? 'Opening backup…' : 'Open a backup file'}
					</button>
				</div>
				<p id="backup-restore-status" className="muted" role="status" aria-live="polite">
					{restoreState === 'restoring' && 'Checking the backup and putting its uploaded files back…'}
					{restoreState === 'restored' && 'Backup opened. Your previous work is under Saved versions.'}
					{restoreState === 'error' && `Could not restore the backup. ${restoreError}`}
				</p>
			</Section>

			{showSignIn && (
				<SignInModal
					sendMagicLink={account.sendMagicLink}
					signInWithGoogle={account.signInWithGoogle}
					googleEnabled={account.googleEnabled}
					onClose={() => setShowSignIn(false)}
				/>
			)}
			{showLicense && (
				<LicenseGateModal
					activate={license.activate}
					revalidate={license.revalidate}
					context={showLicense}
					onClose={() => setShowLicense(null)}
					onUnlocked={() => {
						setShowLicense(null);
						// Record the unlock on the ACCOUNT too (the server-side gate).
						const stored = getLicense();
						if (stored) void account.bindLicense(stored.key).catch(() => {});
						// Unlocking is an account property, not a publish step: only continue
						// into Publish when there's actually something to publish.
						if (built && signedIn) setShowPublish(true);
					}}
				/>
			)}
			{showPublish && (
				<PublishModal
					account={account}
					onClose={() => {
						setShowPublish(false);
						bump();
					}}
				/>
			)}
			{showDomain && (
				<CustomDomainModal
					onClose={() => {
						setShowDomain(false);
						bump();
					}}
				/>
			)}
			{showRename && (
				<RenameSiteModal
					onClose={() => {
						setShowRename(false);
						bump();
					}}
				/>
			)}
		</>
	);
}
