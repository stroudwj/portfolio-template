import { useState } from 'react';
import { useEditor } from '../store';
import { useAccount } from './useAccount';
import SignInModal from './SignInModal';
import LoadPublishedModal from './LoadPublishedModal';
import { AVAILABLE_STARTERS, type StarterRecipe } from '../lib/templates';
import { getSampleArtwork, sampleArtworkUrl } from '../lib/sample-artwork';
import {
	loadDoc,
	loadSavedVersions,
	saveNamedVersion,
	savedVersionToEvict,
	type SavedVersion,
} from '../lib/persistence';
import { parseAndMigrateEditorDoc } from '../lib/doc-schema';
import { Modal } from './ui/Modal';

type ReadyStarter = StarterRecipe & { content: NonNullable<StarterRecipe['content']> };

function StarterCard({
	starter,
	onPick,
}: {
	starter: ReadyStarter;
	onPick: (starter: ReadyStarter) => void;
}) {
	const cover = getSampleArtwork(starter.coverSampleAssetId);
	const coverUrl = sampleArtworkUrl(starter.coverSampleAssetId);
	const sampleCount = starter.gallerySpecs.reduce(
		(total, gallery) => total + gallery.exactImageCount,
		0,
	);
	return (
		<button type="button" className="template-card starter-card" onClick={() => onPick(starter)}>
			<span className="starter-cover">
				{coverUrl && <img src={coverUrl} alt="" />}
				<span className="starter-discipline">{starter.discipline}</span>
				<span className="starter-count">{sampleCount} sample works</span>
			</span>
			<span className="starter-card-copy">
				<strong className="template-name">{starter.name}</strong>
				<span className="template-tagline">{starter.tagline}</span>
				{cover && <small>Cover sample: {cover.creator}, {cover.title}</small>}
			</span>
		</button>
	);
}

interface PendingStart {
	label: string;
	isTemplate: boolean;
	run: () => void;
	versions: SavedVersion[];
	versionsError: string | null;
}

export default function StartScreen({ brandLockup }: { brandLockup: string }) {
	const { startBlank, startExisting, startTemplate, resumeDraft, openDoc, hasDraft, draftError } = useEditor();
	const account = useAccount();
	const [showSignIn, setShowSignIn] = useState(false);
	const [showLoad, setShowLoad] = useState(false);
	const [pending, setPending] = useState<PendingStart | null>(null);
	const [versionName, setVersionName] = useState('');
	const [confirmEviction, setConfirmEviction] = useState(false);
	const [switchBusy, setSwitchBusy] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);

	const signedIn = account.status === 'signed-in';
	const hasPublished = Boolean(account.site?.subdomain);

	const requestStart = (label: string, isTemplate: boolean, run: () => void) => {
		if (!hasDraft) {
			run();
			return;
		}
		let versions: SavedVersion[] = [];
		let versionsError: string | null = null;
		try {
			versions = loadSavedVersions();
		} catch (error) {
			versionsError = error instanceof Error ? error.message : 'Saved versions could not be read.';
		}
		setVersionName(`Before starting ${label}`);
		setConfirmEviction(false);
		setSwitchError(null);
		setPending({ label, isTemplate, run, versions, versionsError });
	};

	const startOver = () => requestStart('the example portfolio', false, startExisting);
	const startFresh = () => requestStart('a blank portfolio', false, startBlank);
	const pickStarter = (starter: ReadyStarter) =>
		requestStart(starter.name, true, () => startTemplate(starter.content));

	const saveAndSwitch = async () => {
		if (!pending || pending.versionsError) return;
		const oldest = savedVersionToEvict(pending.versions);
		if (pending.versions.length >= 8 && oldest && !confirmEviction) return;
		setSwitchBusy(true);
		setSwitchError(null);
		try {
			const saved = loadDoc();
			if (saved === null)
				throw new Error('Your active browser draft could not be found. Nothing was replaced.');
			await saveNamedVersion(parseAndMigrateEditorDoc(saved), versionName);
			pending.run();
		} catch (error) {
			setSwitchError(
				error instanceof Error
					? error.message
					: 'This browser could not save your current site, so the starter was not opened.',
			);
			setSwitchBusy(false);
		}
	};

	const keepEditing = () => {
		setPending(null);
		void resumeDraft();
	};

	const starterPicker = (
		<>
			<div className="template-grid starter-grid">
				{AVAILABLE_STARTERS.map((starter) => (
					<StarterCard key={starter.id} starter={starter} onPick={pickStarter} />
				))}
			</div>
			<p className="starter-offline-note">
				Uploaded work and document changes stay browser-local. Starter samples require a connection and may not appear offline; browser caching is best-effort.
			</p>
		</>
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
								<button type="button" className={hasPublished ? 'btn-secondary' : 'btn-primary'} onClick={() => void resumeDraft()}>
									Continue local draft
								</button>
							)}
						</div>
						<p className="template-lead">Or begin with a discipline-led starter:</p>
						{starterPicker}
						<div className="start-links">
							<button type="button" className="btn-link" onClick={startOver}>
								Use the example portfolio
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
							<button type="button" className="btn-primary" onClick={() => void resumeDraft()}>
								Continue editing <span className="btn-sub">(this browser)</span>
							</button>
						</div>
						<p className="template-lead">Or begin with a discipline-led starter:</p>
						{starterPicker}
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
								Use the example portfolio
							</button>
							<button type="button" className="btn-link" onClick={startFresh}>
								Start from blank
							</button>
						</div>
					</>
				) : (
					<>
						<p>
							Build your portfolio in the browser, beginning with a structure made for your discipline or with a blank site.
						</p>
						<p className="template-lead">Choose a starter:</p>
						{starterPicker}
						<div className="start-actions start-actions-after-starters">
							<button type="button" className="btn-primary" onClick={startBlank}>
								Start with a blank portfolio
							</button>
							<button type="button" className="btn-secondary" onClick={startExisting}>
								Use the example portfolio
							</button>
						</div>
						<ol className="how-it-works">
							<li>Replace every labeled sample with your own work.</li>
							<li>Edit the structure and theme while the live preview updates.</li>
							<li>Review the sample-free result before anything can be published.</li>
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

			{pending && (
				<Modal
					title={`Save your current site before starting ${pending.label}`}
					onClose={keepEditing}
					footer={
						<>
							<button type="button" className="btn-ghost" onClick={keepEditing} disabled={switchBusy}>
								Keep editing
							</button>
							<button
								type="button"
								className="btn-primary"
								onClick={() => void saveAndSwitch()}
								disabled={
									switchBusy ||
									!!pending.versionsError ||
									(pending.versions.length >= 8 && !confirmEviction)
								}
							>
								{switchBusy
									? 'Saving this site…'
									: pending.isTemplate
										? 'Save this site as a version and start the template'
										: 'Save this site as a version and continue'}
							</button>
						</>
					}
				>
					<p className="modal-lead">
						Hangwork will first save a named browser version and confirm that every referenced upload is safely stored. If saving fails, your active draft stays exactly as it is.
					</p>
					<label className="field">
						<span className="field-label">Version name</span>
						<input
							className="text-input"
							value={versionName}
							onChange={(event) => setVersionName(event.target.value)}
							disabled={switchBusy}
						/>
					</label>
					{savedVersionToEvict(pending.versions) && (
						<label className="starter-eviction-check">
							<input
								type="checkbox"
								checked={confirmEviction}
								onChange={(event) => setConfirmEviction(event.target.checked)}
								disabled={switchBusy}
							/>
							<span>
								I understand this will remove the oldest saved version, <strong>“{savedVersionToEvict(pending.versions)?.name}”</strong> from{' '}
								{new Date(savedVersionToEvict(pending.versions)!.savedAt).toLocaleString()}.
							</span>
						</label>
					)}
					{(pending.versionsError || switchError) && (
						<p className="field-error" role="alert">
							{pending.versionsError || switchError}
						</p>
					)}
				</Modal>
			)}

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
