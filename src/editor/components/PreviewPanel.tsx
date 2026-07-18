import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEditor } from '../store';
import Portfolio from '../../portfolio/Portfolio';
import { docToPortfolioData } from '../lib/content-init';
import { GRID_OPTIONS, setGridPrefs, useGridPrefs } from '../../portfolio/gridPrefs';
import { expandSection } from './ui/controls';

/** Canvas grid overlay + snap controls. Lives in the preview toolbar so they're
 *  reachable no matter how far down the editing column is scrolled. */
function GridTools() {
	const gridPrefs = useGridPrefs();
	return (
		<div className="grid-toolbar preview-grid-tools" role="group" aria-label="Canvas grid overlay">
			<span className="grid-tools-label" title="Grid overlay for lining things up — never shown on your site.">
				Grid
			</span>
			{GRID_OPTIONS.map((n) => (
				<button
					key={n}
					type="button"
					className={`btn-icon btn-chip ${gridPrefs.cols === n ? 'active' : ''}`}
					onClick={() => setGridPrefs({ cols: n })}
					title={n === 0 ? 'Hide the grid overlay' : `Overlay a ${n}-column grid`}
				>
					{n === 0 ? 'Off' : String(n)}
				</button>
			))}
			<label className={`grid-snap ${gridPrefs.cols === 0 ? 'disabled' : ''}`}>
				<input
					type="checkbox"
					checked={gridPrefs.snap && gridPrefs.cols > 0}
					disabled={gridPrefs.cols === 0}
					onChange={(e) => setGridPrefs({ snap: e.target.checked })}
				/>
				Snap
			</label>
		</div>
	);
}

/**
 * Renders the portfolio inside a real iframe — its own document AND viewport —
 * so the site's media queries respond to the phone's width instead of the
 * editor window's. The iframe head gets a viewport meta plus a clone of every
 * stylesheet the editor page loaded (portfolio CSS included, via preview.css);
 * the tree renders into its own React root, re-rendered with fresh props on
 * every editor change.
 */
function DeviceFrame({ children }: { children: React.ReactElement }) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const rootRef = useRef<Root | null>(null);
	const [ready, setReady] = useState(false);

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
		rootRef.current = root;
		setReady(true);
		return () => {
			rootRef.current = null;
			// Unmount async — React disallows synchronous root unmounts from cleanup.
			setTimeout(() => root.unmount(), 0);
		};
	}, []);

	useEffect(() => {
		if (ready) rootRef.current?.render(children);
	});

	return <iframe ref={iframeRef} className="device-frame" title="Phone preview" />;
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
	const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
	const [fullscreen, setFullscreen] = useState(false);

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

	const navigate = (path: string) => {
		const key = path === '' ? 'home' : path;
		setPage(key);
		if (fullscreen) return;
		// Bring that page's editing section into view alongside the preview. A collapsed
		// section (or a sub-page inside a collapsed parent) must expand first, or the
		// scroll target doesn't exist / has no height yet.
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
			fontFaces={data.fontFaces}
			resumeHref={data.resumeHref}
			base={base}
			onNavigate={navigate}
			onImageLayout={editable ? (folder, id, layout) => editor.updateGalleryMeta(folder, id, { layout }) : undefined}
			onTextLayout={editable ? (pageKey, blockId, layout) => editor.setTextLayout(pageKey, blockId, layout) : undefined}
			onEmbedLayout={
				editable ? (pageKey, blockId, layout) => editor.setEmbedLayout(pageKey, blockId, layout) : undefined
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
						onClick={() => setDevice('desktop')}
					>
						Desktop
					</button>
					<button type="button" className={device === 'phone' ? 'active' : ''} onClick={() => setDevice('phone')}>
						Phone
					</button>
				</div>
				{editable && <GridTools />}
				<span className="preview-hint">
					{editable ? 'Drag images, videos & text to arrange them.' : 'Exactly how your published site will look.'}
				</span>
				<button
					type="button"
					className="btn-ghost preview-expand"
					onClick={() => setFullscreen((f) => !f)}
					title={fullscreen ? 'Back to the editor (Esc)' : 'Preview your published site fullscreen'}
				>
					{fullscreen ? '✕ Back to editor' : '⛶ Fullscreen'}
				</button>
			</div>
			{device === 'phone' ? (
				<div className="preview-surface phone-surface">
					<div className="phone-frame">
						<DeviceFrame>{portfolio}</DeviceFrame>
					</div>
				</div>
			) : (
				<div className="preview-surface">{portfolio}</div>
			)}
		</div>
	);
}
