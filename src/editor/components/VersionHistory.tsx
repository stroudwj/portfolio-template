import { useState } from 'react';
import { useEditor } from '../store';
import {
	deleteSavedVersion,
	loadSavedVersions,
	saveNamedVersion,
	type SavedVersion,
} from '../lib/persistence';
import { Section } from './ui/controls';

const readableDate = (value: string): string => {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? 'Unknown date'
		: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Deliberate snapshots for experiments. These stay in the browser;
 * the downloadable backup remains the portable, take-it-with-you copy. */
export default function VersionHistory() {
	const { doc, openDoc } = useEditor();
	const [initial] = useState<{ versions: SavedVersion[]; error: string | null }>(() => {
		try {
			return { versions: loadSavedVersions(), error: null };
		} catch (error) {
			return { versions: [], error: error instanceof Error ? error.message : 'Saved versions could not be read.' };
		}
	});
	const [versions, setVersions] = useState<SavedVersion[]>(initial.versions);
	const [name, setName] = useState('');
	const [message, setMessage] = useState<string | null>(initial.error);
	if (!doc) return null;

	const save = async () => {
		if (initial.error) {
			setMessage(initial.error);
			return;
		}
		if (versions.length >= 8 && !confirm('This browser keeps your latest 8 saved versions. Save this one and replace the oldest?')) return;
		try {
			const version = await saveNamedVersion(doc, name || `Version from ${new Date().toLocaleDateString()}`);
			setVersions((current) => [version, ...current].slice(0, 8));
			setName('');
			setMessage('Version saved in this browser.');
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'This version could not be saved.');
		}
	};

	const restore = async (version: SavedVersion) => {
		if (!confirm(`Restore “${version.name}”? Your current work will be saved first, so you can come back to it.`)) return;
		try {
			const safety = await saveNamedVersion(doc, 'Before restoring an older version');
			await openDoc(version.doc);
			setVersions([safety, ...loadSavedVersions().filter((item) => item.id !== safety.id)].slice(0, 8));
			setMessage(`Restored “${version.name}”.`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'That version could not be restored safely.');
		}
	};

	const remove = (version: SavedVersion) => {
		if (!confirm(`Delete the saved version “${version.name}”?`)) return;
		try {
			deleteSavedVersion(version.id);
			setVersions((current) => current.filter((item) => item.id !== version.id));
			setMessage('Saved version deleted.');
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'That saved version could not be deleted.');
		}
	};

	return (
		<Section title="Saved versions" sectionKey="_saved-versions" defaultCollapsed>
			<p className="muted" style={{ marginTop: 0 }}>
				Save a snapshot before trying a new look. The latest 8 stay in this browser. Download a backup if you want a copy you can keep somewhere else.
			</p>
			<label className="field-label" htmlFor="version-name">Version name (optional)</label>
			<div className="version-save-row">
				<input
					id="version-name"
					className="text-input"
					value={name}
					placeholder="Optional name, such as Before exhibition update"
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							void save();
						}
					}}
				/>
				<button type="button" className="btn-secondary" onClick={() => void save()} disabled={!!initial.error}>Save this version</button>
			</div>
			{versions.length ? (
				<div className="version-list" role="list" aria-label="Saved versions">
					{versions.map((version) => (
						<div className="version-row" role="listitem" key={version.id}>
							<div><strong>{version.name}</strong><small>{readableDate(version.savedAt)}</small></div>
							<button type="button" className="btn-secondary" aria-label={`Restore saved version ${version.name}`} onClick={() => void restore(version)}>Restore</button>
							<button type="button" className="btn-icon danger" aria-label={`Delete saved version ${version.name}`} onClick={() => remove(version)}>✕</button>
						</div>
					))}
				</div>
			) : (
				<p className="muted">No saved versions yet.</p>
			)}
			{message && <p className="muted" role="status" aria-live="polite">{message}</p>}
		</Section>
	);
}
