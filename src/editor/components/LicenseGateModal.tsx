// The license gate. Shown when someone tries to publish without an active license. The primary
// path is "Buy a license" (opens the Lemon Squeezy overlay; auto-unlocks on return). Entering a
// key by hand is a secondary fallback, tucked behind a disclosure so it doesn't clutter the flow.
// When a stored license simply couldn't be verified (offline / blocked), the modal opens in a
// "verify" mode with Retry as the primary action — a paying customer is never shown "Buy" first.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { LicenseError } from '../lib/license/client';
import { CHECKOUT_URL } from '../lib/license/config';
import { markResumePublish } from '../lib/license/flow';
import { getLicense } from '../lib/license/session';
import { currentPriceText, pricing, regularPriceText } from '../../lib/pricing';

type Mode = 'verify' | 'buy' | 'key';

export default function LicenseGateModal({
	onClose,
	onUnlocked,
	activate,
	revalidate,
	context = 'publish',
}: {
	onClose: () => void;
	onUnlocked: () => void;
	activate: (key: string) => Promise<void>;
	revalidate: () => Promise<boolean>;
	/** 'publish' = mid-publish gate (default); 'unlock' = paying upfront, before building. */
	context?: 'publish' | 'unlock';
}) {
	const [key, setKey] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// A stored key that failed validation only from a network error → lead with Retry. Otherwise
	// lead with Buy; the manual key field shows only on request — unless there's no checkout
	// configured, in which case entering a key is the only way to unlock, so start there.
	const [mode, setMode] = useState<Mode>(() => (getLicense() ? 'verify' : CHECKOUT_URL ? 'buy' : 'key'));

	// Open the Lemon Squeezy checkout as an on-page overlay (lemon.js, loaded in editor.astro).
	// Falls back to a full-page navigation if the script was blocked or hasn't loaded. When the
	// buyer set out to PUBLISH, leave a breadcrumb so that, after the checkout redirect reloads
	// the page and auto-unlocks, we resume their draft and reopen Publish where they left off.
	// Paying upfront ('unlock') leaves no breadcrumb — there's nothing to resume into.
	const buyLicense = () => {
		if (context === 'publish') markResumePublish();
		const ls = window.LemonSqueezy;
		if (ls?.Url?.Open) ls.Url.Open(CHECKOUT_URL);
		else window.location.assign(CHECKOUT_URL);
	};

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

	const retryVerify = async () => {
		setBusy(true);
		setError(null);
		try {
			if (await revalidate()) {
				onUnlocked();
			} else {
				// Definitive answer: the stored key is no longer valid — fall back to the buy flow.
				setError('Your saved license is no longer valid on this device.');
				setMode(CHECKOUT_URL ? 'buy' : 'key');
			}
		} catch (err) {
			setError(
				err instanceof LicenseError
					? err.friendly
					: 'Couldn’t reach the license service. Check your connection and try again.',
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			title="Pay once, publish forever"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					{mode === 'verify' ? (
						<button type="button" className="btn-primary" onClick={retryVerify} disabled={busy}>
							{busy ? 'Checking…' : 'Retry verification'}
						</button>
					) : mode === 'key' ? (
						<button type="button" className="btn-primary" onClick={submit} disabled={busy || !key.trim()}>
							{busy ? 'Activating…' : 'Activate'}
						</button>
					) : (
						<button type="button" className="btn-primary" onClick={buyLicense} disabled={busy}>
							Pay {currentPriceText}
						</button>
					)}
				</>
			}
		>
			{mode === 'verify' ? (
				<>
					<p className="modal-lead">
						You have a license on this device, but we couldn’t verify it just now. Check your connection (or an
						ad/privacy blocker blocking lemonsqueezy.com) and retry.
					</p>
					{error && <p className="field-error">{error}</p>}
				</>
			) : (
				<>
					{CHECKOUT_URL && (
						<div className="checkout-summary" aria-label="Hangwork checkout summary">
							<p className="checkout-title">
								<span>Hangwork — one-time payment</span>
								<span className="checkout-price">
									{pricing.launchPricingActive && <del>{regularPriceText}</del>}
									<strong>{currentPriceText}</strong>
								</span>
							</p>
							<p>Editor, yourname.hangwork.art, and all future updates. Nothing renews.</p>
							<p>{pricing.refundDays}-day refund, no questions asked.</p>
						</div>
					)}
					<p className="modal-lead">
						{context === 'unlock'
							? 'Building and previewing are free — pay once now and publishing is unlocked whenever you’re ready, on any device. A secure checkout opens right here. Your work is saved.'
							: 'Building and previewing are free. Publishing needs a one-time license. A secure checkout opens right here, and publishing continues on its own after you pay. Your work is saved.'}
					</p>

					{mode === 'key' ? (
						<>
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
									Don’t have one?{' '}
									<button type="button" className="btn-link" onClick={buyLicense} disabled={busy}>
										Pay {currentPriceText}
									</button>
								</p>
							)}
						</>
					) : (
						<>
							{error && <p className="field-error">{error}</p>}
							<p className="modal-note">
								Already have a license key?{' '}
								<button type="button" className="btn-link" onClick={() => setMode('key')}>
									Enter it here
								</button>
							</p>
						</>
					)}
				</>
			)}
		</Modal>
	);
}
