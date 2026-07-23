// Permanently delete the published site. Deletion is irreversible — the Worker erases
// every R2 object, detaches custom domains at the Cloudflare edge, and drops the D1/KV
// rows — so this modal makes the user (a) reckon with the export-first "own it forever"
// guarantee and (b) type the site's name to confirm. The account (not the license) and
// any purchase survive; a later publish just starts a brand-new site.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountError } from '../lib/account/client';
import type { AccountSession } from './useAccount';

export default function DeleteSiteModal({
	account,
	siteName,
	liveUrl,
	onExport,
	exporting,
	onClose,
	onDeleted,
}: {
	account: AccountSession;
	/** What the user must type to confirm — their site's name (subdomain). */
	siteName: string;
	liveUrl?: string;
	/** Kick off the "Download my site (zip)" flow in the parent, if available. */
	onExport?: () => void;
	exporting?: boolean;
	onClose: () => void;
	onDeleted: () => void;
}) {
	const [typed, setTyped] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const expected = siteName || 'DELETE';
	const matches = typed.trim() === expected;

	const remove = async () => {
		if (!matches || busy) return;
		setBusy(true);
		setError(null);
		try {
			await account.deleteSite(typed.trim());
			onDeleted();
		} catch (err) {
			setError(err instanceof AccountError ? err.friendly : err instanceof Error ? err.message : 'The site could not be deleted.');
			setBusy(false);
		}
	};

	return (
		<Modal
			title="Delete this site"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					<button type="button" className="btn-danger" onClick={remove} disabled={!matches || busy}>
						{busy ? 'Deleting…' : 'Delete permanently'}
					</button>
				</>
			}
		>
			<p className="modal-lead" style={{ marginTop: 0 }}>
				This permanently deletes {liveUrl ? <strong>{liveUrl}</strong> : 'your published site'} — every page and
				uploaded file, and any custom domain connection. <strong>It can’t be undone.</strong>
			</p>
			<p className="modal-note">
				Your account and your license stay yours. Your editable work in this browser is untouched, and you can publish
				a fresh site any time.
			</p>

			{onExport && (
				<div className="delete-export-nudge">
					<p className="modal-note" style={{ margin: 0 }}>
						Want a copy first? Download your site as plain files — it works on any host, with or without Hangwork.
					</p>
					<button type="button" className="btn-secondary" onClick={onExport} disabled={exporting}>
						{exporting ? 'Preparing your files…' : 'Download my site (zip)'}
					</button>
				</div>
			)}

			<label className="field">
				<span className="field-label">
					Type <code>{expected}</code> to confirm
				</span>
				<input
					className="text-input"
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					placeholder={expected}
					autoComplete="off"
					spellCheck={false}
					disabled={busy}
				/>
			</label>
			{error && <p className="publish-error">{error}</p>}
		</Modal>
	);
}
