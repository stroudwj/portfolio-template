import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorProvider, useEditor } from './store';
import StartScreen from './components/StartScreen';
import SiteIdentityEditor from './components/SiteIdentityEditor';
import HeaderLayoutEditor from './components/HeaderLayoutEditor';
import ThemeEditor from './components/ThemeEditor';
import LayoutEditor from './components/LayoutEditor';
import PageEditor from './components/PageEditor';
import PageManager from './components/PageManager';
import StoreEditor from './components/StoreEditor';
import SignatureEditor from './components/SignatureEditor';
import FooterEditor from './components/FooterEditor';
import CreativeEditor from './components/CreativeEditor';
import SharingEditor from './components/SharingEditor';
import PublishPanel from './components/PublishPanel';
import PreviewPanel from './components/PreviewPanel';
import AccountControls from './components/AccountControls';
import CheckoutIntent from './components/CheckoutIntent';
import MobileDoor from './components/MobileDoor';
import { expandSection, onShowEditorTab, showPreviewPage } from './components/ui/controls';
import { shouldResumePublish } from './lib/polar-checkout';
import { consumeReturnToEditorAfterAuth } from './lib/account/flow';
import { usePhoneContext } from './lib/device';
import { collectIssues } from './lib/validation';
import { withBase } from '../portfolio/types';
import './editor.css';

/** The editing column's five stable work areas. Panes stay mounted (CSS-hidden)
 * so each area's collapse state survives category changes. */
const EDITOR_TABS = [
	{ id: 'pages', icon: '🖼️', label: 'Pages', title: 'Your pages — images, text, videos & page settings' },
	{ id: 'design', icon: '🎨', label: 'Design', title: 'Layout, colors, fonts & visual effects' },
	{ id: 'store', icon: '🛍️', label: 'Store', title: 'Products, prices & Stripe checkout links' },
	{ id: 'site', icon: '⚙️', label: 'Site', title: 'Site identity, footer, search & sharing' },
	{ id: 'publish', icon: '🚀', label: 'Publish', title: 'Your web address, domain & license' },
] as const;

type EditorTab = (typeof EDITOR_TABS)[number]['id'];

const TAB_STORE = 'portfolio-editor.tab';

/** Preserve the last-open category across the five-tab information-architecture
 * update. Old tab ids map to the closest new home instead of dropping the user
 * somewhere unexpected. */
function normalizeEditorTab(value: string | null): EditorTab {
	if (EDITOR_TABS.some((tab) => tab.id === value)) return value as EditorTab;
	if (value === 'content') return 'pages';
	if (value === 'theme' || value === 'creative') return 'design';
	if (value === 'extras' || value === 'sharing') return 'site';
	return 'pages';
}

const SHORTCUTS: Array<{ keys: string; label: string }> = [
	{ keys: '⌘/Ctrl Z', label: 'Undo the last change' },
	{ keys: '⌘/Ctrl ⇧ Z', label: 'Redo' },
	{ keys: '⌘/Ctrl Y', label: 'Redo' },
	{ keys: '⇧ S', label: 'Toggle edge snap' },
	{ keys: 'Esc', label: 'Leave fullscreen preview' },
];

/** Keep infrequent help and destructive actions out of the primary top-bar path. */
function TopbarMoreMenu({ onReset }: { onReset: () => void }) {
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
		<div className="topbar-more" ref={ref}>
			<button
				type="button"
				className="btn-ghost topbar-more-toggle"
				aria-expanded={open}
				aria-label="Help and more"
				title="Help and more"
				onClick={() => setOpen((o) => !o)}
			>
				•••
			</button>
			{open && (
				<div className="topbar-more-popover" role="dialog" aria-label="Help and more">
					<a
						className="topbar-more-action"
						href="mailto:william.stroud100@gmail.com"
						onClick={() => setOpen(false)}
					>
						Send feedback
					</a>
					<details className="topbar-shortcuts">
						<summary>Keyboard shortcuts</summary>
						<ul>
							{SHORTCUTS.map((shortcut, index) => (
								<li key={index}>
									<kbd>{shortcut.keys}</kbd>
									<span>{shortcut.label}</span>
								</li>
							))}
						</ul>
					</details>
					<button
						type="button"
						className="topbar-more-action danger"
						onClick={() => {
							setOpen(false);
							onReset();
						}}
					>
						Reset editor…
					</button>
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
	const [selectedPage, setSelectedPage] = useState<string | null>(null);
	const [lastSelectedPage, setLastSelectedPage] = useState<string | null>(null);
	const [tab, setTab] = useState<EditorTab>(() => {
		const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(TAB_STORE);
		return normalizeEditorTab(saved);
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

	// Cross-panel actions can switch to the closest new top-level category.
	useEffect(() => onShowEditorTab((next) => {
		pickTab(normalizeEditorTab(next));
	}), []);
	const phone = usePhoneContext();

	useUndoShortcuts(undo, redo);

	// Removing/resetting the page currently open in the workspace returns to the
	// overview instead of leaving an empty editor panel behind.
	useEffect(() => {
		if (selectedPage && !doc?.content.pages[selectedPage]) setSelectedPage(null);
		if (lastSelectedPage && !doc?.content.pages[lastSelectedPage]) setLastSelectedPage(null);
	}, [doc, selectedPage, lastSelectedPage]);

	// Returning from checkout reloads the page onto the Start screen. If the buyer set out to
	// publish, resume their saved draft automatically so they land back in the editor (AccountControls
	// then reopens Publish once the license activates) instead of having to click "Continue" again.
	useEffect(() => {
		if (doc || !hasDraft) return;
		if (shouldResumePublish()) void resumeDraft();
	}, [doc, hasDraft, resumeDraft]);

	// Google leaves the page to authenticate. If that trip began from the live
	// editor, reopen the autosaved draft automatically instead of dropping the
	// artist onto the template picker.
	useEffect(() => {
		if (doc || !hasDraft) return;
		if (consumeReturnToEditorAfterAuth()) void resumeDraft();
	}, [doc, hasDraft, resumeDraft]);

	// Phones get the door + a read-only preview, never the canvas. Browsing, checkout,
	// and the auto-unlock-after-purchase flow above all still run on a phone — only
	// BUILDING is desktop work. Tablets pass straight through.
	if (phone) return <MobileDoor base={base} brandLockup={brandLockup} />;

	if (!doc) return <StartScreen brandLockup={brandLockup} />;

	const resetAll = () => {
		if (confirm('Reset the editor? This permanently deletes your draft, uploaded files, and all saved versions in this browser. Download a backup first if you may need them.'))
			void reset();
	};

	const openPageWorkspace = (pageKey: string) => {
		if (!doc.content.pages[pageKey]) return;
		setSelectedPage(pageKey);
		setLastSelectedPage(pageKey);
		pickTab('pages');
		expandSection(pageKey);
		showPreviewPage(pageKey);
		if (controlsRef.current) controlsRef.current.scrollTop = 0;
	};

	const closePageWorkspace = () => {
		setSelectedPage(null);
		if (controlsRef.current) controlsRef.current.scrollTop = 0;
	};

	const pageChoices = doc.content.nav.flatMap((item) => {
		const pageKey = item.path || 'home';
		const page = doc.content.pages[pageKey];
		if (!page) return [];
		return [
			{ key: pageKey, label: page.label || item.label || (pageKey === 'home' ? 'Home' : pageKey), nested: false },
			...(page.children ?? []).flatMap((childKey) => {
				const child = doc.content.pages[childKey];
				return child ? [{ key: childKey, label: child.label || childKey, nested: true }] : [];
			}),
		];
	});
	const selectedChoice = pageChoices.find((choice) => choice.key === selectedPage);

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
				<AccountControls />
				<TopbarMoreMenu onReset={resetAll} />
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
					<div className={`editor-tab-pane ${tab === 'pages' ? 'active' : ''}`}>
						{selectedPage && selectedChoice ? (
							<div className="page-workspace">
								<div className="page-workspace-nav" aria-label="Current page workspace">
									<button type="button" className="btn-link page-workspace-back" onClick={closePageWorkspace}>
										← All pages
									</button>
									<label className="page-workspace-switcher">
										<span className="sr-only">Switch page</span>
										<select
											className="select-input"
											aria-label="Switch page"
											value={selectedPage}
											onChange={(event) => openPageWorkspace(event.target.value)}
										>
											{pageChoices.map((choice) => (
												<option key={choice.key} value={choice.key}>
													{choice.nested ? `↳ ${choice.label}` : choice.label}
												</option>
											))}
										</select>
									</label>
								</div>
								<PageEditor
									key={selectedPage}
									pageKey={selectedPage}
									nested={selectedChoice.nested}
									includeChildren={false}
								/>
							</div>
						) : (
							<PageManager onEditPage={openPageWorkspace} selectedPageKey={lastSelectedPage} />
						)}
					</div>
					<div className={`editor-tab-pane ${tab === 'store' ? 'active' : ''}`}>
						<StoreEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'design' ? 'active' : ''}`}>
						<LayoutEditor />
						<HeaderLayoutEditor />
						<ThemeEditor />
						<CreativeEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'site' ? 'active' : ''}`}>
						<SiteIdentityEditor />
						<SignatureEditor />
						<FooterEditor />
						<SharingEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'publish' ? 'active' : ''}`}>
						<PublishPanel />
					</div>
				</div>
				<div className="editor-preview">
					<PreviewPanel
						base={base}
						canvasEditingEnabled={tab === 'pages' && selectedPage !== null}
						onEditPage={openPageWorkspace}
					/>
				</div>
			</div>
		</div>
	);
}

export default function EditorApp({ base = '' }: { base?: string }) {
	return (
		<EditorProvider>
			<CheckoutIntent />
			<Shell base={base} />
		</EditorProvider>
	);
}
