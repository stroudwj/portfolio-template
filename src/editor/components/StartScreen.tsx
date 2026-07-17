import { useState } from 'react';
import { useEditor } from '../store';
import { useGitHub } from './useGitHub';
import ConnectGitHubModal from './ConnectGitHubModal';
import LoadPublishedModal from './LoadPublishedModal';
import { isLicenseGateEnabled } from '../lib/license/config';
import { SITE_TEMPLATES, type SiteTemplate } from '../lib/templates';

/** A clickable template card: name, tagline, and the template's own colors/type. */
function TemplateCard({ template, onPick }: { template: SiteTemplate; onPick: (t: SiteTemplate) => void }) {
	const { theme } = template.content;
	return (
		<button
			type="button"
			className="template-card"
			style={{ background: theme.backgroundColor, color: theme.textColor, fontFamily: theme.fontFamily }}
			onClick={() => onPick(template)}
		>
			<span className="template-sample" style={{ color: theme.accentColor }}>
				Aa
			</span>
			<strong className="template-name">{template.name}</strong>
			<span className="template-tagline" style={{ color: theme.mutedTextColor }}>
				{template.tagline}
			</span>
		</button>
	);
}

export default function StartScreen() {
	const { startBlank, startExisting, startTemplate, resumeDraft, openDoc, hasDraft } = useEditor();
	const gh = useGitHub();
	const [showConnect, setShowConnect] = useState(false);
	const [showLoad, setShowLoad] = useState(false);

	const connected = gh.status === 'connected';
	const licenseGated = isLicenseGateEnabled();

	// Starting fresh throws away the autosaved draft — confirm first so a stray click
	// can't wipe someone's work (only matters when a draft actually exists).
	const startOver = () => {
		if (!hasDraft || confirm('Start over from the template? This will discard your saved changes.')) startExisting();
	};
	const startFresh = () => {
		if (!hasDraft || confirm('Start from a blank portfolio? This will discard your saved changes.')) startBlank();
	};
	const pickTemplate = (t: SiteTemplate) => {
		if (!hasDraft || confirm(`Start fresh with the ${t.name} template? This will discard your saved changes.`))
			startTemplate(t.content);
	};

	const templatePicker = (
		<div className="template-grid">
			{SITE_TEMPLATES.map((t) => (
				<TemplateCard key={t.id} template={t} onPick={pickTemplate} />
			))}
		</div>
	);

	return (
		<div className="start">
			<div className="start-card">
				<h1>Portfolio Editor</h1>

				{!connected && gh.error && <p className="field-error start-error">{gh.error}</p>}

				{connected ? (
					<>
						<p>
							Signed in as <strong>@{gh.user?.login}</strong>. Load your live portfolio to edit it from any device — your
							changes go back to the same website when you publish.
						</p>
						<div className="start-actions">
							<button type="button" className="btn-primary" onClick={() => setShowLoad(true)}>
								Edit my published site
							</button>
							{hasDraft && (
								<button type="button" className="btn-secondary" onClick={() => resumeDraft()}>
									Continue local draft
								</button>
							)}
						</div>
						<p className="template-lead">Or start fresh with a different look:</p>
						{templatePicker}
						<div className="start-links">
							<button type="button" className="btn-link" onClick={startOver}>
								Start over from the classic template
							</button>
							<button type="button" className="btn-link" onClick={startFresh}>
								Start from blank
							</button>
						</div>
					</>
				) : hasDraft ? (
					<>
						<p>Welcome back — your work was saved automatically. Pick up right where you left off.</p>
						<div className="start-actions">
							<button type="button" className="btn-primary" onClick={() => resumeDraft()}>
								Continue editing <span className="btn-sub">(this browser)</span>
							</button>
						</div>
						<p className="template-lead">Or start fresh with a different look:</p>
						{templatePicker}
						<div className="start-links">
							<button
								type="button"
								className="btn-link"
								onClick={() => setShowConnect(true)}
								disabled={gh.status === 'checking'}
							>
								{gh.status === 'checking' ? 'Checking GitHub…' : 'Connect GitHub to edit your published site'}
							</button>
							<button type="button" className="btn-link" onClick={startOver}>
								Start over from the classic template
							</button>
							<button type="button" className="btn-link" onClick={startFresh}>
								Start from blank
							</button>
						</div>
					</>
				) : (
					<>
						<p>
							Build your portfolio right here in your browser — no code, no setup. Add your work and watch the live
							preview, then publish it to your own website on GitHub. You keep the site and its code forever.
						</p>
						<div className="start-actions">
							<button type="button" className="btn-primary" onClick={startExisting}>
								Start building
							</button>
							<button type="button" className="btn-secondary" onClick={startBlank}>
								Start from blank
							</button>
						</div>
						<p className="template-lead">Or pick a different look to start from:</p>
						{templatePicker}
						<ol className="how-it-works">
							<li>Add your details, images, and links — the preview updates as you go.</li>
							<li>Authorize GitHub in one click{licenseGated ? ' and unlock with your license' : ''}.</li>
							<li>
								Publish — your site goes live at your own <code>github.io</code> address.
							</li>
							<li>Come back anytime, from any device, to edit and publish again.</li>
						</ol>
						<div className="start-links">
							<button
								type="button"
								className="btn-link"
								onClick={() => setShowConnect(true)}
								disabled={gh.status === 'checking'}
							>
								{gh.status === 'checking' ? 'Checking GitHub…' : 'Already published? Connect GitHub to edit your live site'}
							</button>
						</div>
					</>
				)}
			</div>

			{showConnect && (
				<ConnectGitHubModal
					connect={gh.connect}
					authorize={gh.authorize}
					oauthEnabled={gh.oauthEnabled}
					onClose={() => setShowConnect(false)}
					onConnected={() => {
						setShowConnect(false);
						setShowLoad(true);
					}}
				/>
			)}
			{showLoad && <LoadPublishedModal onClose={() => setShowLoad(false)} onLoaded={openDoc} />}
		</div>
	);
}
