import { useRef, useState } from 'react';
import { useEditor } from '../store';
import type { Content } from '../../lib/content';
import { useGitHub } from './useGitHub';
import ConnectGitHubModal from './ConnectGitHubModal';
import LoadPublishedModal from './LoadPublishedModal';

export default function StartScreen() {
	const { startBlank, startExisting, resumeDraft, importContent, openDoc, hasDraft } = useEditor();
	const gh = useGitHub();
	const fileRef = useRef<HTMLInputElement>(null);
	const [showConnect, setShowConnect] = useState(false);
	const [showLoad, setShowLoad] = useState(false);

	const connected = gh.status === 'connected';

	const onImport = (file: File) => {
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = JSON.parse(String(reader.result)) as Content;
				importContent(parsed);
			} catch {
				alert('That file isn’t valid JSON.');
			}
		};
		reader.readAsText(file);
	};

	// Starting fresh throws away the autosaved draft — confirm first so a stray click
	// can't wipe someone's work (only matters when a draft actually exists).
	const startOver = () => {
		if (!hasDraft || confirm('Start over from the template? This will discard your saved changes.')) startExisting();
	};
	const startFresh = () => {
		if (!hasDraft || confirm('Start from a blank portfolio? This will discard your saved changes.')) startBlank();
	};

	return (
		<div className="start">
			<div className="start-card">
				<h1>Portfolio Editor</h1>

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
						<div className="start-links">
							<button type="button" className="btn-link" onClick={() => fileRef.current?.click()}>
								Import a content.json…
							</button>
							<button type="button" className="btn-link" onClick={startOver}>
								Start over from the template
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
						<div className="start-links">
							<button
								type="button"
								className="btn-link"
								onClick={() => setShowConnect(true)}
								disabled={gh.status === 'checking'}
							>
								{gh.status === 'checking' ? 'Checking GitHub…' : 'Connect GitHub to edit your published site'}
							</button>
							<button type="button" className="btn-link" onClick={() => fileRef.current?.click()}>
								Import a content.json…
							</button>
							<button type="button" className="btn-link" onClick={startOver}>
								Start over from the template
							</button>
							<button type="button" className="btn-link" onClick={startFresh}>
								Start from blank
							</button>
						</div>
					</>
				) : (
					<>
						<p>Build your portfolio without writing code. Fill in your details, upload images, drag to reorder, watch the live preview, then publish a ready-to-go site.</p>
						<div className="start-actions">
							<button type="button" className="btn-primary" onClick={startExisting}>
								Edit current portfolio
							</button>
							<button type="button" className="btn-secondary" onClick={startBlank}>
								Start from blank
							</button>
						</div>
						<div className="start-links">
							<button
								type="button"
								className="btn-link"
								onClick={() => setShowConnect(true)}
								disabled={gh.status === 'checking'}
							>
								{gh.status === 'checking' ? 'Checking GitHub…' : 'Already published? Connect GitHub to edit your live site'}
							</button>
							<button type="button" className="btn-link" onClick={() => fileRef.current?.click()}>
								Import a content.json…
							</button>
						</div>
					</>
				)}

				<input
					ref={fileRef}
					type="file"
					accept="application/json,.json"
					hidden
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) onImport(f);
						e.target.value = '';
					}}
				/>
			</div>

			{showConnect && (
				<ConnectGitHubModal
					connect={gh.connect}
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
