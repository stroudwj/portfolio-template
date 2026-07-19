import { useEffect, useMemo, useState } from 'react';
import { EditorProvider, useEditor } from './store';
import StartScreen from './components/StartScreen';
import ProfileEditor from './components/ProfileEditor';
import ThemeEditor from './components/ThemeEditor';
import LayoutEditor from './components/LayoutEditor';
import PageEditor from './components/PageEditor';
import AddPageButton from './components/AddPageButton';
import SocialLinksEditor from './components/SocialLinksEditor';
import SignatureEditor from './components/SignatureEditor';
import FooterEditor from './components/FooterEditor';
import PreviewPanel from './components/PreviewPanel';
import GitHubControls from './components/GitHubControls';
import { useLicense } from './components/useLicense';
import { shouldResumePublish } from './lib/license/flow';
import { collectIssues } from './lib/validation';
import './editor.css';

function Shell({ base }: { base: string }) {
	const { doc, reset, resumeDraft, hasDraft } = useEditor();
	const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
	const issues = useMemo(() => (doc ? collectIssues(doc) : []), [doc]);
	// Held at the top level so the auto-unlock-after-purchase handler runs even on the Start
	// screen (a buyer usually lands there returning from checkout, before the editor mounts).
	const license = useLicense();

	// Returning from checkout reloads the page onto the Start screen. If the buyer set out to
	// publish, resume their saved draft automatically so they land back in the editor (GitHubControls
	// then reopens Publish once the license activates) instead of having to click "Continue" again.
	useEffect(() => {
		if (doc || !hasDraft) return;
		if (shouldResumePublish()) void resumeDraft();
	}, [doc, hasDraft, resumeDraft]);

	if (!doc) return <StartScreen />;

	const resetAll = () => {
		if (confirm('Reset the editor? This permanently deletes your draft and every image saved in this browser.'))
			void reset();
	};

	return (
		<div className="editor">
			<header className="editor-topbar">
				<span className="brand">
					hangwork<span className="brand-dot">.</span>
				</span>
				<div className="mobile-toggle">
					<button type="button" className={mobileView === 'edit' ? 'active' : ''} onClick={() => setMobileView('edit')}>
						Edit
					</button>
					<button
						type="button"
						className={mobileView === 'preview' ? 'active' : ''}
						onClick={() => setMobileView('preview')}
					>
						Preview
					</button>
				</div>
				<div className="topbar-spacer" />
				<button type="button" className="btn-ghost danger" onClick={resetAll}>
					Reset
				</button>
				<GitHubControls license={license} />
			</header>

			<div className={`editor-body view-${mobileView}`}>
				<div className="editor-controls">
					{issues.length > 0 && (
						<div className="issues">
							<strong>Before publishing:</strong>
							<ul>
								{issues.map((issue, i) => (
									<li key={i}>{issue}</li>
								))}
							</ul>
						</div>
					)}
					<ProfileEditor />
					<ThemeEditor />
					<LayoutEditor />
					{doc.content.nav.map((item) => (
						<PageEditor key={item.path || 'home'} pageKey={item.path || 'home'} />
					))}
					<AddPageButton />
					<SocialLinksEditor />
					<SignatureEditor />
					<FooterEditor />
				</div>
				<div className="editor-preview">
					<PreviewPanel base={base} />
				</div>
			</div>
		</div>
	);
}

export default function EditorApp({ base = '' }: { base?: string }) {
	return (
		<EditorProvider>
			<Shell base={base} />
		</EditorProvider>
	);
}
