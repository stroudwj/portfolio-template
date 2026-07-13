// Unlock publishing with a license key. Shown when someone tries to publish without an
// active license. Mirrors ConnectGitHubModal's shape and copy conventions.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { LicenseError } from '../lib/license/client';
import { CHECKOUT_URL } from '../lib/license/config';

export default function LicenseGateModal({
	onClose,
	onUnlocked,
	activate,
}: {
	onClose: () => void;
	onUnlocked: () => void;
	activate: (key: string) => Promise<void>;
}) {
	const [key, setKey] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!key.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await activate(key.trim());
			onUnlocked();
		} catch (err) {
			setError(err instanceof LicenseError ? err.friendly : 'That key didn’t work. Please double-check and try again.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			title="Unlock publishing"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={submit} disabled={busy || !key.trim()}>
						{busy ? 'Unlocking…' : 'Unlock'}
					</button>
				</>
			}
		>
			<p className="modal-lead">
				Building and previewing are free — publishing to your own website needs a license key. Paste yours below to unlock
				it on this device.
			</p>

			<label className="field">
				<span className="field-label">License key</span>
				<input
					className={`text-input${error ? ' invalid' : ''}`}
					type="text"
					autoComplete="off"
					placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && submit()}
				/>
				{error && <span className="field-error">{error}</span>}
			</label>

			{CHECKOUT_URL && (
				<p className="modal-note">
					Don’t have a key yet?{' '}
					<a href={CHECKOUT_URL} target="_blank" rel="noopener noreferrer">
						Buy a license ↗
					</a>{' '}
					— then come back and paste it here.
				</p>
			)}
		</Modal>
	);
}
