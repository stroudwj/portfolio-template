// The 🚀 Publish tab: everything about where the site lives — web address
// (subdomain or custom domain), GitHub connection, license status — plus the
// same Publish action as the topbar button (which stays where it is).
import { useState } from 'react';
import { useEditor } from '../store';
import { Section } from './ui/controls';
import { useGitHub } from './useGitHub';
import type { LicenseSession } from './useLicense';
import { loadRepoInfo } from '../lib/github/store';
import { SITES_ROOT_DOMAIN, slugifySiteName, subdomainFor } from '../lib/github/subdomain';
import ConnectGitHubModal from './ConnectGitHubModal';
import LicenseGateModal from './LicenseGateModal';
import PublishModal from './PublishModal';
import CustomDomainModal from './CustomDomainModal';

export default function PublishPanel({ license }: { license: LicenseSession }) {
	const { doc } = useEditor();
	const gh = useGitHub();
	const [showConnect, setShowConnect] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showPublish, setShowPublish] = useState(false);
	const [showDomain, setShowDomain] = useState(false);
	// Re-read the saved repo pointer after any modal closes (publish/domain change it).
	const [, setRefresh] = useState(0);
	const bump = () => setRefresh((n) => n + 1);

	if (!doc) return null;
	const info = loadRepoInfo();
	const connected = gh.status === 'connected' && gh.user;
	const needsLicense = license.required && license.status !== 'licensed';
	const onPublishClick = () => {
		if (!connected) setShowConnect(true);
		else if (needsLicense) setShowLicense(true);
		else setShowPublish(true);
	};

	const liveUrl = info?.customDomain ? `https://${info.customDomain}` : info?.pagesUrl;
	const isSubdomain = info?.customDomain?.endsWith(`.${SITES_ROOT_DOMAIN}`);
	const plannedAddress = `https://${subdomainFor(slugifySiteName(doc.content.site.name || 'my-portfolio'))}`;

	return (
		<>
			<Section title="Your web address" sectionKey="_publish-address">
				{info && liveUrl ? (
					<>
						<p className="muted" style={{ marginTop: 0 }}>
							Your site is published at
						</p>
						<a className="live-url" href={liveUrl} target="_blank" rel="noopener noreferrer">
							{liveUrl}
						</a>
						{info.customDomain && !isSubdomain && (
							<p className="muted">Custom domain connected: {info.customDomain}</p>
						)}
						<div className="publish-panel-actions">
							<button type="button" className="btn-secondary" onClick={() => setShowDomain(true)} disabled={!connected}>
								{info.customDomain && !isSubdomain ? 'Manage custom domain…' : 'Use a custom domain…'}
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
					<span className="status-label">GitHub</span>
					{connected ? (
						<span className="status-value">
							<img src={gh.user!.avatarUrl} alt="" className="gh-avatar" /> @{gh.user!.login}
						</span>
					) : gh.status === 'checking' ? (
						<span className="status-value muted">checking…</span>
					) : (
						<button type="button" className="btn-secondary" onClick={() => setShowConnect(true)}>
							Connect
						</button>
					)}
				</div>
				<div className="status-row">
					<span className="status-label">License</span>
					{!license.required ? (
						<span className="status-value">Not required</span>
					) : license.status === 'licensed' ? (
						<span className="status-value">✓ Active</span>
					) : license.status === 'checking' ? (
						<span className="status-value muted">checking…</span>
					) : (
						<button type="button" className="btn-secondary" onClick={() => setShowLicense(true)}>
							Unlock publishing…
						</button>
					)}
				</div>
				<div className="publish-panel-actions">
					<button type="button" className="btn-primary" onClick={onPublishClick}>
						{info ? 'Publish update' : 'Publish website'}
					</button>
				</div>
			</Section>

			{showConnect && (
				<ConnectGitHubModal
					connect={gh.connect}
					authorize={gh.authorize}
					oauthEnabled={gh.oauthEnabled}
					onClose={() => setShowConnect(false)}
					onConnected={() => {
						setShowConnect(false);
						// Same gate as the topbar: unlicensed users see the license modal first.
						if (needsLicense) setShowLicense(true);
						else setShowPublish(true);
					}}
				/>
			)}
			{showLicense && (
				<LicenseGateModal
					activate={license.activate}
					revalidate={license.revalidate}
					onClose={() => setShowLicense(false)}
					onUnlocked={() => {
						setShowLicense(false);
						setShowPublish(true);
					}}
				/>
			)}
			{showPublish && gh.user && (
				<PublishModal
					user={gh.user}
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
		</>
	);
}
