// Tiny form primitives shared by every editor section.
import { useEffect, useState } from 'react';
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
}

/** Keep the live preview and the matching block card in the page editor in sync. */
export function selectPreviewBlock(pageKey: string, blockId: string) {
	window.dispatchEvent(
		new CustomEvent<PreviewBlockSelection>(SELECT_PREVIEW_BLOCK_EVENT, {
			detail: { pageKey, blockId },
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
