// Chrome for the dev-only template studio: a quiet bar over the normal editor
// with the template's name, dirty state, and the save-to-repo action. All the
// serialization logic lives in lib/template-studio.ts; this file owns the
// fetch lifecycle against the dev API and the visible state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store';
import type { Content } from '../../lib/content';
import { cloneContent } from '../lib/content-init';
import {
	TEMPLATE_STUDIO_API,
	docToTemplateContent,
	presetTokensFromTheme,
	resolveStudioContent,
	type TemplateStudioIntent,
} from '../lib/template-studio';
import { withBase } from '../../portfolio/types';

export type TemplateStudioStatus = 'probing' | 'unavailable' | 'unknown' | 'ready';

export interface TemplateStudioState {
	intent: TemplateStudioIntent;
	status: TemplateStudioStatus;
	name: string;
	dirty: boolean;
	saving: boolean;
	savedAt: number | null;
	/** Save-attempt failures returned by the dev API (or client validation). */
	issues: string[];
	/** Live reasons the current document cannot become a template (uploads…). */
	blockers: string[];
	save: () => Promise<void>;
	revert: () => void;
}

export function useTemplateStudio(intent: TemplateStudioIntent | null): TemplateStudioState | null {
	const editor = useEditor();
	// The store value is recreated on every doc change; effects reach the latest
	// one through a ref so booting doesn't re-run per edit.
	const editorRef = useRef(editor);
	editorRef.current = editor;
	const [status, setStatus] = useState<TemplateStudioStatus>('probing');
	const [name, setName] = useState('');
	const [lastSaved, setLastSaved] = useState<Content | null>(null);
	const [issues, setIssues] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	useEffect(() => {
		if (!intent) return;
		let cancelled = false;
		void (async () => {
			const healthy = await fetch(`${TEMPLATE_STUDIO_API}/health`)
				.then((response) => response.ok)
				.catch(() => false);
			if (cancelled) return;
			if (!healthy) {
				setStatus('unavailable');
				return;
			}
			const resolved = resolveStudioContent(intent);
			if (!resolved) {
				setStatus('unknown');
				return;
			}
			setName(resolved.name);
			setLastSaved(cloneContent(resolved.content));
			editorRef.current.startTemplate(resolved.content);
			setStatus('ready');
		})();
		return () => {
			cancelled = true;
		};
	}, [intent]);

	const doc = editor.doc;
	const serialized = useMemo(
		() => (intent?.kind === 'starter' && doc && status === 'ready' ? docToTemplateContent(doc) : null),
		[intent, doc, status],
	);
	const dirty = useMemo(() => {
		if (!intent || !doc || !lastSaved || status !== 'ready') return false;
		if (intent.kind === 'preset')
			return (
				JSON.stringify(presetTokensFromTheme(doc.content.theme)) !==
				JSON.stringify(presetTokensFromTheme(lastSaved.theme))
			);
		if (!serialized?.content) return true;
		return JSON.stringify(serialized.content) !== JSON.stringify(lastSaved);
	}, [intent, doc, lastSaved, status, serialized]);

	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [dirty]);

	if (!intent) return null;

	const save = async () => {
		const currentDoc = editorRef.current.doc;
		if (!currentDoc || saving) return;
		let payload: unknown;
		if (intent.kind === 'starter') {
			const result = docToTemplateContent(currentDoc);
			if (result.blockers.length || !result.content) {
				setIssues(
					result.blockers.length ? result.blockers : ['This document cannot be serialized as a template.'],
				);
				return;
			}
			payload = result.content;
		} else {
			payload = presetTokensFromTheme(currentDoc.content.theme);
		}
		setSaving(true);
		setIssues([]);
		try {
			const response = await fetch(`${TEMPLATE_STUDIO_API}/save`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: intent.kind === 'starter' ? 'starter-content' : 'preset-tokens',
					id: intent.id,
					payload,
				}),
			});
			const body = (await response.json().catch(() => ({}))) as { issues?: string[] };
			if (!response.ok) {
				setIssues(body.issues?.length ? body.issues : ['The dev server could not save this template.']);
				return;
			}
			setLastSaved(intent.kind === 'starter' ? (payload as Content) : cloneContent(currentDoc.content));
			setSavedAt(Date.now());
		} catch {
			setIssues(['The dev server did not respond. Is npm run dev still running?']);
		} finally {
			setSaving(false);
		}
	};

	const revert = () => {
		if (!lastSaved) return;
		setIssues([]);
		editorRef.current.startTemplate(cloneContent(lastSaved));
	};

	return {
		intent,
		status,
		name,
		dirty,
		saving,
		savedAt,
		issues,
		blockers: serialized?.blockers ?? [],
		save,
		revert,
	};
}

export function TemplateStudioBar({ studio, base }: { studio: TemplateStudioState; base: string }) {
	const label = studio.name || studio.intent.id;
	const visibleIssues = studio.issues.length ? studio.issues : studio.blockers;
	return (
		<div className="template-studio-bar" role="region" aria-label="Template studio">
			<div className="template-studio-row">
				<span className="template-studio-title">
					Template studio — {label}
					{studio.intent.kind === 'preset' && (
						<span className="template-studio-note">saves theme tokens only</span>
					)}
				</span>
				<span className="template-studio-state" role="status" aria-live="polite">
					{studio.saving ? 'Saving…' : studio.dirty ? 'Unsaved changes' : studio.savedAt ? 'Saved' : ''}
				</span>
				<button
					type="button"
					className="btn-ghost"
					onClick={studio.revert}
					disabled={!studio.dirty || studio.saving}
					title="Back to the last saved template"
				>
					Revert
				</button>
				<a className="btn-link template-studio-dashboard" href={withBase(base, 'template-studio/')}>
					Open dashboard
				</a>
				<button
					type="button"
					className="template-studio-save"
					onClick={() => void studio.save()}
					disabled={!studio.dirty || studio.saving}
				>
					{studio.intent.kind === 'preset' ? 'Save theme to preset' : 'Save to template'}
				</button>
			</div>
			{visibleIssues.length > 0 && (
				<ul className="template-studio-issues">
					{visibleIssues.map((issue, index) => (
						<li key={index}>{issue}</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function TemplateStudioUnavailable({
	base,
	reason,
}: {
	base: string;
	reason: 'unavailable' | 'unknown';
}) {
	return (
		<div className="template-studio-empty">
			<h1>Template studio</h1>
			<p>
				{reason === 'unknown'
					? 'That template was not found in the catalog.'
					: 'The template studio runs only on the dev server, where it can save template files into the repo.'}
			</p>
			{reason === 'unavailable' && (
				<p>
					Start it with <code>npm run dev</code>, then reopen this page.
				</p>
			)}
			<a className="btn-link" href={withBase(base, 'editor/')}>
				Open the editor
			</a>
		</div>
	);
}
