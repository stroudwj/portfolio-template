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
import { onShowEditorTab } from './components/ui/controls';
import { useLicense } from './components/useLicense';
import { shouldResumePublish } from './lib/license/flow';
import { collectIssues } from './lib/validation';
import './editor.css';

/** The editing column's categories. Panes stay mounted (CSS-hidden) so section
 *  collapse state and the preview's scroll-to-section keep working. */
const EDITOR_TABS = [
	{ id: 'content', icon: '🖼️', label: 'Content', title: 'Your pages — images, text, videos & profile' },
	{ id: 'theme', icon: '🎨', label: 'Theme', title: 'Colors, fonts & site layout' },
	{ id: 'extras', icon: '✨', label: 'Extras', title: 'Finishing touches — signature, footer & links' },
] as const;

type EditorTab = (typeof EDITOR_TABS)[number]['id'];

const TAB_STORE = 'portfolio-editor.tab';

function Shell({ base }: { base: string }) {
	const { doc, reset, resumeDraft, hasDraft } = useEditor();
	const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
	const [tab, setTab] = useState<EditorTab>(() => {
		const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(TAB_STORE);
		return EDITOR_TABS.some((t) => t.id === saved) ? (saved as EditorTab) : 'content';
	});
	const issues = useMemo(() => (doc ? collectIssues(doc) : []), [doc]);

	const pickTab = (next: EditorTab) => {
		setTab(next);
		try {
			window.localStorage.setItem(TAB_STORE, next);
		} catch {
			/* storage blocked — the choice still holds this session */
		}
	};

	// The preview switches to Content before scrolling to a page's section.
	useEffect(() => onShowEditorTab((next) => {
		if (EDITOR_TABS.some((t) => t.id === next)) pickTab(next as EditorTab);
	}), []);
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
					<nav className="editor-tabs" aria-label="Editor categories">
						{EDITOR_TABS.map((t) => (
							<button
								key={t.id}
								type="button"
								className={`editor-tab ${tab === t.id ? 'active' : ''}`}
								title={t.title}
								aria-pressed={tab === t.id}
								onClick={() => pickTab(t.id)}
							>
								<span className="editor-tab-icon" aria-hidden="true">
									{t.icon}
								</span>
								{t.label}
							</button>
						))}
					</nav>
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
					<div className={`editor-tab-pane ${tab === 'content' ? 'active' : ''}`}>
						<ProfileEditor />
						{doc.content.nav.map((item) => (
							<PageEditor key={item.path || 'home'} pageKey={item.path || 'home'} />
						))}
						<AddPageButton />
					</div>
					<div className={`editor-tab-pane ${tab === 'theme' ? 'active' : ''}`}>
						<ThemeEditor />
						<LayoutEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'extras' ? 'active' : ''}`}>
						<SocialLinksEditor />
						<SignatureEditor />
						<FooterEditor />
					</div>
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
