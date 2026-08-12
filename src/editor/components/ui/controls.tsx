// Tiny form primitives shared by every editor section.
import {
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}) {
	return (
		<label className="field">
			<span className="field-label">{label}</span>
			{children}
			{hint && !error && <span className="field-hint">{hint}</span>}
			{error && <span className="field-error">{error}</span>}
		</label>
	);
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
	return <input className="text-input" {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className="text-area" {...props} />;
}

/** A slider's typed twin: edits flow both ways, and half-typed numbers hold
 *  until they parse (or the field commits on blur/Enter). Out-of-range values
 *  clamp to the slider's bounds; junk input reverts to the current value. */
export function SliderNumberInput({
	value,
	min,
	max,
	step,
	suffix,
	ariaLabel,
	onChange,
}: {
	value: number;
	min: number;
	max: number;
	step: number;
	suffix: string;
	ariaLabel: string;
	onChange: (value: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const apply = (raw: string) => {
		const parsed = Number(raw);
		if (!Number.isFinite(parsed) || raw.trim() === '') return;
		const clamped = Math.min(Math.max(parsed, min), max);
		if (clamped !== value) onChange(clamped);
	};
	return (
		<span className="slider-number-field">
			<input
				type="number"
				min={min}
				max={max}
				step={step}
				aria-label={ariaLabel}
				value={draft ?? String(value)}
				onChange={(event) => {
					setDraft(event.target.value);
					apply(event.target.value);
				}}
				onBlur={(event) => {
					setDraft(null);
					apply(event.target.value);
				}}
				onKeyDown={(event) => {
					if (event.key !== 'Enter') return;
					setDraft(null);
					apply(event.currentTarget.value);
				}}
			/>
			{suffix}
		</span>
	);
}

export interface InspectorTab<T extends string> {
	id: T;
	label: string;
	meta?: ReactNode;
}

/** Compact, inspector-style navigation for related property groups. */
export function InspectorTabs<T extends string>({
	items,
	active,
	onChange,
	ariaLabel,
}: {
	items: readonly InspectorTab<T>[];
	active: T;
	onChange: (id: T) => void;
	ariaLabel: string;
}) {
	return (
		<div className="inspector-tabs" role="tablist" aria-label={ariaLabel}>
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					className={active === item.id ? 'active' : ''}
					role="tab"
					aria-selected={active === item.id}
					onClick={() => onChange(item.id)}
				>
					<span>{item.label}</span>
					{item.meta && <small>{item.meta}</small>}
				</button>
			))}
		</div>
	);
}

/** Secondary guidance stays one quiet line until the user asks for it. */
export function HelpDisclosure({
	label = 'How this works',
	children,
	className = '',
}: {
	label?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<details className={`help-disclosure ${className}`.trim()}>
			<summary>
				<span aria-hidden="true">?</span>
				{label}
			</summary>
			<div>{children}</div>
		</details>
	);
}

/** The "?" hover companion to HelpDisclosure: advice that used to be an inline
 *  paragraph lives behind a small circled ? on the heading row. The tip shows
 *  instantly on hover or keyboard focus (no delay), Esc dismisses it, and
 *  screen readers get the text through aria-describedby. The bubble is fixed-
 *  positioned so the sidebar's overflow never clips it, and it clamps itself
 *  inside the viewport. */
export function HelpTip({ tip, label = 'More about this' }: { tip: string; label?: string }) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const bubbleRef = useRef<HTMLSpanElement>(null);

	useLayoutEffect(() => {
		if (!open) return;
		const trigger = triggerRef.current;
		const bubble = bubbleRef.current;
		if (!trigger || !bubble) return;
		const anchor = trigger.getBoundingClientRect();
		const size = bubble.getBoundingClientRect();
		const margin = 8;
		const left = Math.min(
			Math.max(margin, anchor.left + anchor.width / 2 - size.width / 2),
			Math.max(margin, window.innerWidth - size.width - margin),
		);
		const below = anchor.bottom + 4;
		const top = below + size.height > window.innerHeight - margin ? anchor.top - size.height - 4 : below;
		bubble.style.left = `${Math.round(left)}px`;
		bubble.style.top = `${Math.round(top)}px`;

		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		const close = () => setOpen(false);
		window.addEventListener('keydown', onKey);
		// The fixed bubble can't follow its anchor — close instead of drifting.
		window.addEventListener('scroll', close, true);
		window.addEventListener('resize', close);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('scroll', close, true);
			window.removeEventListener('resize', close);
		};
	}, [open]);

	return (
		<>
			<button
				type="button"
				ref={triggerRef}
				className="help-tip"
				aria-label={label}
				aria-describedby={id}
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				onClick={() => setOpen((current) => !current)}
			>
				<span aria-hidden="true">?</span>
			</button>
			<span role="tooltip" id={id} ref={bubbleRef} className={`help-tip-bubble${open ? ' open' : ''}`}>
				{tip}
			</span>
		</>
	);
}

/** Collapsed/expanded choices survive reloads — one localStorage map for all sections. */
const COLLAPSE_STORE = 'portfolio-editor-collapsed-v2';
const EXPAND_EVENT = 'editor-expand-section';

function loadCollapsed(): Record<string, boolean> {
	try {
		return JSON.parse(localStorage.getItem(COLLAPSE_STORE) ?? '{}') as Record<string, boolean>;
	} catch {
		return {};
	}
}

function storeCollapsed(key: string, collapsed: boolean) {
	try {
		localStorage.setItem(COLLAPSE_STORE, JSON.stringify({ ...loadCollapsed(), [key]: collapsed }));
	} catch {
		/* storage blocked/full — the toggle still works for this session */
	}
}

/** Expand the section registered under `key` (e.g. before scrolling the panel to it). */
export function expandSection(key: string) {
	window.dispatchEvent(new CustomEvent(EXPAND_EVENT, { detail: key }));
}

/** The editing column is split into category tabs (Theme / Content / …). Panes
 *  stay mounted (hidden with CSS) so section state and scroll targets survive;
 *  this event lets faraway code (the preview's nav) switch the visible tab. */
const SHOW_TAB_EVENT = 'editor-show-tab';

export function showEditorTab(tab: string) {
	window.dispatchEvent(new CustomEvent(SHOW_TAB_EVENT, { detail: tab }));
}

export function onShowEditorTab(fn: (tab: string) => void): () => void {
	const handler = (e: Event) => fn((e as CustomEvent<string>).detail);
	window.addEventListener(SHOW_TAB_EVENT, handler);
	return () => window.removeEventListener(SHOW_TAB_EVENT, handler);
}

const SHOW_PREVIEW_PAGE_EVENT = 'editor-show-preview-page';

/** Show a page in the live preview even when it is a draft or hidden from the menu. */
export function showPreviewPage(pageKey: string) {
	window.dispatchEvent(new CustomEvent(SHOW_PREVIEW_PAGE_EVENT, { detail: pageKey }));
}

export function onShowPreviewPage(fn: (pageKey: string) => void): () => void {
	const handler = (event: Event) => fn((event as CustomEvent<string>).detail);
	window.addEventListener(SHOW_PREVIEW_PAGE_EVENT, handler);
	return () => window.removeEventListener(SHOW_PREVIEW_PAGE_EVENT, handler);
}

const OPEN_TEMPLATE_PICKER_EVENT = 'editor-open-template-picker';

/** Open the landing-page look picker over the preview (Theme panel link). */
export function openTemplatePicker() {
	window.dispatchEvent(new CustomEvent(OPEN_TEMPLATE_PICKER_EVENT));
}

export function onOpenTemplatePicker(fn: () => void): () => void {
	const handler = () => fn();
	window.addEventListener(OPEN_TEMPLATE_PICKER_EVENT, handler);
	return () => window.removeEventListener(OPEN_TEMPLATE_PICKER_EVENT, handler);
}

const PREVIEW_TYPE_MOTION_EVENT = 'editor-preview-type-motion';

export interface TypeMotionPreviewRequest {
	pageKey: string;
	target: string;
	token: number;
}

/** Switch the live preview to a page and restart one heading/text animation. */
export function previewTypeMotion(pageKey: string, target: string) {
	window.dispatchEvent(
		new CustomEvent<TypeMotionPreviewRequest>(PREVIEW_TYPE_MOTION_EVENT, {
			detail: { pageKey, target, token: Date.now() },
		}),
	);
}

export function onPreviewTypeMotion(
	fn: (request: TypeMotionPreviewRequest) => void,
): () => void {
	const handler = (event: Event) =>
		fn((event as CustomEvent<TypeMotionPreviewRequest>).detail);
	window.addEventListener(PREVIEW_TYPE_MOTION_EVENT, handler);
	return () => window.removeEventListener(PREVIEW_TYPE_MOTION_EVENT, handler);
}

const REVEAL_EDITOR_SECTION_EVENT = 'editor-reveal-section';

export interface EditorSectionReveal {
	pageKey: string;
	sectionId: string;
}

/** Scroll the editing column to a section's card and expand it — the floating
 *  preview controls' "Edit section" lands here. */
export function revealEditorSection(pageKey: string, sectionId: string) {
	window.dispatchEvent(
		new CustomEvent<EditorSectionReveal>(REVEAL_EDITOR_SECTION_EVENT, {
			detail: { pageKey, sectionId },
		}),
	);
}

export function onRevealEditorSection(
	fn: (reveal: EditorSectionReveal) => void,
): () => void {
	const handler = (event: Event) =>
		fn((event as CustomEvent<EditorSectionReveal>).detail);
	window.addEventListener(REVEAL_EDITOR_SECTION_EVENT, handler);
	return () => window.removeEventListener(REVEAL_EDITOR_SECTION_EVENT, handler);
}

const SELECT_PREVIEW_BLOCK_EVENT = 'editor-select-preview-block';

export interface PreviewBlockSelection {
	pageKey: string;
	blockId: string;
	/** Gallery entry id when the click landed on a specific artwork (canvas items). */
	imageId?: string;
	/** The clicked <img>'s src — lets grid images resolve to their entry. */
	imageSrc?: string;
}

/** Keep the live preview and the matching block card in the page editor in sync. */
export function selectPreviewBlock(
	pageKey: string,
	blockId: string,
	image?: { imageId?: string; imageSrc?: string },
) {
	window.dispatchEvent(
		new CustomEvent<PreviewBlockSelection>(SELECT_PREVIEW_BLOCK_EVENT, {
			detail: { pageKey, blockId, ...image },
		}),
	);
}

export function onSelectPreviewBlock(
	fn: (selection: PreviewBlockSelection) => void,
): () => void {
	const handler = (event: Event) =>
		fn((event as CustomEvent<PreviewBlockSelection>).detail);
	window.addEventListener(SELECT_PREVIEW_BLOCK_EVENT, handler);
	return () => window.removeEventListener(SELECT_PREVIEW_BLOCK_EVENT, handler);
}

const EDIT_TEXT_ON_PAGE_EVENT = 'editor-edit-text-on-page';

export interface TextBlockEditRequest {
	pageKey: string;
	blockId: string;
}

/** Send a text block's words to the page: the one place they are edited. The
 *  block's card in the editing column keeps its settings and points here, so
 *  there is no second copy of the words to fall out of step with the caret. */
export function editTextOnPage(pageKey: string, blockId: string) {
	window.dispatchEvent(
		new CustomEvent<TextBlockEditRequest>(EDIT_TEXT_ON_PAGE_EVENT, {
			detail: { pageKey, blockId },
		}),
	);
}

export function onEditTextOnPage(fn: (request: TextBlockEditRequest) => void): () => void {
	const handler = (event: Event) => fn((event as CustomEvent<TextBlockEditRequest>).detail);
	window.addEventListener(EDIT_TEXT_ON_PAGE_EVENT, handler);
	return () => window.removeEventListener(EDIT_TEXT_ON_PAGE_EVENT, handler);
}

const PREVIEW_STRUCTURE_EVENT = 'editor-preview-structure-tool';

/** The page-structure tools — Layers and Add block. Their cards belong beside
 *  the work, inside the preview iframe, but their buttons belong in the preview
 *  toolbar so nothing floats over the site's own navigation. The button lives in
 *  the editor document and the state lives in the iframe's React root, so the
 *  click travels as an event and the open state comes back through the store
 *  below. */
export type PreviewStructureTool = 'layers' | 'add-block';

export function togglePreviewStructureTool(tool: PreviewStructureTool) {
	window.dispatchEvent(
		new CustomEvent<PreviewStructureTool>(PREVIEW_STRUCTURE_EVENT, { detail: tool }),
	);
}

export function onTogglePreviewStructureTool(
	fn: (tool: PreviewStructureTool) => void,
): () => void {
	const handler = (event: Event) =>
		fn((event as CustomEvent<PreviewStructureTool>).detail);
	window.addEventListener(PREVIEW_STRUCTURE_EVENT, handler);
	return () => window.removeEventListener(PREVIEW_STRUCTURE_EVENT, handler);
}

export interface PreviewStructureState {
	layers: boolean;
	addBlock: boolean;
}

const NO_STRUCTURE_TOOL: PreviewStructureState = { layers: false, addBlock: false };
let structureState: PreviewStructureState = NO_STRUCTURE_TOOL;
const structureListeners = new Set<() => void>();

/** The edit layer reports which structure card is open so the toolbar buttons
 *  can show it (and so an Escape inside the preview un-presses them). */
export function setPreviewStructureState(next: PreviewStructureState) {
	if (next.layers === structureState.layers && next.addBlock === structureState.addBlock)
		return;
	structureState = next;
	for (const fn of structureListeners) fn();
}

export function usePreviewStructureState(): PreviewStructureState {
	return useSyncExternalStore(
		(fn) => {
			structureListeners.add(fn);
			return () => structureListeners.delete(fn);
		},
		() => structureState,
		() => NO_STRUCTURE_TOOL,
	);
}

const REVEAL_GALLERY_IMAGE_EVENT = 'editor-reveal-gallery-image';

export interface GalleryImageReveal {
	folder: string;
	entryId: string;
}

/** Scroll the editing column to one image's row and flash it — clicking an
 *  artwork in the preview lands the eye on that row, not the block top. */
export function revealGalleryImage(folder: string, entryId: string) {
	window.dispatchEvent(
		new CustomEvent<GalleryImageReveal>(REVEAL_GALLERY_IMAGE_EVENT, {
			detail: { folder, entryId },
		}),
	);
}

export function onRevealGalleryImage(
	fn: (reveal: GalleryImageReveal) => void,
): () => void {
	const handler = (event: Event) =>
		fn((event as CustomEvent<GalleryImageReveal>).detail);
	window.addEventListener(REVEAL_GALLERY_IMAGE_EVENT, handler);
	return () => window.removeEventListener(REVEAL_GALLERY_IMAGE_EVENT, handler);
}

const EDITOR_TOAST_EVENT = 'editor-toast';

/** One quiet confirmation line ("Sent to workbench") from anywhere in the editor. */
export function showEditorToast(message: string) {
	window.dispatchEvent(new CustomEvent<string>(EDITOR_TOAST_EVENT, { detail: message }));
}

/** Renders the shared toast; mounted once near the editor root. */
export function EditorToastHost() {
	const [toast, setToast] = useState<string | null>(null);
	const timerRef = useRef<number | undefined>(undefined);
	useEffect(() => {
		const handler = (event: Event) => {
			setToast((event as CustomEvent<string>).detail);
			window.clearTimeout(timerRef.current);
			timerRef.current = window.setTimeout(() => setToast(null), 3200);
		};
		window.addEventListener(EDITOR_TOAST_EVENT, handler);
		return () => {
			window.removeEventListener(EDITOR_TOAST_EVENT, handler);
			window.clearTimeout(timerRef.current);
		};
	}, []);
	if (!toast) return null;
	return (
		<div className="editor-toast" role="status" aria-live="polite">
			{toast}
		</div>
	);
}

export function Section({
	title,
	children,
	action,
	sectionKey,
	defaultCollapsed = false,
	onCollapsedChange,
}: {
	title: string;
	children: ReactNode;
	action?: ReactNode;
	/**
	 * Stable id: scroll target (the preview nav scrolls to a page's editor),
	 * expandSection() address, and collapse-memory key. Sections without one
	 * don't collapse.
	 */
	sectionKey?: string;
	defaultCollapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
}) {
	const [collapsed, setCollapsed] = useState(
		() => (sectionKey ? (loadCollapsed()[sectionKey] ?? defaultCollapsed) : defaultCollapsed),
	);

	useEffect(() => {
		if (!sectionKey) return;
		const onExpand = (e: Event) => {
			if ((e as CustomEvent<string>).detail !== sectionKey) return;
			setCollapsed(false);
			storeCollapsed(sectionKey, false);
		};
		window.addEventListener(EXPAND_EVENT, onExpand);
		return () => window.removeEventListener(EXPAND_EVENT, onExpand);
	}, [sectionKey]);
	useEffect(() => {
		onCollapsedChange?.(collapsed);
	}, [collapsed, onCollapsedChange]);

	const toggle = () => {
		setCollapsed(!collapsed);
		if (sectionKey) storeCollapsed(sectionKey, !collapsed);
	};

	return (
		<section className={`editor-section ${collapsed ? 'collapsed' : ''}`} data-section={sectionKey}>
			<header className="editor-section-head">
				<h2>
					<button type="button" className="section-toggle" onClick={toggle} aria-expanded={!collapsed}>
						<span className="section-chevron" aria-hidden="true">
							{collapsed ? '▸' : '▾'}
						</span>
						{title}
					</button>
				</h2>
				{action}
			</header>
			{!collapsed && children}
		</section>
	);
}
