import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEditor } from '../store';
import Portfolio from '../../portfolio/Portfolio';
import { docToPortfolioData } from '../lib/content-init';
import { GUIDE_OPTIONS, setGridPrefs, toggleEdgeSnap, useGridPrefs } from '../../portfolio/gridPrefs';
import { expandSection, onShowPreviewPage, showEditorTab } from './ui/controls';

/** Canvas guide overlay + snap controls ("Guides", to not clash with the
 *  Freeform/Grid layout toggle). Lives in the preview toolbar so they're
 *  reachable no matter how far down the editing column is scrolled. */
function GuideTools() {
	const gridPrefs = useGridPrefs();
	const off = gridPrefs.guide === 'off';
	return (
		<div className="grid-toolbar preview-grid-tools" role="group" aria-label="Canvas guide overlay">
			<span
				className="grid-tools-label"
				title="Guide overlay for lining things up — never shown on your site. Numbers are squares; “col” options match the Grid layout's columns."
			>
				Guides
			</span>
			{GUIDE_OPTIONS.map((o) => (
				<button
					key={o.id}
					type="button"
					className={`btn-icon btn-chip ${gridPrefs.guide === o.id ? 'active' : ''}`}
					onClick={() => setGridPrefs({ guide: o.id })}
					title={o.title}
				>
					{o.label}
				</button>
			))}
			<label className={`grid-snap ${off ? 'disabled' : ''}`}>
				<input
					type="checkbox"
					checked={gridPrefs.snap && !off}
					disabled={off}
					onChange={(e) => setGridPrefs({ snap: e.target.checked })}
				/>
				Snap
			</label>
			<label className="grid-snap" title="Magnetically align a dragged item with its neighbors' edges (Shift+S)">
				<input
					type="checkbox"
					checked={gridPrefs.edgeSnap}
					onChange={(e) => setGridPrefs({ edgeSnap: e.target.checked })}
				/>
				Edge snap
			</label>
			<label className="grid-snap" title="Magnetically align a dragged item or selection with the horizontal page center">
				<input
					type="checkbox"
					checked={gridPrefs.centerSnap}
					onChange={(e) => setGridPrefs({ centerSnap: e.target.checked })}
				/>
				Center snap
			</label>
		</div>
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
}: {
	children: React.ReactElement;
	title: string;
	className?: string;
	onEscape?: () => void;
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const rootRef = useRef<Root | null>(null);
	const [ready, setReady] = useState(false);
	const onEscapeRef = useRef(onEscape);
	onEscapeRef.current = onEscape;

	useEffect(() => {
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
		};
		doc.addEventListener('keydown', onKeyDown);
		rootRef.current = root;
		setReady(true);
		return () => {
			doc.removeEventListener('keydown', onKeyDown);
			rootRef.current = null;
			// Unmount async — React disallows synchronous root unmounts from cleanup.
			setTimeout(() => root.unmount(), 0);
		};
	}, []);

	useEffect(() => {
		if (ready) rootRef.current?.render(children);
	});

	return <iframe ref={iframeRef} className={`device-frame ${className}`} title={title} />;
}

/** A real desktop viewport even when the editor itself is open on a narrow
 * screen. It scales to fit without activating the portfolio's phone queries. */
function DesktopDeviceFrame({ children, onEscape }: { children: React.ReactElement; onEscape?: () => void }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 1100, height: 700 });
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const update = () => {
			const box = host.getBoundingClientRect();
			if (box.width && box.height) setSize({ width: box.width, height: box.height });
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(host);
		return () => observer.disconnect();
	}, []);
	const viewportWidth = Math.max(1100, size.width);
	const scale = Math.min(1, size.width / viewportWidth);
	const viewportHeight = Math.max(600, size.height / scale);
	return (
		<div ref={hostRef} className="desktop-frame-host">
			<div
				className="desktop-frame-scaled"
				style={{ width: viewportWidth, height: viewportHeight, transform: `scale(${scale})` }}
			>
				<DeviceFrame title="Desktop preview" className="desktop-device-frame" onEscape={onEscape}>{children}</DeviceFrame>
			</div>
		</div>
	);
}

/** Live preview — renders the SAME shared portfolio components as the real site.
 *  Navigation happens through the site's own nav (sidebar, logo, sub-page cards);
 *  clicking it also scrolls the editing column to that page's controls. In the
 *  default desktop view galleries are live (drag to move/resize); the phone view
 *  and the fullscreen view render exactly what the published site will show. */
export default function PreviewPanel({ base }: { base: string }) {
	const editor = useEditor();
	const { doc } = editor;
	const [page, setPage] = useState('home');
	const [device, setDevice] = useState<'desktop' | 'phone'>(() =>
		typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches ? 'phone' : 'desktop',
	);
	const [fullscreen, setFullscreen] = useState(false);

	useEdgeSnapShortcut();

	useEffect(() => onShowPreviewPage((pageKey) => setPage(pageKey)), []);

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
	const editable = device === 'desktop' && !fullscreen;
	const resizeBreakpoint = fullscreen ? undefined : device;

	const navigate = (path: string) => {
		const key = path === '' ? 'home' : path;
		setPage(key);
		if (fullscreen) return;
		// Bring that page's editing section into view alongside the preview. The
		// Content tab must be active (pages live there), and a collapsed section
		// (or a sub-page inside a collapsed parent) must expand first, or the
		// scroll target doesn't exist / has no height yet.
		showEditorTab('content');
		const parent = Object.entries(doc.content.pages).find(([, p]) => p.children?.includes(key))?.[0];
		if (parent) expandSection(parent);
		expandSection(key);
		requestAnimationFrame(() => {
			document
				.querySelector(`.editor-controls [data-section="${CSS.escape(key)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
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
			onTextLayout={editable ? (pageKey, blockId, layout) => editor.setTextLayout(pageKey, blockId, layout) : undefined}
			onEmbedLayout={
				editable ? (pageKey, blockId, layout) => editor.setEmbedLayout(pageKey, blockId, layout) : undefined
			}
			onCanvasLayouts={
				editable
					? (pageKey, folder, updates) =>
							editor.applyCanvasLayouts(pageKey, folder, updates)
					: undefined
			}
			resizeBreakpoint={resizeBreakpoint}
			onSectionHeight={
				resizeBreakpoint
					? (pageKey, partKey, breakpoint, height) =>
							editor.setSectionHeight(pageKey, partKey, breakpoint, height)
					: undefined
			}
			onFooterHeight={
				resizeBreakpoint
					? (breakpoint, height) => editor.setFooterHeight(breakpoint, height)
					: undefined
			}
		/>
	);

	return (
		<div className={`preview ${fullscreen ? 'preview-fullscreen' : ''}`}>
			<div className="preview-toolbar">
				<div className="device-toggle" role="group" aria-label="Preview device">
					<button
						type="button"
							className={device === 'desktop' ? 'active' : ''}
							aria-pressed={device === 'desktop'}
						onClick={() => setDevice('desktop')}
					>
						Desktop
					</button>
						<button type="button" aria-pressed={device === 'phone'} className={device === 'phone' ? 'active' : ''} onClick={() => setDevice('phone')}>
						Phone
					</button>
				</div>
				{editable && <GuideTools />}
				<span className="preview-hint">
					{editable
						? 'Drag items; drag blank canvas space to select several. Section edges resize.'
						: resizeBreakpoint
							? 'Drag section edges to adjust the phone layout.'
							: 'Exactly how your published site will look.'}
				</span>
				<button
					type="button"
					className="btn-ghost preview-expand"
					onClick={() => setFullscreen((f) => !f)}
					title={fullscreen ? 'Back to the editor (Esc)' : 'Preview your published site fullscreen'}
				>
					{fullscreen ? 'Back to editor' : 'Fullscreen'}
				</button>
			</div>
			{device === 'phone' ? (
				<div className="preview-surface phone-surface">
					<div className="phone-frame">
						<DeviceFrame title="Phone preview" onEscape={fullscreen ? () => setFullscreen(false) : undefined}>{portfolio}</DeviceFrame>
					</div>
				</div>
			) : (
				<div className="preview-surface desktop-surface"><DesktopDeviceFrame onEscape={fullscreen ? () => setFullscreen(false) : undefined}>{portfolio}</DesktopDeviceFrame></div>
			)}
		</div>
	);
}
