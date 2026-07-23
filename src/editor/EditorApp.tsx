import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorProvider, useEditor } from './store';
import StartScreen from './components/StartScreen';
import ProfileEditor from './components/ProfileEditor';
import ThemeEditor from './components/ThemeEditor';
import LayoutEditor from './components/LayoutEditor';
import PageEditor from './components/PageEditor';
import PageManager from './components/PageManager';
import StoreEditor from './components/StoreEditor';
import SocialLinksEditor from './components/SocialLinksEditor';
import SignatureEditor from './components/SignatureEditor';
import FooterEditor from './components/FooterEditor';
import CreativeEditor from './components/CreativeEditor';
import SharingEditor from './components/SharingEditor';
import PublishPanel from './components/PublishPanel';
import PreviewPanel from './components/PreviewPanel';
import AccountControls from './components/AccountControls';
import MobileDoor from './components/MobileDoor';
import { onShowEditorTab } from './components/ui/controls';
import { useLicense } from './components/useLicense';
import { shouldResumePublish } from './lib/license/flow';
import { usePhoneContext } from './lib/device';
import { collectIssues } from './lib/validation';
import { withBase } from '../portfolio/types';
import './editor.css';

/** The editing column's categories. Panes stay mounted (CSS-hidden) so section
 *  collapse state and the preview's scroll-to-section keep working. */
const EDITOR_TABS = [
	{ id: 'content', icon: '🖼️', label: 'Content', title: 'Your pages — images, text, videos & profile' },
	{ id: 'store', icon: '🛍️', label: 'Store', title: 'Products, prices & Stripe checkout links' },
	{ id: 'theme', icon: '🎨', label: 'Theme', title: 'Colors, fonts & site layout' },
	{ id: 'extras', icon: '🖋️', label: 'Extras', title: 'Finishing touches — signature, footer & links' },
	{ id: 'creative', icon: '✨', label: 'Fun', title: 'Optional playful touches for the whole site' },
	{ id: 'sharing', icon: '🔍', label: 'Sharing', title: 'How your site appears in search results and link previews' },
	{ id: 'publish', icon: '🚀', label: 'Publish', title: 'Your web address, domain & license' },
] as const;

type EditorTab = (typeof EDITOR_TABS)[number]['id'];

const TAB_STORE = 'portfolio-editor.tab';

const SHORTCUTS: Array<{ keys: string; label: string }> = [
	{ keys: '⌘/Ctrl Z', label: 'Undo the last change' },
	{ keys: '⌘/Ctrl ⇧ Z', label: 'Redo' },
	{ keys: '⌘/Ctrl Y', label: 'Redo' },
	{ keys: '⇧ S', label: 'Toggle edge snap' },
	{ keys: 'Esc', label: 'Leave fullscreen preview' },
];

/** A small "?" button in the top bar that opens a popover listing every editor
 *  shortcut — the shortcuts themselves live next to the code that implements them;
 *  this is just the one place someone can go to remember what they are. */
function HotkeyGuide() {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div className="hotkey-guide" ref={ref}>
			<button
				type="button"
				className="btn-ghost hotkey-guide-toggle"
				aria-expanded={open}
				aria-label="Keyboard shortcuts"
				title="Keyboard shortcuts"
				onClick={() => setOpen((o) => !o)}
			>
				⌨
			</button>
			{open && (
				<div className="hotkey-guide-popover" role="dialog" aria-label="Keyboard shortcuts">
					<h3>Keyboard shortcuts</h3>
					<ul>
						{SHORTCUTS.map((s, i) => (
							<li key={i}>
								<kbd>{s.keys}</kbd>
								<span>{s.label}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

/** Cmd/Ctrl+Z undoes the last document change; Cmd+Shift+Z or Cmd/Ctrl+Y redoes
 *  it. Text fields keep their familiar native undo while they have focus. */
function useUndoShortcuts(undo: () => void, redo: () => void) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
			const key = e.key.toLowerCase();
			if (key === 'z') {
				e.preventDefault();
				if (e.shiftKey) redo();
				else undo();
			} else if (key === 'y') {
				e.preventDefault();
				redo();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [undo, redo]);
}

function Shell({ base }: { base: string }) {
	const {
		doc,
		reset,
		resumeDraft,
		hasDraft,
		undo,
		redo,
		canUndo,
		canRedo,
		saveStatus,
		saveError,
	} = useEditor();
	const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
	const controlsRef = useRef<HTMLDivElement>(null);
	const [tab, setTab] = useState<EditorTab>(() => {
		const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(TAB_STORE);
		return EDITOR_TABS.some((t) => t.id === saved) ? (saved as EditorTab) : 'content';
	});
	const issues = useMemo(() => (doc ? collectIssues(doc) : []), [doc]);
	const brandLockup = withBase(base, 'assets/brand/hangwork-lockup.svg');
	const brandMark = withBase(base, 'assets/brand/hangwork-mark.svg');

	const pickTab = (next: EditorTab) => {
		setTab(next);
		if (controlsRef.current) controlsRef.current.scrollTop = 0;
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
	const phone = usePhoneContext();

	useUndoShortcuts(undo, redo);

	// Returning from checkout reloads the page onto the Start screen. If the buyer set out to
	// publish, resume their saved draft automatically so they land back in the editor (AccountControls
	// then reopens Publish once the license activates) instead of having to click "Continue" again.
	useEffect(() => {
		if (doc || !hasDraft) return;
		if (shouldResumePublish()) void resumeDraft();
	}, [doc, hasDraft, resumeDraft]);

	// Phones get the door + a read-only preview, never the canvas. Browsing, checkout,
	// and the auto-unlock-after-purchase flow above all still run on a phone — only
	// BUILDING is desktop work. Tablets pass straight through.
	if (phone) return <MobileDoor license={license} base={base} brandLockup={brandLockup} />;

	if (!doc) return <StartScreen brandLockup={brandLockup} />;

	const resetAll = () => {
		if (confirm('Reset the editor? This permanently deletes your draft, uploaded files, and all saved versions in this browser. Download a backup first if you may need them.'))
			void reset();
	};

	return (
		<div className="editor">
			<header className="editor-topbar">
				<a className="editor-brand" href={withBase(base)} aria-label="Hangwork home">
					<picture>
						<source media="(max-width: 520px)" srcSet={brandMark} />
						<img className="editor-brand-logo" src={brandLockup} alt="Hangwork" />
					</picture>
				</a>
				<div className="mobile-toggle">
					<button type="button" aria-pressed={mobileView === 'edit'} className={mobileView === 'edit' ? 'active' : ''} onClick={() => setMobileView('edit')}>
						Edit
					</button>
					<button
						type="button"
						aria-pressed={mobileView === 'preview'}
						className={mobileView === 'preview' ? 'active' : ''}
						onClick={() => setMobileView('preview')}
					>
						Preview
					</button>
				</div>
				<div className="topbar-spacer" />
				<div
					className={`save-status save-status-${saveStatus}`}
					role="status"
					aria-live="polite"
					aria-label={saveError ?? (saveStatus === 'saving' ? 'Saving draft' : 'Draft saved')}
					title={saveError ?? (saveStatus === 'saving' ? 'Saving your draft in this browser' : 'Draft saved in this browser')}
				>
					<span className="save-status-dot" aria-hidden="true" />
					{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'failed' ? 'Couldn’t save' : 'Saved'}
				</div>
				<div className="history-actions" role="group" aria-label="Undo and redo">
					<button
						type="button"
						className="btn-ghost"
						onClick={undo}
						disabled={!canUndo}
						title="Undo the last change (Command or Ctrl + Z)"
					>
						Undo
					</button>
					<button
						type="button"
						className="btn-ghost"
						onClick={redo}
						disabled={!canRedo}
						title="Redo the last undone change (Command or Ctrl + Shift + Z)"
					>
						Redo
					</button>
				</div>
				<HotkeyGuide />
				<button type="button" className="btn-ghost danger" onClick={resetAll}>
					Reset
				</button>
				<AccountControls license={license} />
			</header>

			<div className={`editor-body view-${mobileView}`}>
				<div className="editor-controls" ref={controlsRef}>
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
						<details className="issues issues-compact">
							<summary>
								{issues.length} publishing reminder{issues.length === 1 ? '' : 's'}
							</summary>
							<ul>
								{issues.map((issue, i) => (
									<li key={i}>{issue}</li>
								))}
							</ul>
						</details>
					)}
					<div className={`editor-tab-pane ${tab === 'content' ? 'active' : ''}`}>
						<PageManager />
						<ProfileEditor />
						{doc.content.nav.map((item) => (
							<PageEditor key={item.path || 'home'} pageKey={item.path || 'home'} />
						))}
					</div>
					<div className={`editor-tab-pane ${tab === 'store' ? 'active' : ''}`}>
						<StoreEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'theme' ? 'active' : ''}`}>
						<LayoutEditor />
						<ThemeEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'extras' ? 'active' : ''}`}>
						<SocialLinksEditor />
						<SignatureEditor />
						<FooterEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'creative' ? 'active' : ''}`}>
						<CreativeEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'sharing' ? 'active' : ''}`}>
						<SharingEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'publish' ? 'active' : ''}`}>
						<PublishPanel license={license} />
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
