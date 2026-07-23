import { useState } from 'react';
import { useEditor } from '../store';
import { useAccount } from './useAccount';
import SignInModal from './SignInModal';
import LoadPublishedModal from './LoadPublishedModal';
import { isLicenseGateEnabled } from '../lib/license/config';
import { SITE_TEMPLATES, type SiteTemplate } from '../lib/templates';

/** A clickable template card with a contained theme swatch. Keeping the editor
 * chrome neutral makes the different palettes easy to compare without turning
 * the whole start screen into a patchwork of competing colors. */
function TemplateCard({ template, onPick }: { template: SiteTemplate; onPick: (t: SiteTemplate) => void }) {
	const { theme } = template.content;
	return (
		<button type="button" className="template-card" onClick={() => onPick(template)}>
			<span className="template-preview" style={{ background: theme.backgroundColor, color: theme.textColor }} aria-hidden="true">
				<span
					className="template-sample"
					style={{ color: theme.accentColor, fontFamily: theme.headingFontFamily || theme.fontFamily }}
				>
					Aa
				</span>
				<span className="template-lines">
					<i style={{ background: theme.textColor }} />
					<i style={{ background: theme.mutedTextColor }} />
				</span>
			</span>
			<strong className="template-name">{template.name}</strong>
			<span className="template-tagline">{template.tagline}</span>
		</button>
	);
}

export default function StartScreen({ brandLockup }: { brandLockup: string }) {
	const { startBlank, startExisting, startTemplate, resumeDraft, openDoc, hasDraft, draftError } = useEditor();
	const account = useAccount();
	const [showSignIn, setShowSignIn] = useState(false);
	const [showLoad, setShowLoad] = useState(false);

	const signedIn = account.status === 'signed-in';
	const hasPublished = Boolean(account.site?.subdomain);
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
				<h1 className="start-brand">
					<img className="start-brand-logo" src={brandLockup} alt="Hangwork" />
				</h1>

				{!signedIn && account.error && <p className="field-error start-error">{account.error}</p>}
				{draftError && <p className="field-error start-error">{draftError}</p>}

				{signedIn ? (
					<>
						<p>
							Signed in as <strong>{account.user?.email}</strong>.
							{hasPublished
								? ' Load your live portfolio to edit it from any device — your changes go back to the same website when you publish.'
								: ' Your site will live in this account once you publish it.'}
						</p>
						<div className="start-actions">
							{hasPublished && (
								<button type="button" className="btn-primary" onClick={() => setShowLoad(true)}>
									Edit my published site
								</button>
							)}
							{hasDraft && (
								<button type="button" className={hasPublished ? 'btn-secondary' : 'btn-primary'} onClick={() => resumeDraft()}>
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
								onClick={() => setShowSignIn(true)}
								disabled={account.status === 'checking'}
							>
								{account.status === 'checking' ? 'Checking sign-in…' : 'Sign in to edit your published site'}
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
							Build your portfolio right here in the browser. Hang your pieces, watch the live preview, then
							publish to a space you own — yours forever.
						</p>
						<div className="start-actions">
							<button type="button" className="btn-primary" onClick={startBlank}>
								Start with a blank portfolio
							</button>
							<button type="button" className="btn-secondary" onClick={startExisting}>
								Use the example portfolio
							</button>
						</div>
						<p className="template-lead">Or choose a starter style:</p>
						{templatePicker}
						<ol className="how-it-works">
							<li>Add your pieces, details, and links — the preview updates as you go.</li>
							<li>Claim your space — a free account where your site is stored.</li>
							<li>
								Publish{licenseGated ? ' — pay once and' : ' —'} your site goes live at its own web
								address.
							</li>
							<li>Come back anytime, from any device, to rehang and publish again.</li>
						</ol>
						<div className="start-links">
							<button
								type="button"
								className="btn-link"
								onClick={() => setShowSignIn(true)}
								disabled={account.status === 'checking'}
							>
								{account.status === 'checking' ? 'Checking sign-in…' : 'Already published? Sign in to edit your live site'}
							</button>
						</div>
					</>
				)}
			</div>

			{showSignIn && (
				<SignInModal
					sendMagicLink={account.sendMagicLink}
					signInWithGoogle={account.signInWithGoogle}
					googleEnabled={account.googleEnabled}
					onClose={() => setShowSignIn(false)}
				/>
			)}
			{showLoad && <LoadPublishedModal site={account.site} onClose={() => setShowLoad(false)} onLoaded={openDoc} />}
		</div>
	);
}
