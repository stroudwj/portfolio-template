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

/** Collapsed/expanded choices survive reloads — one localStorage map for all sections. */
const COLLAPSE_STORE = 'portfolio-editor-collapsed';
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

export function Section({
	title,
	children,
	action,
	sectionKey,
	defaultCollapsed = false,
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
}) {
	const [collapsed, setCollapsed] = useState(
		() => (sectionKey ? (loadCollapsed()[sectionKey] ?? defaultCollapsed) : false),
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

	const toggle = () => {
		if (!sectionKey) return;
		setCollapsed(!collapsed);
		storeCollapsed(sectionKey, !collapsed);
	};

	return (
		<section className={`editor-section ${collapsed ? 'collapsed' : ''}`} data-section={sectionKey}>
			<header className="editor-section-head">
				{sectionKey ? (
					<h2>
						<button type="button" className="section-toggle" onClick={toggle} aria-expanded={!collapsed}>
							<span className="section-chevron" aria-hidden="true">
								{collapsed ? '▸' : '▾'}
							</span>
							{title}
						</button>
					</h2>
				) : (
					<h2>{title}</h2>
				)}
				{action}
			</header>
			{!collapsed && children}
		</section>
	);
}
