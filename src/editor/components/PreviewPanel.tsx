import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildWorkbenchPages, useEditor, type WorkbenchBuildReport } from '../store';
import { WORKBENCH_FOLDER } from '../lib/image-transfer';
import Portfolio from '../../portfolio/Portfolio';
import { withBase } from '../../portfolio/types';
import PreviewEditLayer from './PreviewEditLayer';
import AssetWorkbench from './AssetWorkbench';
import CropLightDemo from './CropLightDemo';
import TemplatePicker from './TemplatePicker';
import { WorkbenchPicker } from './ImageCollectionEditor';
import { PanelIcon } from './ui/panel-icons';
import { docToPortfolioData } from '../lib/content-init';
import {
	hasSeenCropLightDemo,
	hasSeenWorkbenchBuildGuide,
	markCropLightDemoSeen,
	markWorkbenchBuildGuideSeen,
} from '../lib/onboarding';
import { pageGalleryConfigs } from '../../lib/content';
import { GUIDE_OPTIONS, guideById, setGridPrefs, toggleEdgeSnap, useGridPrefs } from '../../portfolio/gridPrefs';
import {
	onOpenTemplatePicker,
	onPreviewTypeMotion,
	selectPreviewBlock,
	onShowPreviewPage,
	showEditorTab,
	type TypeMotionPreviewRequest,
} from './ui/controls';

/** Canvas guide overlay + snap controls ("Guides", to not clash with the
 *  Freeform/Grid layout toggle). Lives in the preview toolbar so they're
 *  reachable no matter how far down the editing column is scrolled. */
function GuideTools() {
	const gridPrefs = useGridPrefs();
	const off = gridPrefs.guide === 'off';
	const activeOption = guideById(gridPrefs.guide);
	const activeGuide = off ? 'Off' : activeOption.label;
	return (
		<details className="canvas-tools">
			<summary
				className={`preview-tool-button canvas-tools-toggle${off ? '' : ' active'}`}
				aria-label={`Canvas guides, currently ${activeGuide}`}
				title={`Guides & snapping — currently ${activeGuide}`}
			>
				<PanelIcon type="guides" />
			</summary>
			<div className="canvas-tools-popover">
				<div className="canvas-tools-heading">
					<strong>Canvas guides</strong>
					<span>Editor-only alignment helpers</span>
				</div>
				<div className="grid-toolbar preview-grid-tools" role="group" aria-label="Canvas guide overlay">
					{GUIDE_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							className={`btn-icon btn-chip ${gridPrefs.guide === option.id ? 'active' : ''}`}
							onClick={() => setGridPrefs({ guide: option.id })}
							title={option.title}
							aria-pressed={gridPrefs.guide === option.id}
						>
							{option.label}
						</button>
					))}
					<label
						className={`guide-custom-columns${activeOption.kind === 'columns' ? ' active' : ''}`}
						title="Column guides with your own column count (2–12)"
					>
						<input
							type="number"
							min={2}
							max={12}
							placeholder="n"
							value={activeOption.kind === 'columns' ? activeOption.n : ''}
							aria-label="Custom column-guide count"
							onChange={(event) => {
								const n = Number(event.target.value);
								if (Number.isInteger(n) && n >= 2 && n <= 12)
									setGridPrefs({ guide: `col-${n}` });
							}}
						/>
						col
					</label>
				</div>
				<div className="canvas-snap-options">
					<label className={`grid-snap ${off ? 'disabled' : ''}`}>
						<input
							type="checkbox"
							checked={gridPrefs.snap && !off}
							disabled={off}
							onChange={(event) => setGridPrefs({ snap: event.target.checked })}
						/>
						Grid snap
					</label>
					<label className="grid-snap" title="Magnetically align a dragged item with its neighbors' edges (Shift+S)">
						<input
							type="checkbox"
							checked={gridPrefs.edgeSnap}
							onChange={(event) => setGridPrefs({ edgeSnap: event.target.checked })}
						/>
						Edge snap
					</label>
					<label className="grid-snap" title="Magnetically align a dragged item or selection with the horizontal page center">
						<input
							type="checkbox"
							checked={gridPrefs.centerSnap}
							onChange={(event) => setGridPrefs({ centerSnap: event.target.checked })}
						/>
						Center snap
					</label>
				</div>
			</div>
		</details>
	);
}

/** Shift+S toggles edge snap from anywhere in the editor (ignored while typing). */
function useEdgeSnapShortcut() {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 's' || !e.shiftKey) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
			e.preventDefault();
			toggleEdgeSnap();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
}

/**
 * Renders the portfolio inside a real iframe — its own document AND viewport —
 * so the site's media queries respond to the phone's width instead of the
 * editor window's. The iframe head gets a viewport meta plus a clone of every
 * stylesheet the editor page loaded (portfolio CSS included, via preview.css);
 * the tree renders into its own React root, re-rendered with fresh props on
 * every editor change.
 */
function DeviceFrame({
	children,
	title,
	className = '',
	onEscape,
	onUndo,
	onRedo,
	openTextLinksInNewTab = false,
	typeMotionPreview,
}: {
	children: React.ReactElement;
	title: string;
	className?: string;
	onEscape?: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
	openTextLinksInNewTab?: boolean;
	typeMotionPreview?: TypeMotionPreviewRequest;
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const rootRef = useRef<Root | null>(null);
	const [frameLoaded, setFrameLoaded] = useState(false);
	const [ready, setReady] = useState(false);
	const onEscapeRef = useRef(onEscape);
	onEscapeRef.current = onEscape;
	const onUndoRef = useRef(onUndo);
	const onRedoRef = useRef(onRedo);
	const openTextLinksRef = useRef(openTextLinksInNewTab);
	onUndoRef.current = onUndo;
	onRedoRef.current = onRedo;
	openTextLinksRef.current = openTextLinksInNewTab;

	useEffect(() => {
		if (!frameLoaded) return;
		const doc = iframeRef.current?.contentDocument;
		if (!doc) return;
		const meta = doc.createElement('meta');
		meta.name = 'viewport';
		meta.content = 'width=device-width, initial-scale=1';
		doc.head.appendChild(meta);
		for (const node of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
			doc.head.appendChild(doc.importNode(node, true));
		}
		const reset = doc.createElement('style');
		reset.textContent = 'html,body{margin:0;padding:0;min-height:100%;background:var(--color-bg,#fff);}';
		doc.head.appendChild(reset);
		const mount = doc.createElement('div');
		doc.body.appendChild(mount);
		const root = createRoot(mount);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !event.defaultPrevented) onEscapeRef.current?.();
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.tagName === 'SELECT' ||
					target.isContentEditable)
			)
				return;
			const key = event.key.toLowerCase();
			if (key === 'z') {
				event.preventDefault();
				if (event.shiftKey) onRedoRef.current?.();
				else onUndoRef.current?.();
			} else if (key === 'y') {
				event.preventDefault();
				onRedoRef.current?.();
			}
		};
		const onClick = (event: MouseEvent) => {
			if (!openTextLinksRef.current) return;
			const target = event.target as Element | null;
			const anchor = target?.closest<HTMLAnchorElement>('.text-block-content a[href]');
			if (!anchor) return;
			event.preventDefault();
			event.stopPropagation();
			const opened = doc.defaultView?.open(anchor.href, '_blank', 'noopener,noreferrer');
			if (opened) opened.opener = null;
		};
		doc.addEventListener('keydown', onKeyDown);
		doc.addEventListener('click', onClick, true);
		rootRef.current = root;
		setReady(true);
		return () => {
			doc.removeEventListener('keydown', onKeyDown);
			doc.removeEventListener('click', onClick, true);
			rootRef.current = null;
			// Unmount async — React disallows synchronous root unmounts from cleanup.
			setTimeout(() => root.unmount(), 0);
		};
	}, [frameLoaded]);

	useEffect(() => {
		if (!frameLoaded) return;
		const doc = iframeRef.current?.contentDocument;
		if (!doc) return;
		const selectBlock = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			const element = target?.closest<HTMLElement>('[data-preview-block]');
			const blockId = element?.dataset.previewBlock?.split('::', 1)[0];
			const pageKey =
				element?.dataset.previewPage ??
				element?.parentElement?.closest<HTMLElement>('[data-preview-page]')?.dataset.previewPage;
			// Which artwork, not just which block: canvas items carry their entry id
			// in the selection key; grid items are matched later by the img src.
			const canvasKey = target?.closest<HTMLElement>('[data-canvas-selection-key]')
				?.dataset.canvasSelectionKey;
			const imageId = canvasKey?.startsWith('image:')
				? canvasKey.slice('image:'.length)
				: undefined;
			const imageSrc =
				target?.tagName === 'IMG' ? target.getAttribute('src') ?? undefined : undefined;
			// Canvas widgets can sit inside a different block's freeform host. Let
			// React finish the pointer event first, then make the closest marker the
			// authoritative selection so the host cannot overwrite its child.
			if (blockId && pageKey)
				queueMicrotask(() => selectPreviewBlock(pageKey, blockId, { imageId, imageSrc }));
		};
		doc.addEventListener('pointerdown', selectBlock, true);
		return () => doc.removeEventListener('pointerdown', selectBlock, true);
	}, [frameLoaded]);

	useEffect(() => {
		if (ready) rootRef.current?.render(children);
	});

	useEffect(() => {
		if (!ready || !typeMotionPreview) return;
		const frameWindow = iframeRef.current?.contentWindow;
		const doc = iframeRef.current?.contentDocument;
		if (!frameWindow || !doc) return;
		let restoreFrame = 0;
		const frame = frameWindow.requestAnimationFrame(() => {
			const target = doc.querySelector<HTMLElement>(
				`[data-kinetic-target="${CSS.escape(typeMotionPreview.target)}"]`,
			);
			if (!target) return;
			target.scrollIntoView({
				behavior: frameWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'auto'
					: 'smooth',
				block: 'center',
			});
			// Briefly remove the animation declaration, force style resolution,
			// then restore it. This reliably replays words, letters, lines, and
			// the continuous marquee without changing saved content.
			target.classList.add('kinetic-preview-reset');
			void target.offsetWidth;
			// Restore on the following paint. Removing the reset class in the same
			// frame is coalesced by some browsers, so the animation never restarts.
			restoreFrame = frameWindow.requestAnimationFrame(() => {
				target.classList.remove('kinetic-preview-reset');
				for (const unit of target.querySelectorAll<HTMLElement>('.kinetic-unit, .kinetic-marquee-track')) {
					unit.style.animationPlayState = 'running';
				}
			});
		});
		return () => {
			frameWindow.cancelAnimationFrame(frame);
			if (restoreFrame) frameWindow.cancelAnimationFrame(restoreFrame);
		};
	}, [ready, typeMotionPreview]);

	return (
		<iframe
			ref={iframeRef}
			className={`device-frame ${className}`}
			title={title}
			src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/editor-preview-frame.html`}
			onLoad={() => setFrameLoaded(true)}
		/>
	);
}

/** A real desktop viewport even when the editor itself is open on a narrow
 * screen. It scales to fit without activating the portfolio's phone queries. */
function DesktopDeviceFrame({
	children,
	onEscape,
	onUndo,
	onRedo,
	openTextLinksInNewTab,
	typeMotionPreview,
	remeasureKey,
}: {
	children: React.ReactElement;
	onEscape?: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
	openTextLinksInNewTab?: boolean;
	typeMotionPreview?: TypeMotionPreviewRequest;
	/** Layout switches that resize the host outside its own render (fullscreen,
	 * hiding the sidebar). Remeasuring on the switch itself keeps the frame
	 * correct even when the ResizeObserver notification for the jump is lost —
	 * the expanded preview must render the same regardless of prior panel state. */
	remeasureKey?: string;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 1100, height: 700 });
	// The site is laid out at the width it would occupy in THIS browser window —
	// the same width whether the frame sits in the panel (scaled down to fit) or
	// fullscreen (host == window, scale 1). Sharing one layout width is what
	// keeps the editing canvas and the fullscreen preview identical: canvas
	// geometry is %-of-width while type is fixed-size, so two hosts given
	// different layout widths genuinely disagree about where text lands.
	const [windowWidth, setWindowWidth] = useState(() =>
		typeof window !== 'undefined' ? window.innerWidth : 1100,
	);
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const update = () => {
			setWindowWidth(window.innerWidth);
			const box = host.getBoundingClientRect();
			if (box.width && box.height) setSize({ width: box.width, height: box.height });
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(host);
		window.addEventListener('resize', update);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', update);
		};
	}, [remeasureKey]);
	const viewportWidth = Math.max(1100, windowWidth);
	const scale = Math.min(1, size.width / viewportWidth);
	const viewportHeight = Math.max(600, size.height / scale);
	return (
		<div ref={hostRef} className="desktop-frame-host">
			<div
				className="desktop-frame-scaled"
				style={{ width: viewportWidth, height: viewportHeight, transform: `scale(${scale})` }}
			>
				<DeviceFrame
					title="Desktop preview"
					className="desktop-device-frame"
					onEscape={onEscape}
					onUndo={onUndo}
					onRedo={onRedo}
					openTextLinksInNewTab={openTextLinksInNewTab}
					typeMotionPreview={typeMotionPreview}
				>
					{children}
				</DeviceFrame>
			</div>
		</div>
	);
}

/** Live preview — renders the SAME shared portfolio components as the real site.
 *  Navigation happens through the site's own nav (sidebar, logo, sub-page cards);
 *  clicking it also opens that page in the selected-page workspace. In the
 *  default desktop view galleries are live (drag to move/resize); the phone view
 *  and the fullscreen view render exactly what the published site will show. */
export default function PreviewPanel({
	base,
	canvasEditingEnabled,
	onEditPage,
	sidebarHidden,
	onToggleSidebar,
	openWorkbenchOnLaunch,
	offerCropLightDemo,
	offerTemplatePickerOnLaunch,
	intakeStarterId,
}: {
	base: string;
	canvasEditingEnabled: boolean;
	onEditPage: (pageKey: string) => void;
	/** The editing column can step aside; the toggle lives in this toolbar. */
	sidebarHidden?: boolean;
	onToggleSidebar?: () => void;
	/** Start-intake answer: open the floating workbench as the editor appears. */
	openWorkbenchOnLaunch?: boolean;
	/** Start-intake answer: photos need a crop or light pass, so the workbench
	 * first run leads with the practice-run offer instead of the quiet link. */
	offerCropLightDemo?: boolean;
	/** Start-intake answer "already organized": no workbench pass, so the
	 * landing-look picker opens with the editor instead of after the build. */
	offerTemplatePickerOnLaunch?: boolean;
	/** Which starter the intake applied (null = blank) — chooses the sample
	 * artwork that dresses series pages when the artist leaves with no photos,
	 * and which discipline's looks lead the template picker. */
	intakeStarterId?: string | null;
}) {
	const editor = useEditor();
	const { doc } = editor;
	const [page, setPage] = useState('home');
	const [device, setDevice] = useState<'desktop' | 'phone'>(() =>
		typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches ? 'phone' : 'desktop',
	);
	const [fullscreen, setFullscreen] = useState(false);
	const [typeMotionPreview, setTypeMotionPreview] =
		useState<TypeMotionPreviewRequest>();
	/** The text block currently being edited in place on the page, if any. */
	const [inlineTextId, setInlineTextId] = useState<string | null>(null);
	/** Floating workbench window (organize/upload), toggled from the toolbar. */
	const [workbenchOpen, setWorkbenchOpen] = useState(false);
	/** Floating chooser filling a new solo-image block from the workbench. */
	const [workbenchPickFolder, setWorkbenchPickFolder] = useState<string | null>(null);
	/** First-run guidance: the intake's "sort it here" answer opens the
	 * workbench big and centered, with one clear instruction. */
	const [workbenchIntro, setWorkbenchIntro] = useState(false);
	/** The intake session's one-time build offer: the "OK — build my pages"
	 * footer stays on the floating workbench until the build (or the zero-photo
	 * sample head start) has happened. */
	const [buildOffer, setBuildOffer] = useState(false);
	/** The post-build panel: the run's report, plus the one-time quick guide of
	 * core editor moves (shown once ever — dismissing retires it for good). */
	const [buildGuide, setBuildGuide] = useState<{
		report: WorkbenchBuildReport;
		tour: boolean;
	} | null>(null);
	/** The crop & light practice run. Opens only from its offer or the quiet
	 * link — never on its own — and one look (or one decline) retires the
	 * prominent offer for good. */
	const [cropDemoOpen, setCropDemoOpen] = useState(false);
	const [cropDemoSeen, setCropDemoSeen] = useState(hasSeenCropLightDemo);
	const retireCropDemoOffer = () => {
		markCropLightDemoSeen();
		setCropDemoSeen(true);
	};
	const closeCropDemo = () => {
		setCropDemoOpen(false);
		retireCropDemoOffer();
	};
	/** The landing-look picker (BACKLOG spec 11): opens once after the build
	 * hangs the first pages — or with the editor for organized intakes — and
	 * any time from the Theme panel's link. Applying is live behind the panel;
	 * closing keeps whatever hangs now. */
	const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
	const templatePickerOffered = useRef(false);
	const offerTemplatePicker = () => {
		if (templatePickerOffered.current) return;
		templatePickerOffered.current = true;
		setTemplatePickerOpen(true);
	};
	// A "sort it here" intake answer opens the workbench with the editor.
	useEffect(() => {
		if (openWorkbenchOnLaunch) {
			setWorkbenchOpen(true);
			setWorkbenchIntro(true);
			setBuildOffer(true);
		}
	}, [openWorkbenchOnLaunch]);
	// "Already organized" skips the workbench, so the look choice comes first.
	useEffect(() => {
		if (offerTemplatePickerOnLaunch) offerTemplatePicker();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [offerTemplatePickerOnLaunch]);
	useEffect(() => onOpenTemplatePicker(() => setTemplatePickerOpen(true)), []);
	const gridPrefs = useGridPrefs();
	// Dry run of the build against the live document: whether the button does
	// anything is DERIVED from what the folders and pages hold right now — no
	// stored flag, so a build that already happened simply has nothing to do.
	const buildPreview = useMemo(
		() => (buildOffer && doc ? buildWorkbenchPages(doc, intakeStarterId).report : null),
		[buildOffer, doc, intakeStarterId],
	);
	const buildReady = (buildPreview?.built.length ?? 0) > 0;

	// In-place editing is per page and per editing mode; leaving either ends it,
	// as does the block disappearing (undo, delete).
	useEffect(() => {
		setInlineTextId(null);
	}, [page, device, fullscreen, canvasEditingEnabled]);
	useEffect(() => {
		if (!inlineTextId) return;
		const currentPage = doc?.content.pages[doc.content.pages[page] ? page : 'home'];
		if (!currentPage?.blocks?.some((block) => block.id === inlineTextId))
			setInlineTextId(null);
	}, [doc, page, inlineTextId]);

	useEdgeSnapShortcut();

	useEffect(() => onShowPreviewPage((pageKey) => setPage(pageKey)), []);
	useEffect(
		() =>
			onPreviewTypeMotion((request) => {
				setPage(request.pageKey);
				setTypeMotionPreview(request);
			}),
		[],
	);

	// Esc leaves the fullscreen site preview.
	useEffect(() => {
		if (!fullscreen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setFullscreen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [fullscreen]);

	if (!doc) return null;

	const data = docToPortfolioData(doc);
	const currentKey = doc.content.pages[page] ? page : 'home';
	// Editing (drag/resize) happens in the plain desktop view; the phone and
	// fullscreen views show the published site's exact behavior instead.
	const editable = device === 'desktop' && !fullscreen && canvasEditingEnabled;
	const resizeBreakpoint = fullscreen || !gridPrefs.sectionEdges ? undefined : device;
	const currentPage = doc.content.pages[currentKey];
	const hasFreeformCanvas = pageGalleryConfigs(currentPage).some(
		(config) => config.layout !== 'grid' && (doc.galleries[config.folder]?.length ?? 0) > 0,
	) || !!doc.content.profile.imageLayout;

	const navigate = (path: string) => {
		const key = path === '' ? 'home' : path;
		setPage(key);
		if (fullscreen) return;
		onEditPage(key);
	};

	const openBuildGuide = (report: WorkbenchBuildReport) => {
		const tour = !hasSeenWorkbenchBuildGuide();
		markWorkbenchBuildGuideSeen();
		setBuildGuide({ report, tour });
	};
	/** Dismissing the build guide hands off to the landing-look picker: the
	 * wall just got its first pages, so "pick a look" is the natural next move. */
	const closeBuildGuide = () => {
		const report = buildGuide?.report;
		setBuildGuide(null);
		if (report && (report.built.length || report.sampled.length)) offerTemplatePicker();
	};
	/** "OK — build my pages": the one-time build, then home with the result. */
	const runWorkbenchBuild = () => {
		const report = editor.buildPagesFromWorkbench(intakeStarterId);
		setBuildOffer(false);
		setWorkbenchIntro(false);
		setWorkbenchOpen(false);
		navigate('home');
		if (report) openBuildGuide(report);
	};
	/** Leaving the workbench during the intake session. With no photos uploaded
	 * at all, the intake's "a page for each series" promise is still kept: empty
	 * series pages get a rights-cleared sample head start. */
	const closeWorkbenchSession = () => {
		const report =
			(doc?.galleries[WORKBENCH_FOLDER]?.length ?? 0) === 0
				? editor.buildPagesFromWorkbench(intakeStarterId)
				: null;
		setWorkbenchIntro(false);
		setWorkbenchOpen(false);
		if (report?.sampled.length) {
			setBuildOffer(false);
			navigate('home');
			openBuildGuide(report);
		}
	};

	const portfolio = (
		<Portfolio
			page={currentKey}
			content={data.content}
			galleries={data.galleries}
			profileImageSrc={data.profileImageSrc}
			logoImageSrc={data.logoImageSrc}
			pageThumbs={data.pageThumbs}
			productImageSrcs={data.productImageSrcs}
			fontFaces={data.fontFaces}
			resumeHref={data.resumeHref}
			base={base}
			onNavigate={navigate}
			onImageLayout={editable ? (folder, id, layout) => editor.updateGalleryMeta(folder, id, { layout }) : undefined}
			onImageMount={
				editable
					? (folder, id, mount) => {
							const entry = editor.doc?.galleries[folder]?.find((candidate) => candidate.id === id);
							const effects = { ...(entry?.meta.effects ?? {}) };
							if (mount) effects.mount = mount;
							else delete effects.mount;
							editor.updateGalleryMeta(folder, id, {
								effects: Object.keys(effects).length ? effects : undefined,
							});
						}
					: undefined
			}
			onProfileImageLayout={editable ? (layout) => editor.setProfileImagePresentation({ imageLayout: layout }) : undefined}
			onProfileContentLayout={editable ? (layout) => editor.setProfileImagePresentation({ contentLayout: layout }) : undefined}
			onTextLayout={editable ? (pageKey, blockId, layout) => editor.setTextLayout(pageKey, blockId, layout) : undefined}
			onEmbedLayout={
				editable ? (pageKey, blockId, layout) => editor.setEmbedLayout(pageKey, blockId, layout) : undefined
			}
			onEmbedFlowLayout={
				editable
					? (pageKey, blockId, layout) =>
							editor.setEmbedFlowLayout(pageKey, blockId, layout)
					: undefined
			}
			onCanvasLayouts={
				editable
					? (pageKey, folder, updates) =>
							editor.applyCanvasLayouts(pageKey, folder, updates)
					: undefined
			}
			onDeleteCanvasItems={
				editable
					? (pageKey, folder, selection) =>
							editor.deleteCanvasItems(pageKey, folder, selection)
					: undefined
			}
			onCarouselFrame={
				editable
					? (pageKey, blockId, layout) =>
							editor.updateImagesBlock(pageKey, blockId, { carouselFrame: layout })
					: undefined
			}
			onWidgetLayout={
				editable
					? (pageKey, blockId, layout) =>
							editor.setWidgetLayout(pageKey, blockId, layout)
					: undefined
			}
			onChildItemLayout={
				editable
					? (pageKey, blockId, itemId, layout) => {
							const block = doc.content.pages[pageKey]?.blocks?.find(
								(candidate) => candidate.id === blockId,
							);
							if (!block || block.type !== 'children') return;
							editor.updateChildrenBlock(pageKey, blockId, {
								items: (block.items ?? []).map((item) =>
									item.id === itemId ? { ...item, layout } : item,
								),
							});
						}
					: undefined
			}
			onChildCardLabel={
				editable
					? (pageKey, blockId, itemId, label) =>
							editor.renameChildCard(pageKey, blockId, itemId, label)
					: undefined
			}
			onCarouselHost={
				editable
					? (pageKey, blockId, hostId, layout) =>
							editor.updateImagesBlock(pageKey, blockId, {
								carouselHost: hostId,
								carouselFrame: layout,
							})
					: undefined
			}
			onCarouselFocus={
				editable
					? (folder, id, focusX, focusY) =>
							editor.updateGalleryMeta(folder, id, { focusX, focusY })
					: undefined
			}
			onCarouselZoom={editable ? (folder, id, zoom) => editor.updateGalleryMeta(folder, id, { cropZoom: zoom }) : undefined}
			resizeBreakpoint={resizeBreakpoint}
			onSectionHeight={
				resizeBreakpoint
					? (pageKey, partKey, breakpoint, height, viewportHeight, gap, recordHistory) =>
							editor.setSectionHeight(
								pageKey,
								partKey,
								breakpoint,
								height,
								viewportHeight,
								gap,
								recordHistory,
							)
					: undefined
			}
			onFooterHeight={
				resizeBreakpoint
					? (breakpoint, height) => editor.setFooterHeight(breakpoint, height)
					: undefined
			}
			onFooterImageLayout={editable ? (layout) => editor.setFooterImageLayout(layout) : undefined}
			onPageHeadingPosition={
				editable
					? (x, y) => editor.setTheme({ pageHeadingX: x, pageHeadingY: y })
					: undefined
			}
			editorPreview={!fullscreen}
			onSelectBlock={(pageKey, blockId) => selectPreviewBlock(pageKey, blockId)}
			inlineTextEditing={
				editable && inlineTextId
					? {
							blockId: inlineTextId,
							onChange: (plain, rich) =>
								editor.updateRichTextBlock(currentKey, inlineTextId, plain, rich),
							onDone: () => setInlineTextId(null),
						}
					: undefined
			}
		/>
	);

	return (
		<div className={`preview ${fullscreen ? 'preview-fullscreen' : ''}`}>
			<div className="preview-toolbar" data-tour="preview-toolbar">
				{onToggleSidebar && !fullscreen && (
					<button
						type="button"
						className={`preview-tool-button${sidebarHidden ? ' active' : ''}`}
						aria-pressed={sidebarHidden}
						aria-label={sidebarHidden ? 'Show the editing panel' : 'Hide the editing panel'}
						title={sidebarHidden ? 'Show panel' : 'Hide panel'}
						onClick={onToggleSidebar}
					>
						<PanelIcon type={sidebarHidden ? 'panel-open' : 'panel-collapse'} />
					</button>
				)}
				<div className="device-toggle" role="group" aria-label="Preview device">
					<button
						type="button"
						className={`preview-tool-button ${device === 'desktop' ? 'active' : ''}`}
						aria-pressed={device === 'desktop'}
						aria-label="Desktop preview"
						title="Desktop preview"
						onClick={() => setDevice('desktop')}
					>
						<PanelIcon type="monitor" />
					</button>
					<button
						type="button"
						className={`preview-tool-button ${device === 'phone' ? 'active' : ''}`}
						aria-pressed={device === 'phone'}
						aria-label="Phone preview"
						title="Phone preview"
						onClick={() => setDevice('phone')}
					>
						<PanelIcon type="phone" />
					</button>
				</div>
				{editable && hasFreeformCanvas && <GuideTools />}
				{!fullscreen && (
					<button
						type="button"
						className={`preview-tool-button${gridPrefs.sectionEdges ? ' active' : ''}`}
						aria-pressed={gridPrefs.sectionEdges}
						aria-label="Section edges and resize handles"
						title="Show section boundaries and resize handles in the preview"
						onClick={() => setGridPrefs({ sectionEdges: !gridPrefs.sectionEdges })}
					>
						<PanelIcon type="edges" />
					</button>
				)}
				{!fullscreen && (
					<button
						type="button"
						className={`preview-tool-button${workbenchOpen ? ' active' : ''}`}
						aria-pressed={workbenchOpen}
						aria-label="Image workbench"
						title="Image workbench — upload and organize photos in a floating window"
						onClick={() => setWorkbenchOpen((open) => !open)}
					>
						<PanelIcon type="workbench" />
					</button>
				)}
				{sidebarHidden && !fullscreen && (
					<button
						type="button"
						className="preview-tool-button"
						aria-label="Open Design"
						title="Design — colors, fonts & effects"
						onClick={() => showEditorTab('design')}
					>
						<PanelIcon type="design" />
					</button>
				)}
				{fullscreen && (
					<span className="preview-fullscreen-note">
						Shown exactly as your published site
					</span>
				)}
				<span className="preview-toolbar-spacer" />
				<button
					type="button"
					className={`preview-tool-button preview-expand${fullscreen ? ' preview-expand-labeled' : ''}`}
					onClick={() => setFullscreen((f) => !f)}
					aria-label={fullscreen ? 'Back to the editor' : 'Preview your published site fullscreen'}
					title={fullscreen ? 'Back to the editor (Esc)' : 'Preview your published site fullscreen'}
				>
					<PanelIcon type={fullscreen ? 'close' : 'expand'} />
					{fullscreen && 'Back to editor'}
				</button>
			</div>
			{/* Floating workbench: the same organizer, in a window over the page.
			    In intro mode it takes center stage with one clear instruction. */}
			{workbenchOpen && workbenchIntro && !fullscreen && (
				<div
					className="floating-panel-backdrop"
					aria-hidden="true"
					onClick={() => setWorkbenchIntro(false)}
				/>
			)}
			{workbenchOpen && !fullscreen && (
				<div
					className={`floating-panel floating-workbench${workbenchIntro ? ' floating-workbench-guided' : ''}`}
					role="dialog"
					aria-label="Image workbench"
				>
					<header className="floating-panel-head">
						<strong>
							<PanelIcon type="workbench" />
							Image workbench
						</strong>
						<button
							type="button"
							className="pv-icon-button"
							aria-label="Close the workbench"
							title="Close"
							onClick={() => {
								if (buildOffer) {
									closeWorkbenchSession();
									return;
								}
								setWorkbenchOpen(false);
								setWorkbenchIntro(false);
							}}
						>
							<PanelIcon type="close" />
						</button>
					</header>
					{workbenchIntro && (
						<div className="floating-panel-guide">
							<strong>Drop everything in here</strong>
							<p>
								Upload your photos, then sort them into folders — one folder per series
								hangs beautifully. Cropping and light live on every photo's Edit.
							</p>
							{offerCropLightDemo && !cropDemoSeen ? (
								<div className="floating-panel-demo-offer">
									<p>
										<strong>Photos need a finishing pass?</strong> Practice the
										one-minute fix — crop and light — on a sample shot first.
									</p>
									<div className="floating-panel-demo-offer-actions">
										<button
											type="button"
											className="btn-secondary"
											onClick={() => setCropDemoOpen(true)}
										>
											Try it on a sample
										</button>
										<button type="button" className="btn-ghost" onClick={retireCropDemoOffer}>
											No thanks
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									className="btn-link floating-panel-demo-link"
									onClick={() => setCropDemoOpen(true)}
								>
									See how crop &amp; light works
								</button>
							)}
						</div>
					)}
					<div className="floating-panel-body">
						<AssetWorkbench chrome="floating" />
					</div>
					{buildOffer && (
						<footer className="floating-panel-guide-foot workbench-build-foot">
							<p className="workbench-build-hint">
								A head start, not a deadline — you can add or re-sort photos
								any time after your pages are built.
							</p>
							<div className="workbench-build-actions">
								<button
									type="button"
									className="btn-ghost"
									onClick={closeWorkbenchSession}
								>
									Done for now
								</button>
								<button
									type="button"
									className="btn-primary"
									disabled={!buildReady}
									title={
										buildReady
											? 'Hang each folder on its page — Selected works fills the home page'
											: 'Sort at least one photo into a folder first'
									}
									onClick={runWorkbenchBuild}
								>
									OK — build my pages
								</button>
							</div>
						</footer>
					)}
				</div>
			)}
			{cropDemoOpen && (
				<CropLightDemo
					src={withBase(base, 'assets/demo/crop-light-sample.jpg')}
					onClose={closeCropDemo}
				/>
			)}
			{buildGuide && !fullscreen && (
				<>
					<div
						className="floating-panel-backdrop"
						aria-hidden="true"
						onClick={closeBuildGuide}
					/>
					<div
						className="floating-panel workbench-build-guide"
						role="dialog"
						aria-label="Your first pages are hung"
					>
						<header className="floating-panel-head">
							<strong>
								<PanelIcon type="workbench" />
								Your first pages are hung
							</strong>
							<button
								type="button"
								className="pv-icon-button"
								aria-label="Close this guide"
								title="Close"
								onClick={closeBuildGuide}
							>
								<PanelIcon type="close" />
							</button>
						</header>
						<div className="floating-panel-body workbench-build-guide-body">
							{buildGuide.report.built.length > 0 && (
								<p>
									Your photos are on their pages:{' '}
									{buildGuide.report.built
										.map((item) => `${item.pageLabel} (${item.count})`)
										.join(', ')}
									.
								</p>
							)}
							{buildGuide.report.sampled.length > 0 && (
								<p>
									No photos yet, so{' '}
									{buildGuide.report.sampled.map((item) => item.pageLabel).join(', ')}{' '}
									{buildGuide.report.sampled.length === 1 ? 'shows' : 'show'} labeled
									sample works for now — rehang them with your own whenever you're
									ready.
								</p>
							)}
							{buildGuide.report.skipped.length > 0 && (
								<p>
									Left untouched (already holding images):{' '}
									{buildGuide.report.skipped.map((item) => item.pageLabel).join(', ')}.
								</p>
							)}
							{buildGuide.tour && (
								<ul className="workbench-build-moves">
									<li>
										<strong>Add images</strong> — drop photos onto any page, or open
										the image workbench from the preview toolbar.
									</li>
									<li>
										<strong>Arrange the wall</strong> — drag and resize pieces right
										on the page.
									</li>
									<li>
										<strong>Pages</strong> — the Pages tab lists every page; open one
										to edit it.
									</li>
									<li>
										<strong>Publish</strong> — the Publish tab puts your site at its
										own address when you're ready.
									</li>
								</ul>
							)}
							<p className="workbench-build-hint">
								This build was a head start, not a deadline — add or re-sort photos
								any time, and every page stays yours to rehang.
							</p>
						</div>
						<footer className="floating-panel-guide-foot">
							<button
								type="button"
								className="btn-primary"
								onClick={closeBuildGuide}
							>
								Start hanging
							</button>
						</footer>
					</div>
				</>
			)}
			{templatePickerOpen && !fullscreen && (
				<TemplatePicker
					intakeStarterId={intakeStarterId}
					onApplied={() => setPage('home')}
					onClose={() => setTemplatePickerOpen(false)}
				/>
			)}
			{workbenchPickFolder && !fullscreen && (
				<div className="floating-panel floating-workbench" role="dialog" aria-label="Choose an image from the workbench">
					<header className="floating-panel-head">
						<strong>
							<PanelIcon type="workbench" />
							Choose from the workbench
						</strong>
						<button
							type="button"
							className="pv-icon-button"
							aria-label="Done choosing images"
							title="Done"
							onClick={() => setWorkbenchPickFolder(null)}
						>
							<PanelIcon type="close" />
						</button>
					</header>
					<div className="floating-panel-body">
						<WorkbenchPicker targetFolder={workbenchPickFolder} />
					</div>
				</div>
			)}
			{device === 'phone' ? (
				<div className="preview-surface phone-surface">
					<div className="phone-frame">
						<DeviceFrame
							title="Phone preview"
							onEscape={fullscreen ? () => setFullscreen(false) : undefined}
							onUndo={editor.undo}
							onRedo={editor.redo}
							openTextLinksInNewTab={!fullscreen}
							typeMotionPreview={typeMotionPreview}
						>
							{portfolio}
						</DeviceFrame>
					</div>
				</div>
			) : (
				<div className="preview-surface desktop-surface">
					<DesktopDeviceFrame
						onEscape={fullscreen ? () => setFullscreen(false) : undefined}
						onUndo={editor.undo}
						onRedo={editor.redo}
						openTextLinksInNewTab={!fullscreen}
						typeMotionPreview={typeMotionPreview}
						remeasureKey={`${fullscreen ? 'full' : 'framed'}:${sidebarHidden ? 'solo' : 'panel'}`}
					>
						<>
							{portfolio}
							{editable && (
								<PreviewEditLayer
									doc={doc}
									pageKey={currentKey}
									editor={editor}
									onEditBlock={(blockId) => selectPreviewBlock(currentKey, blockId)}
									inlineTextId={inlineTextId}
									onInlineTextEdit={setInlineTextId}
									onInlineTextDone={() => setInlineTextId(null)}
									onPickFromWorkbench={(folder) => setWorkbenchPickFolder(folder)}
								/>
							)}
						</>
					</DesktopDeviceFrame>
				</div>
			)}
		</div>
	);
}
