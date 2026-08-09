// Freeform canvas — the modern replacement for the span grid. Each image sits
// at its stored {x, y, w} (percentages of the canvas width, y included, so the
// whole composition scales proportionally) with height fixed by its aspect
// ratio; text blocks and hosted embeds pinned to the canvas render the same way
// (texts with automatic height, embeds with provider-appropriate ratios). On the published site it
// renders static; in the editor preview the same component turns interactive:
// drag to move, drag the corner handle to resize, with an optional grid overlay
// and snap-to-grid (both controlled from the editor panel via gridPrefs).
// Every change reports back through onLayoutChange / onTextLayout /
// onEmbedLayout. Images without a stored layout yet are auto-flowed into rows
// (flowMissing) and, in the editor, committed once their real aspect ratio is
// measured.
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
	CanvasEmbed,
	CanvasLayoutUpdates,
	CanvasSelection,
	CanvasText,
	ImageLayout,
	ResolvedImage,
	TextLayout,
} from './types';

/** Editor-only toolbar glyphs, inlined so the shared renderer stays free of
 * editor imports. Same outline language as the editor's panel icons. */
const CANVAS_TOOL_ICONS = {
	front: (
		<>
			<path d="M12 13V3.5M8.5 7 12 3.5 15.5 7" />
			<rect x="4.5" y="15.5" width="15" height="5" rx="1.5" />
		</>
	),
	back: (
		<>
			<path d="M12 11v9.5M8.5 17 12 20.5 15.5 17" />
			<rect x="4.5" y="3.5" width="15" height="5" rx="1.5" />
		</>
	),
	lock: (
		<>
			<rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
			<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
		</>
	),
	unlock: (
		<>
			<rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
			<path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.1" />
		</>
	),
	trash: (
		<>
			<path d="M4.5 7h15" />
			<path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
			<path d="m6.5 7 .7 12.1A2 2 0 0 0 9.2 21h5.6a2 2 0 0 0 2-1.9L17.5 7" />
			<path d="M10 11v6M14 11v6" />
		</>
	),
} as const;

function CanvasToolIcon({ type }: { type: keyof typeof CANVAS_TOOL_ICONS }) {
	return (
		<svg
			className="canvas-tool-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{CANVAS_TOOL_ICONS[type]}
		</svg>
	);
}
import type { MobileComposition } from '../lib/content';
import {
	bottomOf,
	canvasHeight,
	canvasDxBounds,
	clampLayout,
	clampTextLayout,
	columnEdges,
	columnSpans,
	DEFAULT_AR,
	EDGE_SNAP,
	flowMissing,
	formatCanvasPercent,
	maxWEastOf,
	maxWWestOf,
	MIN_EMBED_W,
	MIN_TEXT_W,
	MIN_W,
	nearestEdge,
	nudgeCanvasLayouts,
	pointerInCanvas,
	resolveNudgeStep,
	roundLayout,
	roundTextLayout,
	snapSpanToEdges,
	snapSpanToCenter,
	snapTo,
	textBottom,
} from './canvasLayout';
import { getGridPrefs, guideById, useGridPrefs } from './gridPrefs';
import { embedKindForInput, embedKindLabel, embedSpec } from './mediaEmbed';
import { stripePaymentLink } from './paymentEmbed';
import { safeHref } from './safeHref';
import { showSampleUnavailable } from './sampleFallback';
import { TextContent } from './TextBlock';
import InlineTextEditor, { type InlineTextEditing } from './InlineTextEditor';
import { automaticPhoneOrder } from './mobileOrder';
import { artworkEffectClass, artworkEffectStyle } from './artworkEffects';
import './Gallery.css';
import './ArtworkEffects.css';

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

const CANVAS_SCOPE_SELECTION = 'portfolio-canvas-scope-selection';
type CanvasScopeSelectionDetail = {
	selections: Map<Element, Set<string>>;
	toolbarCanvas: Element | null;
};

/** How long an arrow-key nudge burst waits after the last keypress before it
 *  commits — long enough that OS key-repeat (which fires far faster than
 *  this) never splits one held-key move into several undo steps. */
const NUDGE_BURST_IDLE_MS = 500;

const imageClickHref = (image: ResolvedImage): string | undefined =>
	image.clickAction === 'link' ? safeHref(image.link) : undefined;

const externalImageLink = (href: string): boolean => /^https?:/i.test(href);

export interface CanvasGalleryProps {
	images: ResolvedImage[];
	/** Text blocks pinned to the canvas, rendered inside the composition. */
	texts?: CanvasText[];
	/** Hosted players/maps pinned to the canvas, rendered inside the composition. */
	embeds?: CanvasEmbed[];
	/** Self-contained blocks, such as carousels, placed on this same canvas. */
	widgets?: CanvasWidget[];
	/** Fallback alt text for images without their own title. */
	alt?: string;
	/** Editor preview: enables move/resize instead of the lightbox. */
	editable?: boolean;
	/** Optional phone-only order, size and visibility. Absent = automatic. */
	mobile?: MobileComposition;
	/** True when this hydrated gallery is currently inside the phone breakpoint. */
	phoneActive?: boolean;
	/** New/unplaced images begin below earlier freeform items in the section. */
	autoFlowFloor?: number;
	/** Reports a finished move/resize (and the initial auto-flow) per image. */
	onLayoutChange?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize (and height re-measures) per pinned text. */
	onTextLayout?: (id: string, layout: TextLayout) => void;
	/** Reports a finished move/resize per pinned hosted embed. */
	onEmbedLayout?: (id: string, layout: ImageLayout) => void;
	/** Reports a finished move/resize for a self-contained canvas widget. */
	onWidgetLayout?: (id: string, layout: ImageLayout) => void;
	/** Reports one finished mixed-item move so the editor can commit one undo step. */
	onBulkLayoutChange?: (updates: CanvasLayoutUpdates) => void;
	/** Deletes the current canvas selection as one undoable edit. */
	onDeleteSelection?: (selection: CanvasSelection) => void;
	/** Published site: open the lightbox for image i and restore focus to its trigger afterwards. */
	onOpen?: (index: number, trigger?: HTMLElement) => void;
	/** Editor preview: keep internal image links inside the preview router. */
	onImageLink?: (url: string, event: ReactMouseEvent<HTMLElement>) => void;
	onSelectBlock?: (blockId: string) => void;
	/** Editor preview: the pinned text currently being edited in place. */
	inlineTextEditing?: InlineTextEditing;
}

export interface CanvasWidget {
	id: string;
	layout: ImageLayout;
	freeResize?: boolean;
	/** Content-sized box (sub-pages, products): height always hugs the rendered
	 *  cards, resizing follows the pointer width-only with no snapping, and the
	 *  stored aspect ratio is kept in sync with the measured content height. */
	autoHeight?: boolean;
	/** Editor-only map-style grip shown over widgets whose contents are interactive. */
	dragLabel?: string;
	/** Let pointer drags on the widget image reposition that image instead of moving the widget. */
	moveImage?: boolean;
	content: ReactNode;
}

export default function CanvasGallery({
	images,
	texts = [],
	embeds = [],
	widgets = [],
	alt = 'Portfolio piece',
	editable = false,
	mobile,
	phoneActive = false,
	autoFlowFloor = 0,
	onLayoutChange,
	onTextLayout,
	onEmbedLayout,
	onWidgetLayout,
	onBulkLayoutChange,
	onDeleteSelection,
	onOpen,
	onImageLink,
	onSelectBlock,
	inlineTextEditing,
}: CanvasGalleryProps) {
	const canvasRef = useRef<HTMLDivElement>(null);
	/** Live position of the item being dragged, keyed by id (committed on release). */
	const [drafts, setDrafts] = useState<Record<string, ImageLayout>>({});
	const draftsRef = useRef(drafts);
	draftsRef.current = drafts;
	/** Same, for pinned texts. */
	const [textDrafts, setTextDrafts] = useState<Record<string, TextLayout>>({});
	const textDraftsRef = useRef(textDrafts);
	textDraftsRef.current = textDrafts;
	/** Keeps height re-measurement from overwriting a just-committed move before
	 * the updated editor document has rendered back through the iframe. */
	const committedTextLayouts = useRef<Record<string, TextLayout>>({});
	/** Aspect ratios measured from the loaded pixels (editor only). */
	const [measured, setMeasured] = useState<Record<string, number>>({});
	const [dragId, setDragId] = useState<string | null>(null);
	const [dragGesture, setDragGesture] = useState<'move' | 'resize' | null>(null);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [marquee, setMarquee] = useState<
		{ left: number; top: number; width: number; height: number } | null
	>(null);
	const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
	/** The nudge arrows and shortcut hint stay tucked away until asked for. */
	const [toolbarToolsOpen, setToolbarToolsOpen] = useState(() => {
		try {
			return window.localStorage.getItem('hangwork-canvas-toolbar-tools') === 'open';
		} catch {
			return false;
		}
	});
	const toggleToolbarTools = () =>
		setToolbarToolsOpen((open) => {
			const next = !open;
			try {
				window.localStorage.setItem('hangwork-canvas-toolbar-tools', next ? 'open' : 'closed');
			} catch {
				/* preference simply resets next session */
			}
			return next;
		});
	/** Artist-chosen toolbar offset (drag the ⠿ grip) so it can be moved off art. */
	const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 });
	const toolbarOffsetRef = useRef(toolbarOffset);
	toolbarOffsetRef.current = toolbarOffset;
	const startToolbarDrag = (event: React.PointerEvent) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const win = canvasRef.current?.ownerDocument.defaultView ?? window;
		const startX = event.clientX;
		const startY = event.clientY;
		const base = toolbarOffsetRef.current;
		const move = (ev: PointerEvent) =>
			setToolbarOffset({ x: base.x + ev.clientX - startX, y: base.y + ev.clientY - startY });
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};
	const [toolbarOwner, setToolbarOwner] = useState(true);
	const [scopedSelectionCount, setScopedSelectionCount] = useState(0);
	const [centerGuide, setCenterGuide] = useState(false);
	const textEls = useRef<Record<string, HTMLDivElement | null>>({});
	const widgetEls = useRef<Record<string, HTMLDivElement | null>>({});
	const draggedClickRef = useRef<string | null>(null);
	/** Live x/y of a single item mid arrow-key nudge, for the toolbar readout
	 *  (cleared once the burst below commits). */
	const [nudgeReadout, setNudgeReadout] = useState<{ x: number; y: number } | null>(null);
	/** The selection items an in-progress keyboard-nudge burst will commit, and
	 *  the idle timer that ends it — mirrors a pointer drag (live drafts, one
	 *  commit on release) but "release" here is ~500ms of no further arrow keys. */
	const nudgeBurstItems = useRef<ReturnType<typeof selectionItems> | null>(null);
	const nudgeBurstTimer = useRef<number | undefined>(undefined);
	/** Canvas height when the burst began. Rendered height never drops below it
	 *  until the burst commits, so nudging the bottommost item up doesn't reflow
	 *  everything under the canvas on every keypress. */
	const nudgeHeightFloor = useRef<number | null>(null);
	const gridPrefs = useGridPrefs();

	// Snap targets follow the chosen guide: square guides snap x AND y to the
	// cell size; column guides ATTRACT x (and the resized right edge) toward a
	// column edge only when it's already close — a magnet, never a teleport,
	// so wide-column guides don't yank items across half the page.
	const guide = guideById(gridPrefs.guide);
	const snapOn = editable && gridPrefs.snap && guide.kind !== 'off';
	const squareStep = snapOn && guide.kind === 'squares' ? 100 / guide.n : 0;
	const xEdges = snapOn && guide.kind === 'columns' ? columnEdges(guide.n) : [];
	const COLUMN_SNAP = 2.5;
	const snapX = (v: number): number =>
		xEdges.length ? (nearestEdge(v, xEdges, COLUMN_SNAP) ?? v) : snapTo(v, squareStep);
	const snapY = (v: number): number => snapTo(v, squareStep);

	// On by default in the editor, guides or not; a neighbor edge within EDGE_SNAP wins
	// over the coarser guide snap. Toggleable (toolbar checkbox / Shift+S) for the rare
	// composition where near-misses should stay near-misses.
	const edgeSnapOn = editable && gridPrefs.edgeSnap;

	/**
	 * Every OTHER item's edges (x: left/right, y: top/bottom), so a drag can
	 * magnetically align with its neighbors — e.g. two images sharing the exact
	 * same top or bottom line.
	 */
	const neighborEdges = (excluded: ReadonlySet<string>): { xs: number[]; ys: number[] } => {
		if (!edgeSnapOn) return { xs: [], ys: [] };
		// The canvas's own edges are snap targets too, so a moved OR resized item
		// can land flush with the page sides and top.
		const xs: number[] = [0, 100];
		const ys: number[] = [0];
		images.forEach((img, i) => {
			if (excluded.has(`image:${img.id ?? keyOf(img, i)}`)) return;
			const l = layouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		embeds.forEach((v, i) => {
			if (excluded.has(`video:${v.id}`)) return;
			const l = embedLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		widgets.forEach((widget, i) => {
			if (excluded.has(`widget:${widget.id}`)) return;
			const l = widgetLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, bottomOf(l));
		});
		shownTexts.forEach((t, i) => {
			if (excluded.has(`text:${t.id}`)) return;
			const l = textLayouts[i];
			xs.push(l.x, l.x + l.w);
			ys.push(l.y, textBottom(l));
		});
		return { xs, ys };
	};

	const keyOf = (img: ResolvedImage, i: number): string => img.id ?? `${img.src}-${i}`;
	const cropRatio = (value: string | undefined): number | undefined => {
		const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(value ?? '');
		return match ? Number(match[1]) / Number(match[2]) : undefined;
	};
	const imageSelectionKey = (img: ResolvedImage, i: number): string =>
		`image:${keyOf(img, i)}`;

	// Empty pinned texts stay draggable in the editor; on the site they render nothing.
	const shownTexts = editable ? texts : texts.filter((t) => t.text.trim());

	const textLayouts = shownTexts.map((t) => textDrafts[t.id] ?? t.layout);
	const embedLayouts = embeds.map((v) => drafts[v.id] ?? v.layout);
	const widgetLayouts = widgets.map((widget) => drafts[widget.id] ?? widget.layout);
	// Effective layout per item: in-flight draft > stored > auto-flowed default.
	const flowed = flowMissing(
		images.map((img, i) => ({ layout: img.layout, ar: cropRatio(img.cropAspect) ?? measured[keyOf(img, i)] ?? img.ar })),
		autoFlowFloor,
	);
	const layouts = images.map(
		(img, i) => drafts[keyOf(img, i)] ?? img.layout ?? flowed.get(i) ?? { x: 0, y: 0, w: 30, ar: DEFAULT_AR },
	);
	const height = Math.max(
		canvasHeight(layouts),
		...textLayouts.map(textBottom),
		...embedLayouts.map(bottomOf),
		...widgetLayouts.map(bottomOf),
		1,
		nudgeHeightFloor.current ?? 1,
	);
	const heightRef = useRef(height);
	heightRef.current = height;
	const multiSelected = Math.max(selected.size, scopedSelectionCount) > 1;

	/** Commits the parent hasn't echoed back yet. The editor preview renders in
	 *  its OWN React root, so a committed layout reaches us one render later —
	 *  deleting the draft at commit time re-renders the item at its STALE prop
	 *  position for a frame (a visible flash back to where it was). Instead the
	 *  draft stays until the prop echoes the committed value, or changes to
	 *  anything else (an undo racing the echo, or the item being replaced). */
	const pendingAcks = useRef<Record<string, {
		kind: 'item' | 'text';
		committed: { x: number; y: number; w: number };
		propAt: { x: number; y: number; w: number } | null;
	}>>({});
	const xyw = (l: { x: number; y: number; w: number } | undefined | null) =>
		l ? { x: l.x, y: l.y, w: l.w } : null;
	const sameXYW = (
		a: { x: number; y: number; w: number } | null,
		b: { x: number; y: number; w: number } | null,
	) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w;
	/** The committed-side layout the props currently carry for an id — null when
	 *  the item exists but has no stored layout yet, undefined when it is gone. */
	const propXYWOf = (id: string) => {
		const imageIndex = images.findIndex((img, i) => keyOf(img, i) === id);
		if (imageIndex >= 0) return xyw(images[imageIndex].layout);
		const embed = embeds.find((candidate) => candidate.id === id);
		if (embed) return xyw(embed.layout);
		const widget = widgets.find((candidate) => candidate.id === id);
		if (widget) return xyw(widget.layout);
		const text = texts.find((candidate) => candidate.id === id);
		if (text) return xyw(text.layout);
		return undefined;
	};
	const holdDraftUntilEcho = (
		id: string,
		kind: 'item' | 'text',
		committed: { x: number; y: number; w: number },
	) => {
		pendingAcks.current[id] = { kind, committed: xyw(committed)!, propAt: propXYWOf(id) ?? null };
	};
	// Resolve pending commits once the props catch up. Runs after every render;
	// keeping an acknowledged draft one render longer is invisible (draft and
	// echoed prop differ only by commit rounding), so this never flashes.
	useEffect(() => {
		const pending = pendingAcks.current;
		const ids = Object.keys(pending);
		if (!ids.length) return;
		const bursting = new Set((nudgeBurstItems.current ?? []).map((item) => item.id));
		const resolvedItems: string[] = [];
		const resolvedTexts: string[] = [];
		for (const id of ids) {
			// A new gesture on the item supersedes the old pending entry — leave its
			// draft alone until that gesture commits and re-registers.
			if (dragId !== null || bursting.has(id)) continue;
			const entry = pending[id];
			const prop = propXYWOf(id);
			const echoed = prop !== undefined && sameXYW(prop, entry.committed);
			const untouched =
				prop !== undefined && (prop === null ? entry.propAt === null : sameXYW(prop, entry.propAt));
			if (prop !== undefined && !echoed && untouched) continue; // still waiting
			delete pending[id];
			(entry.kind === 'text' ? resolvedTexts : resolvedItems).push(id);
		}
		if (resolvedItems.length)
			setDrafts((current) => {
				const next = { ...current };
				for (const id of resolvedItems) delete next[id];
				return next;
			});
		if (resolvedTexts.length)
			setTextDrafts((current) => {
				const next = { ...current };
				for (const id of resolvedTexts) delete next[id];
				return next;
			});
	});

	const selectionItems = () => [
		...images.map((img, index) => {
			const layout = layouts[index];
			return {
				key: imageSelectionKey(img, index),
				id: keyOf(img, index),
				kind: 'image' as const,
				layout,
				height: layout.w / layout.ar,
			};
		}),
		...embeds.map((embed, index) => {
			const layout = embedLayouts[index];
			return {
				key: `video:${embed.id}`,
				id: embed.id,
				kind: 'embed' as const,
				layout,
				height: layout.w / layout.ar,
			};
		}),
		...shownTexts.map((text, index) => {
			const layout = textLayouts[index];
			return {
				key: `text:${text.id}`,
				id: text.id,
				kind: 'text' as const,
				layout,
				height: textBottom(layout) - layout.y,
			};
		}),
		...widgets.map((widget, index) => {
			const layout = widgetLayouts[index];
			return {
				key: `widget:${widget.id}`,
				id: widget.id,
				kind: 'widget' as const,
				layout,
				height: layout.w / layout.ar,
			};
		}),
	];

	const commitSelectionLayout = (
		item: ReturnType<typeof selectionItems>[number],
		layout: ImageLayout | TextLayout,
	) => {
		if (item.kind === 'image') {
			const rounded = roundLayout(layout as ImageLayout);
			onLayoutChange?.(item.id, rounded);
		}
		else if (item.kind === 'embed') onEmbedLayout?.(item.id, roundLayout(layout as ImageLayout));
		else if (item.kind === 'widget') onWidgetLayout?.(item.id, roundLayout(layout as ImageLayout));
		else onTextLayout?.(item.id, roundTextLayout(layout as TextLayout));
	};

	const moveSelectionLayer = (direction: 'front' | 'back') => {
		const chosen = selectionItems().find((item) => selected.has(item.key));
		if (!chosen || selected.size !== 1) return;
		const layers = selectionItems().map((item, index) => Math.max(1, item.layout.z ?? index + 1));
		// Canvas items must stay above the canvas background/hit target. Negative
		// z-indices made a sent-back image visible but impossible to select again.
		const z = direction === 'front' ? Math.max(...layers, 1) + 1 : Math.max(1, Math.min(...layers, 2) - 1);
		commitSelectionLayout(chosen, { ...chosen.layout, z });
	};

	const toggleSelectedImageLock = () => {
		const chosen = selectionItems().find((item) => selected.has(item.key));
		if (!chosen || selected.size !== 1 || chosen.kind !== 'image') return;
		commitSelectionLayout(chosen, {
			...(chosen.layout as ImageLayout),
			locked: !(chosen.layout as ImageLayout).locked,
		});
	};
	const runToolbarPointerAction = (event: React.PointerEvent, action: () => void) => {
		event.stopPropagation();
		action();
	};
	const runToolbarKeyAction = (event: React.KeyboardEvent, action: () => void) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		event.stopPropagation();
		action();
	};

	const resizeSelectionWithKeys = (amount: number) => {
		const chosen = selectionItems().find((item) => selected.has(item.key));
		if (!chosen || selected.size !== 1) return;
		if (chosen.kind === 'image' && (chosen.layout as ImageLayout).locked) return;
		if (chosen.kind === 'text') {
			commitSelectionLayout(
				chosen,
				clampTextLayout({ ...(chosen.layout as TextLayout), w: chosen.layout.w + amount }),
			);
			return;
		}
		commitSelectionLayout(
			chosen,
			clampLayout({ ...(chosen.layout as ImageLayout), w: chosen.layout.w + amount }),
		);
	};

	const clearNudgeBurstTimer = () => {
		if (nudgeBurstTimer.current !== undefined) {
			window.clearTimeout(nudgeBurstTimer.current);
			nudgeBurstTimer.current = undefined;
		}
	};

	/** Commit whatever the pending nudge burst last drafted — one
	 *  onBulkLayoutChange/onLayoutChange call, so one undo step, exactly like a
	 *  pointer-drag release — then clear those items' drafts so the now-committed
	 *  props take back over. Safe to call with nothing pending (a no-op), so every
	 *  other canvas action (select something else, resize, reorder, delete,
	 *  escape, unmount) can call it first without checking.  */
	const flushNudgeBurst = () => {
		clearNudgeBurstTimer();
		nudgeHeightFloor.current = null;
		const items = nudgeBurstItems.current;
		nudgeBurstItems.current = null;
		setNudgeReadout(null);
		if (!items || items.length === 0) return;
		const updates: CanvasLayoutUpdates = {};
		for (const item of items) {
			if (item.kind === 'text') {
				const layout = textDraftsRef.current[item.id];
				if (!layout) continue;
				const rounded = roundTextLayout(layout);
				committedTextLayouts.current[item.id] = rounded;
				(updates.texts ??= {})[item.id] = rounded;
			} else {
				const layout = draftsRef.current[item.id];
				if (!layout) continue;
				const rounded = roundLayout(layout);
				if (item.kind === 'image') (updates.images ??= {})[item.id] = rounded;
				else if (item.kind === 'embed') (updates.embeds ??= {})[item.id] = rounded;
				else (updates.widgets ??= {})[item.id] = rounded;
			}
		}
		if (updates.images || updates.texts || updates.embeds || updates.widgets) {
			if (onBulkLayoutChange) onBulkLayoutChange(updates);
			else {
				for (const [id, layout] of Object.entries(updates.images ?? {})) onLayoutChange?.(id, layout);
				for (const [id, layout] of Object.entries(updates.texts ?? {})) onTextLayout?.(id, layout);
				for (const [id, layout] of Object.entries(updates.embeds ?? {})) onEmbedLayout?.(id, layout);
				for (const [id, layout] of Object.entries(updates.widgets ?? {})) onWidgetLayout?.(id, layout);
			}
		}
		// Drafts stay until the parent echoes the commit (see pendingAcks) — the
		// preview lives in another React root, so clearing now would flash the
		// stale position for a frame. Items that committed nothing drop right away.
		const uncommitted = items.filter((item) => {
			const committed =
				item.kind === 'text'
					? updates.texts?.[item.id]
					: updates.images?.[item.id] ?? updates.embeds?.[item.id] ?? updates.widgets?.[item.id];
			if (!committed) return true;
			holdDraftUntilEcho(item.id, item.kind === 'text' ? 'text' : 'item', committed);
			return false;
		});
		if (uncommitted.some((item) => item.kind !== 'text'))
			setDrafts((current) => {
				const next = { ...current };
				for (const item of uncommitted) if (item.kind !== 'text') delete next[item.id];
				return next;
			});
		if (uncommitted.some((item) => item.kind === 'text'))
			setTextDrafts((current) => {
				const next = { ...current };
				for (const item of uncommitted) if (item.kind === 'text') delete next[item.id];
				return next;
			});
	};

	/** One arrow-key nudge. Moves the live draft immediately (same instant
	 *  feedback as a drag) and shows the readout, but only (re)schedules the
	 *  commit — holding the key, or tapping it repeatedly, keeps refreshing the
	 *  same pending commit instead of writing to history every keystroke. `big`
	 *  (Alt/Option) scales the step 10x for a faster, coarser move. */
	const nudgeSelection = (dx: number, dy: number, big = false) => {
		const chosen = selectionItems().filter(
			(item) =>
				selected.has(item.key) &&
				!(item.kind === 'image' && (item.layout as ImageLayout).locked),
		);
		if (chosen.length === 0) return;
		// The keydown listener is a long-lived closure that isn't redefined between
		// keystrokes within a burst (nudging never changes `selected`, the effect's
		// only relevant dependency) — so a fast key-repeat calls this SAME closure
		// repeatedly, and `selectionItems()` above still resolves through the
		// `drafts`/`textDrafts` STATE it originally closed over, not this burst's
		// running position. Read the live refs instead (the same source a pointer
		// drag's own equally long-lived handlers use) so each keystroke keeps
		// nudging from where the burst actually left off, not from where it started.
		const liveLayoutOf = (item: (typeof chosen)[number]): ImageLayout | TextLayout =>
			item.kind === 'text'
				? (textDraftsRef.current[item.id] ?? item.layout)
				: (draftsRef.current[item.id] ?? item.layout);
		const prefs = getGridPrefs();
		const activeGuide = guideById(prefs.guide);
		const stepOn = editable && prefs.snap && activeGuide.kind !== 'off';
		const step = resolveNudgeStep(activeGuide.kind, activeGuide.n, stepOn, big);
		const nudged = nudgeCanvasLayouts(
			chosen.map(liveLayoutOf),
			dx * step,
			dy * step,
		);
		const nextDrafts: Record<string, ImageLayout> = {};
		const nextTextDrafts: Record<string, TextLayout> = {};
		chosen.forEach((item, index) => {
			const next = nudged[index];
			if (item.kind === 'text') nextTextDrafts[item.id] = clampTextLayout(next as TextLayout);
			else nextDrafts[item.id] = clampLayout(next as ImageLayout);
		});
		// Write the refs through immediately: the next key-repeat press can arrive
		// before React re-renders (which is when the refs otherwise sync), and it
		// must accumulate from THIS press's result — otherwise fast repeats read a
		// stale baseline and steps get silently dropped.
		if (Object.keys(nextDrafts).length) {
			draftsRef.current = { ...draftsRef.current, ...nextDrafts };
			setDrafts((d) => ({ ...d, ...nextDrafts }));
		}
		if (Object.keys(nextTextDrafts).length) {
			textDraftsRef.current = { ...textDraftsRef.current, ...nextTextDrafts };
			setTextDrafts((d) => ({ ...d, ...nextTextDrafts }));
		}
		if (nudgeBurstItems.current === null) nudgeHeightFloor.current = heightRef.current;
		setNudgeReadout(chosen.length === 1 ? { x: nudged[0].x, y: nudged[0].y } : null);
		nudgeBurstItems.current = chosen;
		clearNudgeBurstTimer();
		nudgeBurstTimer.current = window.setTimeout(flushNudgeBurst, NUDGE_BURST_IDLE_MS);
	};

	/** Remove everything selected as one undoable edit — shared by the
	 *  Delete/Backspace shortcut and the selection toolbar's Remove button. */
	const deleteCurrentSelection = () => {
		if (!onDeleteSelection || selected.size === 0) return;
		flushNudgeBurst();
		const selection: CanvasSelection = {};
		for (const key of selected) {
			const separator = key.indexOf(':');
			const kind = key.slice(0, separator);
			const id = key.slice(separator + 1);
			if (!id) continue;
			if (kind === 'image') (selection.images ??= []).push(id);
			else if (kind === 'text') (selection.texts ??= []).push(id);
			else if (kind === 'video') (selection.embeds ??= []).push(id);
			else if (kind === 'widget') (selection.widgets ??= []).push(id);
		}
		onDeleteSelection(selection);
		setSelected(new Set());
	};

	useEffect(() => {
		if (!editable) {
			// Keep the same empty Set identity once selection is already clear. A new
			// Set on every non-editable render retriggers this selected-dependent
			// effect forever (for example on the Pages overview).
			setSelected((current) => current.size > 0 ? new Set() : current);
			return;
		}
		const canvas = canvasRef.current;
		const doc = canvas?.ownerDocument;
		if (!doc || !canvas) return;
		const hostDoc = doc.defaultView?.frameElement?.ownerDocument;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				flushNudgeBurst();
				setSelected(new Set());
				return;
			}
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.matches('input, textarea, select') ||
					target.isContentEditable ||
					!!target.closest('[contenteditable="true"]'))
			) return;
			if (doc.activeElement !== canvas && !canvas.contains(doc.activeElement)) return;
			const isArrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key);
			if (!event.metaKey && !event.ctrlKey && selected.size > 0) {
				// [ / ] (reorder) and Shift+Arrow (resize) are unchanged, existing
				// single-item shortcuts — Alt/Option is reserved below for a faster,
				// 10x nudge, so both stay gated to !altKey exactly as before.
				if (!event.altKey && selected.size === 1 && (event.key === '[' || event.key === ']')) {
					event.preventDefault();
					flushNudgeBurst();
					moveSelectionLayer(event.key === ']' ? 'front' : 'back');
					return;
				}
				if (!event.altKey && selected.size === 1 && event.shiftKey && isArrow) {
					event.preventDefault();
					flushNudgeBurst();
					resizeSelectionWithKeys(event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1);
					return;
				}
				if (!event.shiftKey && isArrow) {
					event.preventDefault();
					nudgeSelection(
						event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0,
						event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0,
						event.altKey,
					);
					return;
				}
			}
			if (
				(event.key !== 'Backspace' && event.key !== 'Delete' && event.key !== 'Del') ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				!onDeleteSelection ||
				selected.size === 0
			) return;
			event.preventDefault();
			event.stopPropagation();
			deleteCurrentSelection();
		};
		doc.addEventListener('keydown', onKey);
		if (hostDoc && hostDoc !== doc) hostDoc.addEventListener('keydown', onKey);
		return () => {
			flushNudgeBurst();
			doc.removeEventListener('keydown', onKey);
			if (hostDoc && hostDoc !== doc) hostDoc.removeEventListener('keydown', onKey);
		};
	}, [editable, onDeleteSelection, selected]);

	const centeredX = (x: number, w: number): number => {
		if (!editable || !gridPrefs.centerSnap) {
			setCenterGuide(false);
			return x;
		}
		const result = snapSpanToCenter(x, w);
		setCenterGuide(result.snapped);
		return result.value;
	};

	// Phones stack the canvas as one column — interleave images, texts and embeds
	// by their vertical position so the stacking follows the composition, not the
	// DOM order.
	const automaticKeys = automaticPhoneOrder([
		...images.map((img, i) => ({ key: `image:${keyOf(img, i)}`, y: layouts[i].y, kind: 'image' as const, index: i })),
		...shownTexts.map((t, i) => ({ key: `text:${t.id}`, y: textLayouts[i].y, kind: 'text' as const, index: i })),
		...embeds.map((v, i) => ({ key: `video:${v.id}`, y: embedLayouts[i].y, kind: 'video' as const, index: i })),
		...widgets.map((widget, i) => ({ key: `widget:${widget.id}`, y: widgetLayouts[i].y, kind: 'image' as const, index: images.length + i })),
	]);
	const automaticOrderOf = new Map(automaticKeys.map((key, rank) => [key, rank]));
	const requestedOrderOf = new Map((mobile?.order ?? []).map((key, rank) => [key, rank]));
	const phoneVars = (key: string): CSSProperties => {
		const automaticOrder = automaticOrderOf.get(key) ?? 0;
		const requestedOrder = requestedOrderOf.get(key);
		const style = mobile?.items?.[key];
		const width = style?.width ?? 100;
		const align = style?.align ?? 'center';
		return {
			'--mobile-order': String(requestedOrder ?? requestedOrderOf.size + automaticOrder),
			'--mobile-width': String(width),
			'--mobile-display': style?.hidden ? 'none' : 'block',
			'--mobile-margin-left': align === 'left' ? '0' : 'auto',
			'--mobile-margin-right': align === 'right' ? '0' : 'auto',
		} as CSSProperties;
	};
	const renderItems = [
		...images.map((_, index) => ({ type: 'image' as const, index, key: `image:${keyOf(images[index], index)}` })),
		...embeds.map((embed, index) => ({ type: 'embed' as const, index, key: `video:${embed.id}` })),
		...widgets.map((widget, index) => ({ type: 'widget' as const, index, key: `widget:${widget.id}` })),
		...shownTexts.map((text, index) => ({ type: 'text' as const, index, key: `text:${text.id}` })),
	];
	if (phoneActive)
		renderItems.sort((a, b) => {
			const aRequested = requestedOrderOf.get(a.key);
			const bRequested = requestedOrderOf.get(b.key);
			const aOrder = aRequested ?? requestedOrderOf.size + (automaticOrderOf.get(a.key) ?? 0);
			const bOrder = bRequested ?? requestedOrderOf.size + (automaticOrderOf.get(b.key) ?? 0);
			return aOrder - bOrder;
		});

	// Overlap (z) order matches the editor panel like a layers list: the TOP image
	// there sits in FRONT here, so z-index descends down the list. Pinned videos
	// and texts keep stacking above every image (as their DOM order always had it).
	// The dragged item jumps above everything, including the grid overlay (5000).
	const DRAG_Z = 6000;
	const imageZ = (i: number) => Math.max(1, layouts[i].z ?? images.length - i);
	const embedZ = (i: number) => Math.max(1, embedLayouts[i].z ?? images.length + embeds.length - i);
	const textZ = (i: number) => Math.max(1, textLayouts[i].z ?? images.length + embeds.length + shownTexts.length - i);
	const widgetZ = (i: number) => Math.max(1, widgetLayouts[i].z ?? images.length + embeds.length + shownTexts.length + widgets.length - i);

	const measure = (key: string, el: HTMLImageElement) => {
		if (el.naturalWidth && el.naturalHeight)
			setMeasured((m) => (m[key] ? m : { ...m, [key]: el.naturalWidth / el.naturalHeight }));
	};

	// Editor: once every unplaced image has a measured aspect ratio, persist the
	// auto-flowed positions so the gallery converts to the canvas system exactly
	// as previewed. Runs once per gallery — afterwards every image has a layout.
	useEffect(() => {
		if (!editable || !onLayoutChange) return;
		const missing = images
			.map((img, i) => ({ img, i }))
			.filter(({ img }) => !img.layout && img.id);
		if (missing.length === 0) return;
		if (!missing.every(({ img, i }) => measured[keyOf(img, i)])) return;
		for (const { img, i } of missing) {
			const layout = flowed.get(i);
			if (layout) onLayoutChange(img.id!, roundLayout(layout));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editable, onLayoutChange, images, measured]);

	// Editor: keep each pinned text's stored height in sync with its rendered
	// height (it changes when the text or its width changes), so the canvas can
	// reserve room for it on the published site. The 0.5% tolerance stops the
	// measure->commit cycle from ping-ponging.
	useEffect(() => {
		if (!editable || !onTextLayout || dragId) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const width = canvas.getBoundingClientRect().width;
		if (!width) return;
		for (const t of texts) {
			const el = textEls.current[t.id];
			if (!el) continue;
			const committed = committedTextLayouts.current[t.id];
			if (
				committed &&
				t.layout.x === committed.x &&
				t.layout.y === committed.y &&
				t.layout.w === committed.w
			) {
				delete committedTextLayouts.current[t.id];
			}
			const base = committed ?? t.layout;
			const h = (el.offsetHeight * 100) / width;
			if (Math.abs((base.h ?? 0) - h) > 0.5)
				onTextLayout(t.id, roundTextLayout({ ...base, h }));
		}
	});

	// Editor: auto-height widgets (sub-pages, products) render at their content's
	// height; keep the stored aspect ratio tracking that measured height so the
	// canvas reserves the right room everywhere (published site, phone stack,
	// section height math). The 2% tolerance stops measure->commit ping-pong.
	useEffect(() => {
		if (!editable || !onWidgetLayout || dragId) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const width = canvas.getBoundingClientRect().width;
		if (!width) return;
		widgets.forEach((widget, index) => {
			if (!widget.autoHeight) return;
			const el = widgetEls.current[widget.id];
			if (!el) return;
			const layout = widgetLayouts[index];
			const hPct = (el.offsetHeight * 100) / width;
			if (hPct <= 0 || layout.w <= 0) return;
			const impliedAr = layout.w / hPct;
			if (Math.abs(layout.ar - impliedAr) / impliedAr > 0.02)
				onWidgetLayout(widget.id, roundLayout({ ...layout, ar: impliedAr }));
		});
	});

	/** Shared move/resize wiring for images and embeds (both use ImageLayout). */
	const startItemDrag = (
		e: React.PointerEvent,
		id: string,
		selectionKey: string,
		from: ImageLayout,
		mode: 'move' | 'resize',
		minW: number,
		commit: (id: string, layout: ImageLayout) => void,
		freeResize = false,
		corner: ResizeCorner = 'se',
		/** Auto-height widgets: resizing changes width only, exactly following the
		 *  pointer — no guide or neighbor-edge snapping mid-resize. */
		widthOnly = false,
	) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		e.preventDefault();
		e.stopPropagation();
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The full-canvas shield below is the fallback for older WebViews.
		}
		canvas.focus({ preventScroll: true });
		// Inside the phone-preview iframe the drag must listen on THAT window.
		const win = canvas.ownerDocument.defaultView ?? window;
		const origin = pointerInCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect());
		let lastPointer = { x: e.clientX, y: e.clientY };
		const { xs, ys } = neighborEdges(new Set([selectionKey]));
		let finalDraft: ImageLayout | undefined;
		draggedClickRef.current = null;
		setDragId(id);
		setDragGesture(mode);
		const update = (clientX: number, clientY: number) => {
			const current = pointerInCanvas(clientX, clientY, canvas.getBoundingClientRect());
			const dx = current.x - origin.x;
			const dy = current.y - origin.y;
			if (Math.abs(dx) + Math.abs(dy) > 0.3) draggedClickRef.current = id;
			const h = from.w / from.ar;
			let next: ImageLayout;
			if (mode === 'move') {
				// Guide snap first, then let a nearby neighbor edge take over so the
				// item's top/bottom (or sides) lines up exactly with its neighbors'.
				const edgeX = snapSpanToEdges(snapX(from.x + dx), from.w, xs);
				const x = centeredX(edgeX, from.w);
				const y = snapSpanToEdges(snapY(from.y + dy), h, ys);
				next = { ...from, x, y };
			} else {
				setCenterGuide(false);
				if (widthOnly) {
					// Content-sized widgets: the pointer sets the width directly. No
					// grid/edge snapping — snapping mid-resize made the box jump between
					// sizes — and no height math; the box hugs its content.
					const east = corner.endsWith('e');
					const rightEdge = from.x + from.w;
					const width = east
						? Math.min(Math.max(from.w + dx, minW), maxWEastOf(from.x))
						: Math.min(Math.max(from.w - dx, minW), maxWWestOf(rightEdge));
					next = { ...from, x: east ? from.x : rightEdge - width, w: width };
					finalDraft = clampLayout(next);
					setDrafts((d) => ({ ...d, [id]: finalDraft! }));
					return;
				}
				if (corner !== 'se') {
					const east = corner.endsWith('e');
					const south = corner.startsWith('s');
					const right = from.x + from.w;
					const bottom = from.y + h;
					if (freeResize) {
						const width = Math.max(from.w + (east ? dx : -dx), minW);
						const height = Math.max(h + (south ? dy : -dy), MIN_W);
						next = {
							...from,
							x: east ? from.x : right - width,
							y: south ? from.y : bottom - height,
							w: width,
							ar: Math.min(Math.max(width / height, 0.2), 5),
						};
					} else {
						const delta = Math.max(east ? dx : -dx, (south ? dy : -dy) * from.ar);
						const width = Math.max(from.w + delta, minW);
						next = {
							...from,
							x: east ? from.x : right - width,
							y: south ? from.y : bottom - width / from.ar,
							w: width,
						};
					}
					finalDraft = clampLayout(next);
					setDrafts((draft) => ({ ...draft, [id]: finalDraft! }));
					return;
				}
				if (freeResize) {
					let width = Math.min(Math.max(from.w + dx, minW), maxWEastOf(from.x));
					let height = Math.max(from.w / from.ar + dy, MIN_W);
					const snappedRight = nearestEdge(from.x + width, xs, EDGE_SNAP);
					const snappedBottom = nearestEdge(from.y + height, ys, EDGE_SNAP);
					width =
						snappedRight === null
							? Math.max(snapX(from.x + width) - from.x, minW)
							: Math.max(snappedRight - from.x, minW);
					height =
						snappedBottom === null
							? Math.max(snapY(from.y + height) - from.y, MIN_W)
							: Math.max(snappedBottom - from.y, MIN_W);
					next = { ...from, w: width, ar: Math.min(Math.max(width / height, 0.2), 5) };
					finalDraft = clampLayout(next);
					setDrafts((d) => ({ ...d, [id]: finalDraft! }));
					return;
				}
				// Snap the RIGHT edge to the guides so resized items line up with
				// columns — unless a neighbor's edge is closer: right edge to a
				// neighbor's side, or bottom edge to a neighbor's top/bottom.
				const w = Math.min(from.w + Math.max(dx, dy * from.ar), maxWEastOf(from.x));
				const right = nearestEdge(from.x + w, xs, EDGE_SNAP);
				const bottom = nearestEdge(from.y + w / from.ar, ys, EDGE_SNAP);
				const wRight = right === null ? null : right - from.x;
				const wBottom = bottom === null ? null : (bottom - from.y) * from.ar;
				const dRight = wRight === null ? Infinity : Math.abs(wRight - w);
				const dBottom = wBottom === null ? Infinity : Math.abs(wBottom - w);
				const snapped =
					dRight <= dBottom && dRight < Infinity
						? (wRight as number)
						: dBottom < Infinity
							? (wBottom as number)
							: snapX(from.x + w) - from.x;
				next = { ...from, w: Math.max(snapped, minW) };
			}
			finalDraft = clampLayout(next);
			setDrafts((d) => ({ ...d, [id]: finalDraft! }));
		};
		const move = (ev: PointerEvent) => {
			lastPointer = { x: ev.clientX, y: ev.clientY };
			update(ev.clientX, ev.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setDragId(null);
			setDragGesture(null);
			setCenterGuide(false);
			const done = finalDraft ?? draftsRef.current[id];
			if (done) {
				const rounded = roundLayout(done);
				commit(id, rounded);
				// Keep the draft until the parent echoes this commit — clearing now
				// would flash the pre-drag position for a frame (separate React root).
				holdDraftUntilEcho(id, 'item', rounded);
			} else {
				setDrafts((d) => {
					const rest = { ...d };
					delete rest[id];
					return rest;
				});
			}
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	const startGroupDrag = (e: React.PointerEvent) => {
		if (!editable || e.button !== 0 || selected.size < 2) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		canvas.focus({ preventScroll: true });
		const chosen = selectionItems().filter(
			(item) =>
				selected.has(item.key) &&
				!(item.kind === 'image' && (item.layout as ImageLayout).locked),
		);
		if (chosen.length < 2) return;
		e.preventDefault();
		e.stopPropagation();
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The drag shield keeps pointer events out of hosted iframes.
		}
		const win = canvas.ownerDocument.defaultView ?? window;
		const origin = pointerInCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect());
		let lastPointer = { x: e.clientX, y: e.clientY };
		const left = Math.min(...chosen.map((item) => item.layout.x));
		const top = Math.min(...chosen.map((item) => item.layout.y));
		const right = Math.max(...chosen.map((item) => item.layout.x + item.layout.w));
		const bottom = Math.max(
			...chosen.map((item) => item.layout.y + item.height),
		);
		const groupW = right - left;
		const groupH = bottom - top;
		// Each item may bleed up to half its width past a side edge, so the shared
		// horizontal travel is the tightest of the items' own allowances.
		const dxBounds = canvasDxBounds(chosen.map((item) => item.layout));
		const boundDx = (dx: number): number => Math.min(Math.max(dx, dxBounds.min), dxBounds.max);
		const { xs, ys } = neighborEdges(new Set(chosen.map((item) => item.key)));
		let finalDrafts: Record<string, ImageLayout> = {};
		let finalTextDrafts: Record<string, TextLayout> = {};
		setDragId('__group__');
		setDragGesture('move');

		const update = (clientX: number, clientY: number) => {
			const current = pointerInCanvas(clientX, clientY, canvas.getBoundingClientRect());
			const rawDx = current.x - origin.x;
			const rawDy = current.y - origin.y;
			const proposedLeft = left + boundDx(rawDx);
			const edgeLeft = snapSpanToEdges(snapX(proposedLeft), groupW, xs);
			const snappedLeft = left + boundDx(centeredX(edgeLeft, groupW) - left);
			const proposedTop = Math.max(top + rawDy, 0);
			const snappedTop = Math.max(
				snapSpanToEdges(snapY(proposedTop), groupH, ys),
				0,
			);
			const dx = snappedLeft - left;
			const dy = snappedTop - top;
			const nextDrafts: Record<string, ImageLayout> = {};
			const nextTexts: Record<string, TextLayout> = {};
			for (const item of chosen) {
				if (item.kind === 'text') {
					nextTexts[item.id] = clampTextLayout({
						...(item.layout as TextLayout),
						x: item.layout.x + dx,
						y: item.layout.y + dy,
					});
				} else {
					nextDrafts[item.id] = clampLayout({
						...(item.layout as ImageLayout),
						x: item.layout.x + dx,
						y: item.layout.y + dy,
					});
				}
			}
			finalDrafts = nextDrafts;
			finalTextDrafts = nextTexts;
			setDrafts((current) => ({ ...current, ...nextDrafts }));
			setTextDrafts((current) => ({ ...current, ...nextTexts }));
		};
		const move = (event: PointerEvent) => {
			lastPointer = { x: event.clientX, y: event.clientY };
			update(event.clientX, event.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);

		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setDragId(null);
			setDragGesture(null);
			setCenterGuide(false);
			const updates: CanvasLayoutUpdates = {};
			for (const item of chosen) {
				if (item.kind === 'text') {
					const layout = finalTextDrafts[item.id] ?? textDraftsRef.current[item.id];
					if (layout) {
						committedTextLayouts.current[item.id] = layout;
						(updates.texts ??= {})[item.id] = roundTextLayout(layout);
					}
				} else {
					const layout = finalDrafts[item.id] ?? draftsRef.current[item.id];
					if (!layout) continue;
					if (item.kind === 'image')
						(updates.images ??= {})[item.id] = roundLayout(layout);
					else if (item.kind === 'embed')
						(updates.embeds ??= {})[item.id] = roundLayout(layout);
					else (updates.widgets ??= {})[item.id] = roundLayout(layout);
				}
			}
			if (updates.images || updates.texts || updates.embeds || updates.widgets) {
				if (onBulkLayoutChange) onBulkLayoutChange(updates);
				else {
					for (const [id, layout] of Object.entries(updates.images ?? {}))
						onLayoutChange?.(id, layout);
					for (const [id, layout] of Object.entries(updates.texts ?? {}))
						onTextLayout?.(id, layout);
					for (const [id, layout] of Object.entries(updates.embeds ?? {}))
						onEmbedLayout?.(id, layout);
					for (const [id, layout] of Object.entries(updates.widgets ?? {}))
						onWidgetLayout?.(id, layout);
				}
			}
			// Same echo-hold as the single-item release: committed drafts wait for
			// the parent's next render; only uncommitted ones drop immediately.
			const uncommitted = chosen.filter((item) => {
				const committed =
					item.kind === 'text'
						? updates.texts?.[item.id]
						: updates.images?.[item.id] ?? updates.embeds?.[item.id] ?? updates.widgets?.[item.id];
				if (!committed) return true;
				holdDraftUntilEcho(item.id, item.kind === 'text' ? 'text' : 'item', committed);
				return false;
			});
			if (uncommitted.some((item) => item.kind !== 'text'))
				setDrafts((current) => {
					const next = { ...current };
					for (const item of uncommitted) if (item.kind !== 'text') delete next[item.id];
					return next;
				});
			if (uncommitted.some((item) => item.kind === 'text'))
				setTextDrafts((current) => {
					const next = { ...current };
					for (const item of uncommitted) if (item.kind === 'text') delete next[item.id];
					return next;
				});
		};

		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	const startMarquee = (
		event: React.PointerEvent<HTMLDivElement> | PointerEvent,
		canvas = canvasRef.current,
	) => {
		if (!editable || event.button !== 0 || !canvas) return;
		event.preventDefault();
		canvas.focus({ preventScroll: true });
		const win = canvas.ownerDocument.defaultView ?? window;
		const scope = canvas.closest('.portfolio-page-part') ?? canvas.parentElement ?? canvas;
		const originPage = { x: event.clientX + win.scrollX, y: event.clientY + win.scrollY };
		const candidates = Array.from(
			scope.querySelectorAll<HTMLElement>('.canvas-gallery.editable .canvas-item[data-canvas-selection-key]'),
		);
		const base = new Map<Element, Set<string>>();
		if (event.shiftKey) {
			for (const item of candidates) {
				if (!item.classList.contains('selected')) continue;
				const owner = item.closest('.canvas-gallery');
				const key = item.dataset.canvasSelectionKey;
				if (!owner || !key) continue;
				const keys = base.get(owner) ?? new Set<string>();
				keys.add(key);
				base.set(owner, keys);
			}
		}
		const captureTarget = canvas;
		const pointerId = event.pointerId;
		let lastPointer = { x: event.clientX, y: event.clientY };
		let moved = false;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// Window listeners below still keep the gesture alive in older WebViews.
		}

		const update = (clientX: number, clientY: number) => {
			// Keep the starting point attached to the document during preview scroll,
			// while the pointer end remains attached to the live cursor.
			const x1 = originPage.x - win.scrollX;
			const y1 = originPage.y - win.scrollY;
			const box = {
				left: Math.min(x1, clientX),
				top: Math.min(y1, clientY),
				width: Math.abs(clientX - x1),
				height: Math.abs(clientY - y1),
			};
			moved = moved || box.width > 3 || box.height > 3;
			setMarquee(box);
			const selections = new Map<Element, Set<string>>(
				Array.from(base, ([owner, keys]) => [owner, new Set(keys)]),
			);
			for (const item of candidates) {
				const rect = item.getBoundingClientRect();
				const intersects =
					rect.left < box.left + box.width &&
					rect.right > box.left &&
					rect.top < box.top + box.height &&
					rect.bottom > box.top;
				if (!intersects) continue;
				const owner = item.closest('.canvas-gallery');
				const key = item.dataset.canvasSelectionKey;
				if (!owner || !key) continue;
				const keys = selections.get(owner) ?? new Set<string>();
				keys.add(key);
				selections.set(owner, keys);
			}
			const toolbarCanvas = selections.has(canvas)
				? canvas
				: selections.keys().next().value ?? null;
			scope.dispatchEvent(new CustomEvent<CanvasScopeSelectionDetail>(CANVAS_SCOPE_SELECTION, {
				detail: { selections, toolbarCanvas },
			}));
		};
		const move = (next: PointerEvent) => {
			lastPointer = { x: next.clientX, y: next.clientY };
			update(next.clientX, next.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setMarquee(null);
			if (!moved && !event.shiftKey) {
				scope.dispatchEvent(new CustomEvent<CanvasScopeSelectionDetail>(CANVAS_SCOPE_SELECTION, {
					detail: { selections: new Map(), toolbarCanvas: null },
				}));
			}
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!editable || !canvas) return;
		const scope = canvas.closest('.portfolio-page-part') ?? canvas.parentElement;
		if (!scope) return;
		const applyScopeSelection = (raw: Event) => {
			const detail = (raw as CustomEvent<CanvasScopeSelectionDetail>).detail;
			setSelected(new Set(detail.selections.get(canvas) ?? []));
			setToolbarOwner(detail.toolbarCanvas === canvas);
			setScopedSelectionCount(
				Array.from(detail.selections.values()).reduce((total, keys) => total + keys.size, 0),
			);
		};
		const beginFromScope = (event: Event) => {
			const pointer = event as PointerEvent;
			if (pointer.button !== 0) return;
			// The editor preview may render into an iframe from a parent-window React
			// bundle, so `instanceof Element` is not reliable across the two realms.
			const target = pointer.target && (pointer.target as Element).nodeType === 1
				? pointer.target as Element
				: null;
			if (!target || target.closest('.canvas-layer-toolbar, .section-resize-handle')) return;
			const item = target.closest<HTMLElement>('.canvas-item[data-canvas-selection-key]');
			if (item) {
				if (!pointer.shiftKey) {
					const owner = item.closest('.canvas-gallery');
					const key = item.dataset.canvasSelectionKey;
					if (owner && key) scope.dispatchEvent(new CustomEvent<CanvasScopeSelectionDetail>(CANVAS_SCOPE_SELECTION, {
						detail: { selections: new Map([[owner, new Set([key])]]), toolbarCanvas: owner },
					}));
				}
				return;
			}
			if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
			const canvases = Array.from(scope.querySelectorAll<HTMLElement>('.canvas-gallery.editable'));
			const direct = target.closest<HTMLElement>('.canvas-gallery.editable');
			const owner = direct ?? canvases.reduce<HTMLElement | null>((nearest, candidate) => {
				const rect = candidate.getBoundingClientRect();
				const distance = pointer.clientY < rect.top
					? rect.top - pointer.clientY
					: pointer.clientY > rect.bottom ? pointer.clientY - rect.bottom : 0;
				if (!nearest) return candidate;
				const previous = nearest.getBoundingClientRect();
				const previousDistance = pointer.clientY < previous.top
					? previous.top - pointer.clientY
					: pointer.clientY > previous.bottom ? pointer.clientY - previous.bottom : 0;
				return distance < previousDistance ? candidate : nearest;
			}, null);
			if (owner === canvas) startMarquee(pointer, canvas);
		};
		scope.addEventListener(CANVAS_SCOPE_SELECTION, applyScopeSelection);
		scope.addEventListener('pointerdown', beginFromScope, true);
		return () => {
			scope.removeEventListener(CANVAS_SCOPE_SELECTION, applyScopeSelection);
			scope.removeEventListener('pointerdown', beginFromScope, true);
		};
	}, [editable]);

	const startDrag = (e: React.PointerEvent, img: ResolvedImage, index: number, mode: 'move' | 'resize', corner: ResizeCorner = 'se') => {
		if (!editable || !img.id || e.button !== 0 || !onLayoutChange) return;
		canvasRef.current?.focus({ preventScroll: true });
		const key = imageSelectionKey(img, index);
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			});
			return;
		}
		if (layouts[index].locked) {
			e.preventDefault();
			e.stopPropagation();
			setSelected(new Set([key]));
			return;
		}
		if (mode === 'move' && selected.has(key) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		setSelected(new Set([key]));
		startItemDrag(e, img.id, key, layouts[index], mode, MIN_W, onLayoutChange, false, corner);
	};

	const startEmbedDrag = (e: React.PointerEvent, embed: CanvasEmbed, index: number, mode: 'move' | 'resize', corner: ResizeCorner = 'se') => {
		if (!editable || e.button !== 0 || !onEmbedLayout) return;
		canvasRef.current?.focus({ preventScroll: true });
		const key = `video:${embed.id}`;
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(key) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		setSelected(new Set([key]));
		startItemDrag(e, embed.id, key, embedLayouts[index], mode, MIN_EMBED_W, onEmbedLayout, false, corner);
	};

	const startWidgetDrag = (e: React.PointerEvent, widget: CanvasWidget, index: number, mode: 'move' | 'resize', corner: ResizeCorner = 'se') => {
		if (!editable || e.button !== 0 || !onWidgetLayout) return;
		const target = e.target as HTMLElement;
		if (
			mode === 'move' &&
			!target.closest('.canvas-widget-drag-handle') &&
			target.closest(
				widget.moveImage
					? 'button, a, .inline-carousel-image'
					: 'button, a',
			)
		) return;
		const key = `widget:${widget.id}`;
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			canvasRef.current?.focus({ preventScroll: true });
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(key) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		setSelected(new Set([key]));
		startItemDrag(
			e,
			widget.id,
			key,
			widgetLayouts[index],
			mode,
			MIN_W,
			onWidgetLayout,
			widget.freeResize === true,
			corner,
			widget.autoHeight === true,
		);
	};

	const startTextDrag = (e: React.PointerEvent, text: CanvasText, index: number, mode: 'move' | 'resize', corner: ResizeCorner = 'se') => {
		if (!editable || e.button !== 0) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		canvas.focus({ preventScroll: true });
		e.preventDefault();
		e.stopPropagation();
		const id = text.id;
		const selectionKey = `text:${id}`;
		if (e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setSelected((current) => {
				const next = new Set(current);
				if (next.has(selectionKey)) next.delete(selectionKey);
				else next.add(selectionKey);
				return next;
			});
			return;
		}
		if (mode === 'move' && selected.has(selectionKey) && selected.size > 1) {
			startGroupDrag(e);
			return;
		}
		const captureTarget = e.currentTarget as HTMLElement;
		const pointerId = e.pointerId;
		try {
			captureTarget.setPointerCapture(pointerId);
		} catch {
			// The drag shield keeps pointer events out of hosted iframes.
		}
		setSelected(new Set([selectionKey]));
		const win = canvas.ownerDocument.defaultView ?? window;
		const from = textLayouts[index];
		const origin = pointerInCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect());
		let lastPointer = { x: e.clientX, y: e.clientY };
		const { xs, ys } = neighborEdges(new Set([selectionKey]));
		const fromH = textBottom(from) - from.y;
		let finalDraft: TextLayout | undefined;
		setDragId(id);
		setDragGesture(mode);
		const update = (clientX: number, clientY: number) => {
			const current = pointerInCanvas(clientX, clientY, canvas.getBoundingClientRect());
			const dx = current.x - origin.x;
			const dy = current.y - origin.y;
			const next =
				mode === 'move'
					? {
							...from,
							x: centeredX(
								snapSpanToEdges(snapX(from.x + dx), from.w, xs),
								from.w,
							),
							y: snapSpanToEdges(snapY(from.y + dy), fromH, ys),
						}
					: corner.endsWith('e')
						? { ...from, w: Math.max(snapX(from.x + from.w + dx) - from.x, MIN_TEXT_W) }
						: {
								...from,
								x: Math.min(snapX(from.x + dx), from.x + from.w - MIN_TEXT_W),
								w: Math.max(from.w - dx, MIN_TEXT_W),
							};
			if (mode === 'resize') setCenterGuide(false);
			finalDraft = clampTextLayout(next);
			setTextDrafts((d) => ({ ...d, [id]: finalDraft! }));
		};
		const move = (ev: PointerEvent) => {
			lastPointer = { x: ev.clientX, y: ev.clientY };
			update(ev.clientX, ev.clientY);
		};
		const scroll = () => update(lastPointer.x, lastPointer.y);
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (captureTarget.hasPointerCapture(pointerId))
					captureTarget.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture may already have been released on cancellation.
			}
			setDragId(null);
			setDragGesture(null);
			setCenterGuide(false);
			const done = finalDraft ?? textDraftsRef.current[id];
			if (done && onTextLayout) {
				committedTextLayouts.current[id] = done;
				const rounded = roundTextLayout(done);
				onTextLayout(id, rounded);
				// Hold the draft until the parent echoes the commit (separate root) —
				// clearing now would flash the pre-drag position for a frame.
				holdDraftUntilEcho(id, 'text', rounded);
			} else {
				setTextDrafts((d) => {
					const rest = { ...d };
					delete rest[id];
					return rest;
				});
			}
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};
	const singleSelectedItem =
		selected.size === 1 ? selectionItems().find((item) => selected.has(item.key)) : undefined;
	const singleLockedImage =
		singleSelectedItem?.kind === 'image' && (singleSelectedItem.layout as ImageLayout).locked === true;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!editable || !selected.size || !canvas) {
			setToolbarPosition(null);
			return;
		}
		const win = canvas.ownerDocument.defaultView ?? window;
		const update = () => {
			const rect = canvas.getBoundingClientRect();
			if (rect.bottom <= 0 || rect.top >= win.innerHeight) {
				setToolbarPosition(null);
				return;
			}
			setToolbarPosition({
				top: Math.max(8, rect.top + 8),
				left: Math.min(Math.max(8, rect.left + 8), Math.max(8, win.innerWidth - 80)),
			});
		};
		update();
		win.addEventListener('scroll', update, true);
		win.addEventListener('resize', update);
		return () => {
			win.removeEventListener('scroll', update, true);
			win.removeEventListener('resize', update);
		};
	}, [editable, selected.size]);

	return (
		<div
			ref={canvasRef}
			className={`canvas-gallery ${editable ? 'editable' : ''}`}
			style={{ '--ch': String(height) } as CSSProperties}
			tabIndex={editable ? -1 : undefined}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) startMarquee(event, event.currentTarget);
			}}
		>
			{editable && centerGuide && (
				<div className="canvas-center-guide" aria-hidden="true" />
			)}
			{editable && marquee && canvasRef.current && createPortal(
				<div
					className="canvas-marquee"
					style={marquee}
					aria-hidden="true"
				/>,
				canvasRef.current.ownerDocument.body,
			)}
			{editable && toolbarOwner && selected.size > 0 && toolbarPosition && canvasRef.current && createPortal(
				<div
					className="canvas-layer-toolbar"
					style={{
						top: Math.max(8, toolbarPosition.top + toolbarOffset.y),
						left: Math.max(8, toolbarPosition.left + toolbarOffset.x),
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						className="canvas-toolbar-grip"
						aria-label="Drag to move this toolbar"
						title="Drag to move this toolbar"
						onPointerDown={startToolbarDrag}
					>
						<span aria-hidden="true">⠿</span>
					</button>
					{toolbarToolsOpen && !singleLockedImage && (
						<div className="canvas-nudge-controls" role="group" aria-label="Nudge selected canvas items">
							{([
								['left', '←', -1, 0],
								['up', '↑', 0, -1],
								['down', '↓', 0, 1],
								['right', '→', 1, 0],
							] as const).map(([direction, label, dx, dy]) => (
								<button
									key={direction}
									type="button"
									className="canvas-nudge-button"
									data-canvas-nudge={direction}
									aria-label={`Nudge selected ${direction}`}
									onClick={(event) => {
										event.stopPropagation();
										nudgeSelection(dx, dy);
									}}
									title={`Nudge ${direction} (Arrow ${direction[0].toUpperCase()}${direction.slice(1)})`}
								>{label}</button>
							))}
						</div>
					)}
					{scopedSelectionCount === 1 && selected.size === 1 && (
						<>
							<button
								type="button"
								className="canvas-tool-button"
								onPointerDown={(event) => runToolbarPointerAction(event, () => moveSelectionLayer('front'))}
								onKeyDown={(event) => runToolbarKeyAction(event, () => moveSelectionLayer('front'))}
								title="Bring to front (])"
								aria-label="Bring to front"
							>
								<CanvasToolIcon type="front" />
							</button>
							<button
								type="button"
								className="canvas-tool-button"
								onPointerDown={(event) => runToolbarPointerAction(event, () => moveSelectionLayer('back'))}
								onKeyDown={(event) => runToolbarKeyAction(event, () => moveSelectionLayer('back'))}
								title="Send to back ([)"
								aria-label="Send to back"
							>
								<CanvasToolIcon type="back" />
							</button>
							{singleSelectedItem?.kind === 'image' && (
								<button
									type="button"
									className={`canvas-tool-button canvas-lock-button${singleLockedImage ? ' locked' : ''}`}
									onPointerDown={(event) => runToolbarPointerAction(event, toggleSelectedImageLock)}
									onKeyDown={(event) => runToolbarKeyAction(event, toggleSelectedImageLock)}
									title={singleLockedImage ? 'Unlock image' : 'Lock image position and size'}
									aria-label={singleLockedImage ? 'Unlock image' : 'Lock image position and size'}
									aria-pressed={singleLockedImage}
								>
									<CanvasToolIcon type={singleLockedImage ? 'lock' : 'unlock'} />
								</button>
							)}
						</>
					)}
					{onDeleteSelection && (
						<button
							type="button"
							className="canvas-tool-button canvas-delete-button"
							onPointerDown={(event) => runToolbarPointerAction(event, deleteCurrentSelection)}
							onKeyDown={(event) => runToolbarKeyAction(event, deleteCurrentSelection)}
							title={
								selected.size > 1
									? `Remove the ${selected.size} selected items from this page (Delete)`
									: 'Remove from this page (Delete)'
							}
							aria-label={
								selected.size > 1
									? `Remove the ${selected.size} selected items from this page`
									: 'Remove from this page'
							}
						>
							<CanvasToolIcon type="trash" />
						</button>
					)}
					<button
						type="button"
						className="canvas-toolbar-tools-toggle"
						aria-expanded={toolbarToolsOpen}
						aria-label={toolbarToolsOpen ? 'Hide nudge arrows and shortcuts' : 'Show nudge arrows and shortcuts'}
						title={toolbarToolsOpen ? 'Hide nudge arrows and shortcuts' : 'Show nudge arrows and shortcuts'}
						onClick={(event) => {
							event.stopPropagation();
							toggleToolbarTools();
						}}
					>
						{toolbarToolsOpen ? '«' : '»'}
					</button>
					{/* The hint keeps its width (visibility, not display) while the readout
					    overlays it, so the toolbar doesn't change size on every keypress.
					    Collapsed toolbars still surface the readout during a nudge. */}
					{(toolbarToolsOpen || nudgeReadout) && (
						<span
							className={`canvas-nudge-hint-slot${nudgeReadout ? ' has-readout' : ''}`}
							title="Shift + arrow keys resizes · Alt/Option + arrow keys nudges 10x"
							aria-live="polite"
						>
							<span className="canvas-nudge-hint-text">
								{scopedSelectionCount > 1
									? `${scopedSelectionCount} selected · arrows nudge`
									: singleLockedImage
									? 'Position & size locked'
									: 'Arrows nudge (⌥ 10x) · ⇧ resize'}
							</span>
							{nudgeReadout && (
								<span className="canvas-nudge-readout">
									{`x ${formatCanvasPercent(nudgeReadout.x)}% · y ${formatCanvasPercent(nudgeReadout.y)}%`}
								</span>
							)}
						</span>
					)}
				</div>,
				canvasRef.current.ownerDocument.body,
			)}
			{editable && guide.kind === 'squares' && (
				<div
					className="canvas-grid-overlay"
					style={
						{
							'--gn': String(guide.n),
							// Cell height in % of the canvas height, precomputed so the CSS
							// stays a plain calc (cells are square in canvas-width units).
							'--gh': `${(10000 / (guide.n * height)).toFixed(4)}%`,
						} as CSSProperties
					}
					aria-hidden="true"
				/>
			)}
			{editable && guide.kind === 'columns' && (
				<div className="canvas-column-overlay" aria-hidden="true">
					{columnSpans(guide.n).map(({ x, w }, i) => (
						<span key={i} style={{ left: `${x}%`, width: `${w}%` }} />
					))}
				</div>
			)}
			{editable && dragId && (
				<div
					className={`canvas-drag-shield ${dragGesture ?? 'move'}`}
					aria-hidden="true"
				/>
			)}
			{renderItems.map((item) => {
				if (item.type === 'image') {
					const i = item.index;
					const img = images[i];
					const key = keyOf(img, i);
					const l = layouts[i];
					const vars = {
						...phoneVars(item.key), ...artworkEffectStyle(img), '--x': String(l.x), '--y': String((l.y / height) * 100),
						'--w': String(l.w), '--ar': String(l.ar),
						zIndex:
							dragId === img.id || (dragId === '__group__' && selected.has(item.key))
								? DRAG_Z
								: imageZ(i),
					} as CSSProperties;
					const dragging =
						dragId === img.id || (dragId === '__group__' && selected.has(item.key));
					const href = editable ? undefined : imageClickHref(img);
					return (
						<div key={item.key} data-canvas-selection-key={item.key} className={`canvas-item ${artworkEffectClass(img)} ${dragging ? 'dragging' : ''} ${selected.has(item.key) ? 'selected' : ''} ${l.locked ? 'locked' : ''}`} style={vars}
							onPointerDown={editable ? (e) => startDrag(e, img, i, 'move') : undefined}
							role={!editable && !href && onOpen ? 'button' : undefined} tabIndex={!editable && !href && onOpen ? 0 : undefined}
							aria-haspopup={!editable && !href && onOpen ? 'dialog' : undefined}
							aria-label={!editable && !href && onOpen ? `Open ${img.title || img.alt || alt} in image viewer` : undefined}
							onClick={!editable && !href && onOpen ? (e) => onOpen(i, e.currentTarget) : undefined}
							onKeyDown={!editable && !href && onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(i, e.currentTarget); } } : undefined}>
							<div className="canvas-artwork-frame">
								<img src={img.src} srcSet={img.srcSet} alt={img.decorative ? '' : img.alt || img.title || alt} loading="lazy" decoding="async" draggable={false}
									style={{
										objectPosition: `${img.focusX ?? 50}% ${img.focusY ?? 50}%`,
										scale: img.cropZoom && img.cropZoom > 1 ? String(img.cropZoom) : undefined,
										transformOrigin: `${img.focusX ?? 50}% ${img.focusY ?? 50}%`,
									}}
									onError={img.sample ? (event) => showSampleUnavailable(event.currentTarget) : undefined}
									onLoad={editable ? (e) => measure(key, e.currentTarget) : undefined}
									ref={editable ? (el) => { if (el?.complete) measure(key, el); } : undefined} />
							</div>
							{href && (
								<a
									className="artwork-link-overlay"
									href={href}
									target={externalImageLink(href) ? '_blank' : undefined}
									rel={externalImageLink(href) ? 'noopener noreferrer' : undefined}
									aria-label={`Go to ${img.title || img.alt || 'linked image'}`}
									onClick={(event) => onImageLink?.(href, event)}
								/>
							)}
							{editable && l.locked && <span className="canvas-lock-badge" title="Image position and size are locked" aria-label="Locked image">🔒</span>}
							{editable && !l.locked && !multiSelected && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => (
								<span key={corner} className={`canvas-resize corner-${corner}`} title={`Resize from ${corner.toUpperCase()} corner`} onPointerDown={(e) => startDrag(e, img, i, 'resize', corner)} aria-hidden="true" />
							))}
						</div>
					);
				}
				if (item.type === 'embed') {
					const i = item.index;
					const embed = embeds[i];
					const l = embedLayouts[i];
					const vars = {
						...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100),
						'--w': String(l.w), '--ar': String(l.ar),
						zIndex:
							dragId === embed.id || (dragId === '__group__' && selected.has(item.key))
								? DRAG_Z
								: embedZ(i),
					} as CSSProperties;
					const spec = embedSpec(embed.url);
					const buyHref = spec ? null : stripePaymentLink(embed.url);
					const href = spec || buyHref ? null : safeHref(embed.url);
					const kind = spec?.kind ?? embedKindForInput(embed.url) ?? embed.kind ?? 'video';
					const label = spec?.provider ?? embedKindLabel(kind);
					return (
						<div
							key={item.key}
							data-canvas-selection-key={item.key}
							data-preview-block={embed.id}
							onPointerDownCapture={() => onSelectBlock?.(embed.id)}
							className={`canvas-item canvas-embed-item canvas-embed-${kind} ${
								dragId === embed.id || (dragId === '__group__' && selected.has(item.key))
									? 'dragging'
									: ''
							} ${selected.has(item.key) ? 'selected' : ''}`}
							style={vars}
							onPointerDown={(event) => {
								onSelectBlock?.(embed.id);
								if (editable) startEmbedDrag(event, embed, i, 'move');
							}}
						>
							{spec ? (
								<iframe
									src={spec.src}
									title={spec.title}
									loading="lazy"
									allow={spec.allow}
									referrerPolicy="strict-origin-when-cross-origin"
									allowFullScreen={spec.allowFullScreen}
								/>
							) : buyHref ? (
								<div className="canvas-embed-fallback canvas-embed-buy">
									{editable ? (
										<span className="canvas-embed-buy-button">Buy</span>
									) : (
										<a
											className="canvas-embed-buy-button"
											href={buyHref}
											target="_blank"
											rel="noopener noreferrer"
											aria-label="Buy on Stripe"
										>
											Buy ↗
										</a>
									)}
								</div>
							) : (
								<div className="canvas-embed-fallback">
									{href && /^https?:/.test(href) && !editable ? (
										<a href={href} target="_blank" rel="noopener noreferrer">
											{kind === 'audio' ? 'Listen' : kind === 'map' ? 'Open map' : 'Watch video'} ↗
										</a>
									) : (
										<span>{embedKindLabel(kind)}</span>
									)}
								</div>
							)}
							{editable && (
								<button
									type="button"
									className="canvas-embed-drag-handle"
									aria-label={`Drag ${label}`}
									title={`Drag ${label}`}
									onPointerDown={(event) => startEmbedDrag(event, embed, i, 'move')}
								>
									<span aria-hidden="true">⠿</span> {label}
								</button>
							)}
							{editable && !multiSelected && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => (
								<span key={corner} className={`canvas-resize corner-${corner}`} title={`Resize from ${corner.toUpperCase()} corner`} onPointerDown={(e) => startEmbedDrag(e, embed, i, 'resize', corner)} aria-hidden="true" />
							))}
						</div>
					);
				}
				if (item.type === 'widget') {
					const i = item.index;
					const widget = widgets[i];
					const l = widgetLayouts[i];
					const dragging = dragId === widget.id;
					const vars = {
						...phoneVars(item.key),
						'--x': String(l.x),
						'--y': String((l.y / height) * 100),
						'--w': String(l.w),
						'--ar': String(l.ar),
						zIndex: dragging ? DRAG_Z : widgetZ(i),
					} as CSSProperties;
					return (
						<div
							key={item.key}
							data-canvas-selection-key={item.key}
							data-preview-block={widget.id}
							ref={(el) => { widgetEls.current[widget.id] = el; }}
							onPointerDownCapture={() => onSelectBlock?.(widget.id.split('::', 1)[0])}
							className={`canvas-item canvas-widget-item ${widget.autoHeight ? 'canvas-auto-height' : ''} ${dragging ? 'dragging' : ''} ${selected.has(item.key) ? 'selected' : ''}`}
							style={vars}
							onPointerDown={(event) => {
								onSelectBlock?.(widget.id.split('::', 1)[0]);
								if (editable) startWidgetDrag(event, widget, i, 'move');
							}}
							onClickCapture={
								editable
									? (event) => {
											if (draggedClickRef.current !== widget.id) return;
											event.preventDefault();
											event.stopPropagation();
											draggedClickRef.current = null;
										}
									: undefined
							}
						>
							<div className="canvas-widget-content">{widget.content}</div>
							{editable && widget.dragLabel && (
								<button
									type="button"
									className="canvas-embed-drag-handle canvas-widget-drag-handle"
									aria-label={widget.dragLabel}
									title={widget.dragLabel}
									onPointerDown={(event) => {
										onSelectBlock?.(widget.id.split('::', 1)[0]);
										startWidgetDrag(event, widget, i, 'move');
									}}
								>
									<span aria-hidden="true">⠿</span> {widget.dragLabel}
								</button>
							)}
							{editable && !widget.moveImage && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => (
								<span key={corner} className={`canvas-resize canvas-widget-resize corner-${corner}`} onPointerDown={(event) => startWidgetDrag(event, widget, i, 'resize', corner)} title={`Resize from ${corner.toUpperCase()} corner`} aria-hidden="true" />
							))}
						</div>
					);
				}
				const i = item.index;
				const text = shownTexts[i];
				const l = textLayouts[i];
				const vars = {
					...phoneVars(item.key), '--x': String(l.x), '--y': String((l.y / height) * 100), '--w': String(l.w),
					zIndex:
						dragId === text.id || (dragId === '__group__' && selected.has(item.key))
							? DRAG_Z
							: textZ(i),
				} as CSSProperties;
				// Text being edited in place: the caret owns the pointer, so drag
				// and resize handles step aside until editing ends.
				const editingHere = inlineTextEditing?.blockId === text.id;
				return (
					<div key={item.key} data-canvas-selection-key={item.key} data-preview-block={text.id} onPointerDownCapture={() => onSelectBlock?.(text.id)} className={`canvas-item canvas-text-item ${
						dragId === text.id || (dragId === '__group__' && selected.has(item.key))
							? 'dragging'
							: ''
					} ${selected.has(item.key) ? 'selected' : ''}${editingHere ? ' inline-editing' : ''}`} style={vars}
						ref={(el) => { textEls.current[text.id] = el; }} onPointerDown={(event) => {
							onSelectBlock?.(text.id);
							if (editable && !editingHere) startTextDrag(event, text, i, 'move');
						}}>
						<div className={`canvas-text align-${text.align ?? 'left'}`}>
							{editingHere && inlineTextEditing ? (
								<InlineTextEditor
									text={text.text}
									richText={text.richText}
									legacyStyle={text.style}
									legacyAlign={text.align}
									fontFamily={text.fontFamily}
									onChange={inlineTextEditing.onChange}
									onDone={inlineTextEditing.onDone}
								/>
							) : text.text.trim() ? (
								<TextContent
									text={text.text}
									richText={text.richText}
									fontFamily={text.fontFamily}
									style={text.style}
									link={editable ? undefined : text.link}
									kinetic={text.kinetic}
									kineticTarget={text.kineticTarget}
								/>
							) : <em className="canvas-text-empty">Empty text — double-click to write</em>}
						</div>
						{editable && !multiSelected && !editingHere && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => (
							<span key={corner} className={`canvas-resize corner-${corner}`} title={`Resize from ${corner.toUpperCase()} corner`} onPointerDown={(e) => startTextDrag(e, text, i, 'resize', corner)} aria-hidden="true" />
						))}
					</div>
				);
			})}
		</div>
	);
}
