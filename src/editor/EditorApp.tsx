import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorProvider, useEditor } from './store';
import StartScreen from './components/StartScreen';
import SiteIdentityEditor from './components/SiteIdentityEditor';
import PageEditor from './components/PageEditor';
import PageManager from './components/PageManager';
import StoreEditor from './components/StoreEditor';
import PageSettingsModal from './components/PageSettingsModal';
import { PanelIcon } from './components/ui/panel-icons';
import FooterEditor from './components/FooterEditor';
import DesignEditor from './components/DesignEditor';
import SharingEditor from './components/SharingEditor';
import PublishPanel from './components/PublishPanel';
import PreviewPanel from './components/PreviewPanel';
import AccountControls from './components/AccountControls';
import SignInModal from './components/SignInModal';
import { useAccount } from './components/useAccount';
import CheckoutIntent from './components/CheckoutIntent';
import MobileDoor from './components/MobileDoor';
import OnboardingTour from './components/OnboardingTour';
import AssetWorkbench from './components/AssetWorkbench';
import {
	TemplateStudioBar,
	TemplateStudioUnavailable,
	useTemplateStudio,
} from './components/TemplateStudioBar';
import { parseStudioIntent, type TemplateStudioIntent } from './lib/template-studio';
import { consumeIntakeIntent } from './lib/onboarding';
import {
	expandSection,
	onPreviewTypeMotion,
	onRevealEditorSection,
	onShowEditorTab,
	showPreviewPage,
} from './components/ui/controls';
import { shouldResumePublish } from './lib/polar-checkout';
import { consumeReturnToEditorAfterAuth, hasSignInReturnParams } from './lib/account/flow';
import { usePhoneContext } from './lib/device';
import { collectIssues } from './lib/validation';
import { withBase } from '../portfolio/types';
import './editor.css';

/** The editing column's five stable work areas. Panes stay mounted (CSS-hidden)
 * so each area's collapse state survives category changes. */
const EDITOR_TABS = [
	{ id: 'pages', icon: 'pages', label: 'Pages', title: 'Your pages — images, text, videos & page settings' },
	{ id: 'design', icon: 'design', label: 'Design', title: 'Layout, colors, fonts & visual effects' },
	{ id: 'store', icon: 'store', label: 'Store', title: 'Products, prices & Stripe checkout links' },
	{ id: 'site', icon: 'site', label: 'Site', title: 'Site identity, footer, search & sharing' },
	{ id: 'publish', icon: 'publish', label: 'Publish', title: 'Your web address, domain & license' },
] as const;

type EditorTab = (typeof EDITOR_TABS)[number]['id'];

const TAB_STORE = 'portfolio-editor.tab';
const SIDEBAR_WIDTH_STORE = 'portfolio-editor.sidebar-width';
const UI_THEME_STORE = 'portfolio-editor.ui-theme';
const UI_CUSTOM_STORE = 'portfolio-editor.ui-custom';
const DEFAULT_SIDEBAR_WIDTH = 440;
const MIN_SIDEBAR_WIDTH = 320;
const MIN_PREVIEW_WIDTH = 360;
const MAX_SIDEBAR_WIDTH = 720;
type UiTheme = 'warm' | 'light' | 'dark' | 'contrast';
interface UiCustomization {
	enabled: boolean;
	canvas: string;
	text: string;
	accent: string;
	font: string;
}

const DEFAULT_UI_CUSTOMIZATION: UiCustomization = {
	enabled: false,
	canvas: '#faf8f5',
	text: '#1a1a1a',
	accent: '#002fa7',
	font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

function loadUiCustomization(): UiCustomization {
	if (typeof window === 'undefined') return DEFAULT_UI_CUSTOMIZATION;
	try {
		const value = JSON.parse(window.localStorage.getItem(UI_CUSTOM_STORE) ?? '{}') as Partial<UiCustomization>;
		return { ...DEFAULT_UI_CUSTOMIZATION, ...value };
	} catch {
		return DEFAULT_UI_CUSTOMIZATION;
	}
}

const UI_THEMES: Array<{ value: UiTheme; label: string }> = [
	{ value: 'warm', label: 'Warm' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' },
	{ value: 'contrast', label: 'High contrast' },
];

function normalizeUiTheme(value: string | null): UiTheme {
	return UI_THEMES.some((theme) => theme.value === value) ? (value as UiTheme) : 'warm';
}

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
	{ keys: 'Arrow keys', label: 'Nudge selected canvas item(s)' },
	{ keys: '⌥/Alt Arrow keys', label: 'Nudge selected canvas item(s) 10x' },
	{ keys: '[ / ]', label: 'Send selected canvas items backward / bring them forward' },
	{ keys: '⇧ Arrow keys', label: 'Resize selected canvas items' },
	{ keys: 'Delete / Backspace', label: 'Remove selected canvas items' },
	{ keys: 'Esc', label: 'Leave fullscreen preview' },
];

/** Dev-only template studio entry: /editor?template-studio=starter:painter.
 * The param survives reloads on purpose — a browser refresh re-enters the same
 * studio session. Production builds dead-code this to null via import.meta.env,
 * and the missing dev API is the hard backstop. */
function studioIntentFromLocation(): TemplateStudioIntent | null {
	if (!import.meta.env.DEV || typeof window === 'undefined') return null;
	return parseStudioIntent(new URL(window.location.href).searchParams.get('template-studio'));
}

/** Keep infrequent help and destructive actions out of the primary top-bar path. */
function TopbarMoreMenu({
	onReset,
	onShowTour,
	uiTheme,
	onUiTheme,
	uiCustom,
	onUiCustom,
}: {
	onReset?: () => void;
	onShowTour: () => void;
	uiTheme: UiTheme;
	onUiTheme: (theme: UiTheme) => void;
	uiCustom: UiCustomization;
	onUiCustom: (custom: UiCustomization) => void;
}) {
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
					<button
						type="button"
						className="topbar-more-action"
						onClick={() => {
							setOpen(false);
							onShowTour();
						}}
					>
						Show editor tour
					</button>
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
					<div className="topbar-ui-theme">
						<span>Editor appearance</span>
						<div role="group" aria-label="Editor appearance">
							{UI_THEMES.map((theme) => (
								<button
									type="button"
									key={theme.value}
									className={uiTheme === theme.value ? 'active' : ''}
									aria-pressed={uiTheme === theme.value}
									onClick={() => onUiTheme(theme.value)}
								>
									{theme.label}
								</button>
							))}
						</div>
					</div>
					<details className="topbar-custom-appearance">
						<summary>Customize editor colors &amp; font</summary>
						<label className="check-row compact">
							<input
								type="checkbox"
								checked={uiCustom.enabled}
								onChange={(event) => onUiCustom({ ...uiCustom, enabled: event.target.checked })}
							/>
							Use my editor appearance
						</label>
						<div className="topbar-custom-appearance-fields">
							<label>Canvas <input type="color" value={uiCustom.canvas} onChange={(event) => onUiCustom({ ...uiCustom, canvas: event.target.value, enabled: true })} /></label>
							<label>Text <input type="color" value={uiCustom.text} onChange={(event) => onUiCustom({ ...uiCustom, text: event.target.value, enabled: true })} /></label>
							<label>Accent <input type="color" value={uiCustom.accent} onChange={(event) => onUiCustom({ ...uiCustom, accent: event.target.value, enabled: true })} /></label>
							<label>
								Editor font
								<select value={uiCustom.font} onChange={(event) => onUiCustom({ ...uiCustom, font: event.target.value, enabled: true })}>
									<option value="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">Inter / system</option>
									<option value="Avenir, 'Avenir Next', sans-serif">Avenir</option>
									<option value="Georgia, 'Times New Roman', serif">Georgia</option>
									<option value="Menlo, Monaco, Consolas, monospace">Menlo mono</option>
								</select>
							</label>
						</div>
						<button type="button" className="btn-link" onClick={() => onUiCustom(DEFAULT_UI_CUSTOMIZATION)}>
							Reset custom appearance
						</button>
					</details>
					{onReset && (
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
					)}
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

function Shell({ base, studio }: { base: string; studio: TemplateStudioIntent | null }) {
	const {
		doc,
		reset,
		resumeDraft,
		hasDraft,
		undo,
		redo,
		canUndo,
		canRedo,
		historyPageKey: selectedPage,
		navigateHistoryPage,
		saveStatus,
		saveError,
	} = useEditor();
	const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
	// The whole editing column can step aside — the page plus its floating
	// controls carry most day-to-day editing.
	const [sidebarHidden, setSidebarHidden] = useState<boolean>(
		() =>
			typeof window !== 'undefined' &&
			window.localStorage.getItem('portfolio-editor.sidebar-hidden') === 'true',
	);
	const toggleSidebar = () =>
		setSidebarHidden((hidden) => {
			try {
				window.localStorage.setItem('portfolio-editor.sidebar-hidden', String(!hidden));
			} catch {
				/* storage blocked — the choice still holds this session */
			}
			return !hidden;
		});
	const controlsRef = useRef<HTMLDivElement>(null);
	const [lastSelectedPage, setLastSelectedPage] = useState<string | null>(null);
	/** Routing answers from the Start intake, honored once the document opens:
	 * "organized" jumps to the wall, "pile"/finishing opens the workbench, and
	 * the "Save your setup" account door appears once for signed-out artists. */
	const intakeConsumedRef = useRef(false);
	const [intakeWorkbench, setIntakeWorkbench] = useState(false);
	/** The intake's finishing answer: this artist said some photos still need
	 * a crop or light pass, so the workbench leads with the practice offer. */
	const [intakeFinishing, setIntakeFinishing] = useState(false);
	/** The intake's "already organized" answer: no workbench pass, so the
	 * landing-look picker opens with the editor instead of after the build. */
	const [intakeOrganized, setIntakeOrganized] = useState(false);
	/** Which starter the intake applied (null = blank) — chooses the sample
	 * artwork that dresses series pages when the artist leaves with no photos. */
	const [intakeStarterId, setIntakeStarterId] = useState<string | null>(null);
	const [showSaveSetup, setShowSaveSetup] = useState(false);
	const account = useAccount({ returnToEditorAfterGoogle: true });
	/** True when this page load IS a sign-in return (magic link / Google). */
	const [signInReturn] = useState(hasSignInReturnParams);
	const [signInToast, setSignInToast] = useState<string | null>(null);
	const signInToastShownRef = useRef(false);
	const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
	const [tourReplayToken, setTourReplayToken] = useState(0);
	const [uiTheme, setUiTheme] = useState<UiTheme>(() =>
		typeof window === 'undefined'
			? 'warm'
			: normalizeUiTheme(window.localStorage.getItem(UI_THEME_STORE)),
	);
	const [uiCustom, setUiCustom] = useState<UiCustomization>(loadUiCustomization);
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
		const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORE));
		const preferred = Number.isFinite(saved) ? saved : DEFAULT_SIDEBAR_WIDTH;
		return Math.min(
			Math.max(preferred, MIN_SIDEBAR_WIDTH),
			MAX_SIDEBAR_WIDTH,
			Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - MIN_PREVIEW_WIDTH),
		);
	});
	const [tab, setTab] = useState<EditorTab>(() => {
		const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(TAB_STORE);
		const initial = normalizeEditorTab(saved);
		return studio && initial === 'publish' ? 'pages' : initial;
	});
	const issues = useMemo(() => (doc ? collectIssues(doc) : []), [doc]);
	const brandLockup = withBase(base, 'assets/brand/hangwork-lockup.svg');
	const brandMark = withBase(base, 'assets/brand/hangwork-mark.svg');

	const pickTab = (next: EditorTab) => {
		setTab(next);
		if (controlsRef.current) controlsRef.current.scrollTop = 0;
		try {
			if (!studio) window.localStorage.setItem(TAB_STORE, next);
		} catch {
			/* storage blocked — the choice still holds this session */
		}
	};

	// Cross-panel actions can switch to the closest new top-level category.
	useEffect(() => onShowEditorTab((next) => {
		pickTab(normalizeEditorTab(next));
		// A jump into the editing column reopens it if it was stepped aside.
		setSidebarHidden(false);
	}), []);
	useEffect(() => onRevealEditorSection(() => setSidebarHidden(false)), []);
	// On narrower editor layouts the live preview is a separate view. A motion
	// preview request should reveal it automatically instead of animating offscreen.
	useEffect(() => onPreviewTypeMotion(() => setMobileView('preview')), []);
	const phone = usePhoneContext();

	const pickUiTheme = (next: UiTheme) => {
		setUiTheme(next);
		try {
			window.localStorage.setItem(UI_THEME_STORE, next);
		} catch {
			/* storage blocked — the appearance still holds this session */
		}
	};
	const pickUiCustom = (next: UiCustomization) => {
		setUiCustom(next);
		try {
			window.localStorage.setItem(UI_CUSTOM_STORE, JSON.stringify(next));
		} catch {
			/* storage blocked — the custom appearance still holds this session */
		}
	};
	useEffect(() => {
		document.documentElement.dataset.editorUiTheme = uiTheme;
		return () => {
			delete document.documentElement.dataset.editorUiTheme;
		};
	}, [uiTheme]);

	const clampSidebarWidth = (width: number) =>
		Math.round(
			Math.min(
				Math.max(width, MIN_SIDEBAR_WIDTH),
				MAX_SIDEBAR_WIDTH,
				Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - MIN_PREVIEW_WIDTH),
			),
		);

	const saveSidebarWidth = (width: number) => {
		const next = clampSidebarWidth(width);
		setSidebarWidth(next);
		try {
			window.localStorage.setItem(SIDEBAR_WIDTH_STORE, String(next));
		} catch {
			/* storage blocked — the width still holds this session */
		}
	};

	const startSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		const divider = event.currentTarget;
		const pointerId = event.pointerId;
		let latestWidth = sidebarWidth;
		try {
			divider.setPointerCapture(pointerId);
		} catch {
			/* Pointer listeners below still provide the resize fallback. */
		}
		const move = (next: PointerEvent) => {
			latestWidth = clampSidebarWidth(next.clientX);
			setSidebarWidth(latestWidth);
		};
		const finish = () => {
			divider.removeEventListener('pointermove', move);
			divider.removeEventListener('pointerup', finish);
			divider.removeEventListener('pointercancel', finish);
			saveSidebarWidth(latestWidth);
		};
		divider.addEventListener('pointermove', move);
		divider.addEventListener('pointerup', finish);
		divider.addEventListener('pointercancel', finish);
	};

	useUndoShortcuts(undo, redo);

	const templateStudio = useTemplateStudio(studio);

	// Honor the Start intake's workflow answer exactly once per fresh document.
	useEffect(() => {
		if (!doc || intakeConsumedRef.current) return;
		intakeConsumedRef.current = true;
		const intent = consumeIntakeIntent();
		if (!intent) return;
		if (intent.workflow === 'organized') {
			openPageWorkspace('home');
			setIntakeOrganized(true);
		}
		if (intent.workflow === 'pile' || intent.finishing) setIntakeWorkbench(true);
		if (intent.finishing) setIntakeFinishing(true);
		setIntakeStarterId(intent.starterId ?? null);
		if (intent.promptSignup) setShowSaveSetup(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [doc]);

	// Removing/resetting the page currently open in the workspace returns to the
	// overview instead of leaving an empty editor panel behind.
	useEffect(() => {
		if (selectedPage && !doc?.content.pages[selectedPage]) navigateHistoryPage(null, false);
		if (lastSelectedPage && !doc?.content.pages[lastSelectedPage]) setLastSelectedPage(null);
	}, [doc, selectedPage, lastSelectedPage, navigateHistoryPage]);

	// The workspace settings dialog is about one page; leaving that page closes it.
	useEffect(() => {
		setPageSettingsOpen(false);
	}, [selectedPage]);

	// Undo/redo can change page travel without going through openPageWorkspace.
	// Keep the live preview and expanded page group synchronized with that history.
	useEffect(() => {
		if (!selectedPage || !doc?.content.pages[selectedPage]) return;
		expandSection(selectedPage);
		showPreviewPage(selectedPage);
	}, [doc, selectedPage]);

	// Returning from checkout reloads the page onto the Start screen. If the buyer set out to
	// publish, resume their saved draft automatically so they land back in the editor (AccountControls
	// then reopens Publish once the license activates) instead of having to click "Continue" again.
	useEffect(() => {
		if (doc || !hasDraft) return;
		if (shouldResumePublish()) void resumeDraft();
	}, [doc, hasDraft, resumeDraft]);

	// Sign-in round-trips reopen the autosaved draft automatically instead of
	// dropping the artist onto the template picker: Google leaves the page and
	// returns (session flag), and a magic link opens the emailed link as a fresh
	// page load carrying ?magic_token (captured before the redirect handler
	// strips it).
	useEffect(() => {
		if (doc || !hasDraft) return;
		if (consumeReturnToEditorAfterAuth() || signInReturn) void resumeDraft();
	}, [doc, hasDraft, resumeDraft, signInReturn]);

	// One quiet confirmation once that sign-in lands, so "did it work?" never
	// hangs in the air.
	useEffect(() => {
		if (!signInReturn || account.status !== 'signed-in' || signInToastShownRef.current) return;
		signInToastShownRef.current = true;
		setSignInToast(
			`Signed in as ${account.user?.email ?? 'your account'} — your site is saved to this account.`,
		);
		const timer = window.setTimeout(() => setSignInToast(null), 6000);
		return () => window.clearTimeout(timer);
	}, [signInReturn, account.status, account.user?.email]);

	// Phones get the door + a read-only preview, never the canvas. Browsing, checkout,
	// and the auto-unlock-after-purchase flow above all still run on a phone — only
	// BUILDING is desktop work. Tablets pass straight through.
	if (phone) return <MobileDoor base={base} brandLockup={brandLockup} />;

	if (studio) {
		if (templateStudio?.status === 'unavailable' || templateStudio?.status === 'unknown')
			return (
				<div className="editor">
					<TemplateStudioUnavailable base={base} reason={templateStudio.status} />
				</div>
			);
		if (!doc || !templateStudio)
			return (
				<div className="editor">
					<div className="template-studio-empty">
						<p>Opening template…</p>
					</div>
				</div>
			);
	}

	if (!doc) return <StartScreen brandLockup={brandLockup} />;

	const resetAll = () => {
		if (confirm('Reset the editor? This permanently deletes your draft, uploaded files, and all saved versions in this browser. Download a backup first if you may need them.'))
			void reset();
	};

	const openPageWorkspace = (pageKey: string) => {
		if (!doc.content.pages[pageKey]) return;
		// Pure navigation stays out of the undo history — Cmd+Z should revert the
		// last CHANGE, not retrace page visits. Edits still return you to the page
		// they happened on, because every history snapshot carries its page key.
		navigateHistoryPage(pageKey, false);
		setLastSelectedPage(pageKey);
		pickTab('pages');
		if (controlsRef.current) controlsRef.current.scrollTop = 0;
	};

	const closePageWorkspace = () => {
		navigateHistoryPage(null, false);
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

	const customEditorStyle = uiCustom.enabled
		? ({
				'--paper': uiCustom.canvas,
				'--ink': uiCustom.text,
				'--ink-soft': `color-mix(in srgb, ${uiCustom.text} 66%, ${uiCustom.canvas})`,
				'--klein': uiCustom.accent,
				'--klein-dark': `color-mix(in srgb, ${uiCustom.accent} 78%, black)`,
				'--wall-1': `color-mix(in srgb, ${uiCustom.canvas} 90%, ${uiCustom.text})`,
				'--wall-2': `color-mix(in srgb, ${uiCustom.canvas} 78%, ${uiCustom.text})`,
				'--wall-3': `color-mix(in srgb, ${uiCustom.canvas} 84%, ${uiCustom.text})`,
				fontFamily: uiCustom.font,
			} as React.CSSProperties)
		: undefined;

	return (
		<div className={`editor ui-theme-${uiTheme}`} style={customEditorStyle}>
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
				{!studio && (
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
				)}
				<div className="history-actions" role="group" aria-label="Undo and redo">
					<button
						type="button"
						className="btn-ghost history-button"
						onClick={undo}
						disabled={!canUndo}
						aria-label="Undo the last change"
						title="Undo the last change (Command or Ctrl + Z)"
					>
						<PanelIcon type="undo" />
					</button>
					<button
						type="button"
						className="btn-ghost history-button"
						onClick={redo}
						disabled={!canRedo}
						aria-label="Redo the last undone change"
						title="Redo the last undone change (Command or Ctrl + Shift + Z)"
					>
						<PanelIcon type="redo" />
					</button>
				</div>
				{!studio && <AccountControls />}
				<TopbarMoreMenu
					onReset={studio ? undefined : resetAll}
					onShowTour={() => setTourReplayToken((token) => token + 1)}
					uiTheme={uiTheme}
					onUiTheme={pickUiTheme}
					uiCustom={uiCustom}
					onUiCustom={pickUiCustom}
				/>
			</header>

			{studio && templateStudio && <TemplateStudioBar studio={templateStudio} base={base} />}

			<div
				className={`editor-body view-${mobileView}${sidebarHidden ? ' sidebar-hidden' : ''}`}
				style={{ '--editor-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
			>
				<div className="editor-controls" ref={controlsRef}>
					<nav className="editor-tabs" aria-label="Editor categories">
						{(studio ? EDITOR_TABS.filter((t) => t.id !== 'publish') : EDITOR_TABS).map((t) => (
							<button
								key={t.id}
								type="button"
								className={`editor-tab ${tab === t.id ? 'active' : ''}`}
								title={t.title}
								aria-pressed={tab === t.id}
								data-tour={`tab-${t.id}`}
								onClick={() => pickTab(t.id)}
							>
								<span className="editor-tab-icon" aria-hidden="true">
									<PanelIcon type={t.icon} />
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
							<>
								<div className="page-workspace">
									<div className="page-workspace-nav" aria-label="Current page workspace">
										<button type="button" className="page-workspace-back" onClick={closePageWorkspace}>
											<PanelIcon type="back" />
											Pages
										</button>
										<strong className="page-workspace-title">{selectedChoice.label}</strong>
										<button
											type="button"
											className="pm-action page-workspace-settings"
											title="Page settings"
											aria-label={`Settings for ${selectedChoice.label}`}
											onClick={() => setPageSettingsOpen(true)}
										>
											<PanelIcon type="settings" />
										</button>
									</div>
									<AssetWorkbench />
									<PageEditor
										key={selectedPage}
										pageKey={selectedPage}
										nested={selectedChoice.nested}
										includeChildren={false}
									/>
									{pageSettingsOpen && (
										<PageSettingsModal
											pageKey={selectedPage}
											onClose={() => setPageSettingsOpen(false)}
										/>
									)}
								</div>
							</>
						) : (
							<>
								<PageManager onEditPage={openPageWorkspace} selectedPageKey={lastSelectedPage} />
								<AssetWorkbench />
							</>
						)}
					</div>
					<div className={`editor-tab-pane ${tab === 'store' ? 'active' : ''}`}>
						<StoreEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'design' ? 'active' : ''}`}>
						<DesignEditor />
					</div>
					<div className={`editor-tab-pane ${tab === 'site' ? 'active' : ''}`}>
						<SiteIdentityEditor />
						<FooterEditor />
						<SharingEditor />
					</div>
					{!studio && (
						<div className={`editor-tab-pane ${tab === 'publish' ? 'active' : ''}`}>
							<PublishPanel />
						</div>
					)}
				</div>
				<div
					className="editor-sidebar-resizer"
					role="separator"
					aria-label="Resize editing sidebar"
					aria-orientation="vertical"
					aria-valuemin={MIN_SIDEBAR_WIDTH}
					aria-valuemax={MAX_SIDEBAR_WIDTH}
					aria-valuenow={sidebarWidth}
					tabIndex={0}
					onPointerDown={startSidebarResize}
					onDoubleClick={() => saveSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
					onKeyDown={(event) => {
						if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
							event.preventDefault();
							saveSidebarWidth(sidebarWidth + (event.key === 'ArrowLeft' ? -20 : 20));
						} else if (event.key === 'Home') {
							event.preventDefault();
							saveSidebarWidth(MIN_SIDEBAR_WIDTH);
						} else if (event.key === 'End') {
							event.preventDefault();
							saveSidebarWidth(MAX_SIDEBAR_WIDTH);
						}
					}}
				/>
				<div className="editor-preview">
					<PreviewPanel
						base={base}
						canvasEditingEnabled={selectedPage !== null}
						onEditPage={openPageWorkspace}
						sidebarHidden={sidebarHidden}
						onToggleSidebar={toggleSidebar}
						openWorkbenchOnLaunch={intakeWorkbench}
						offerCropLightDemo={intakeFinishing}
						offerTemplatePickerOnLaunch={intakeOrganized}
						intakeStarterId={intakeStarterId}
					/>
				</div>
			</div>
			{signInToast && (
				<div className="editor-toast" role="status" aria-live="polite">
					{signInToast}
				</div>
			)}
			{/* Post-intake account door: one gentle ask, easy to defer. */}
			{!studio && showSaveSetup && account.status === 'signed-out' && (
				<SignInModal
					title="Save your setup"
					lead="Your site and answers live in this browser for now. A free account keeps them yours — publish when you're ready and pick up from any device. No password: Google, or a link we email you."
					closeLabel="Later"
					onClose={() => setShowSaveSetup(false)}
					sendMagicLink={account.sendMagicLink}
					signInWithGoogle={account.signInWithGoogle}
					googleEnabled={account.googleEnabled}
				/>
			)}
			{!studio && (
			<OnboardingTour
				replayToken={tourReplayToken}
				onSelectTab={pickTab}
				onSetView={setMobileView}
				onOpenPageBuilder={() => {
					const firstPage = doc.content.pages.home ? 'home' : pageChoices[0]?.key;
					if (firstPage) openPageWorkspace(firstPage);
				}}
				onExit={() => {
					setMobileView('edit');
					pickTab('pages');
				}}
				onFinish={() => {
					setMobileView('edit');
					const firstPage = doc.content.pages.home
						? 'home'
						: pageChoices[0]?.key;
					if (firstPage) openPageWorkspace(firstPage);
					else pickTab('pages');
				}}
			/>
			)}
		</div>
	);
}

export default function EditorApp({ base = '' }: { base?: string }) {
	// Resolved once per page load; the query param stays in the URL so a reload
	// re-enters the same studio session.
	const [studio] = useState(studioIntentFromLocation);
	return (
		<EditorProvider persistence={studio ? 'memory' : 'browser'}>
			{!studio && <CheckoutIntent />}
			<Shell base={base} studio={studio} />
		</EditorProvider>
	);
}
