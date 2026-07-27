// The pay-once publishing gate. Polar checkout is created server-side for the signed-in
// account; its signed webhook grants account access, and the return flow resumes publishing.
// Tester access remains an intentionally separate, audited manual entitlement.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountError } from '../lib/account/client';
import { clearResumePublish, markResumePublish, startPolarCheckout } from '../lib/polar-checkout';
import { currentPriceText, pricing, regularPriceText } from '../../lib/pricing';

export default function LicenseGateModal({
	onClose,
	onUnlocked,
	redeemTestAccess,
	context = 'publish',
}: {
	onClose: () => void;
	onUnlocked: () => void;
	redeemTestAccess: (code: string) => Promise<void>;
	/** 'publish' = resume Publish after checkout; 'unlock' = pay before building. */
	context?: 'publish' | 'unlock';
}) {
	const [testerMode, setTesterMode] = useState(false);
	const [code, setCode] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const buyLicense = async () => {
		setBusy(true);
		setError(null);
		if (context === 'publish') markResumePublish();
		try {
			await startPolarCheckout();
		} catch (err) {
			if (context === 'publish') clearResumePublish();
			setError(
				err instanceof AccountError
					? err.friendly
					: 'Polar checkout could not be opened. Check your connection and try again.',
			);
			setBusy(false);
		}
	};

	const redeem = async () => {
		if (!code.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await redeemTestAccess(code.trim());
			onUnlocked();
		} catch (err) {
			setError(err instanceof AccountError ? err.friendly : 'That code didn’t work. Please double-check and try again.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			title={testerMode ? 'Unlock tester publishing' : 'Pay once, publish forever'}
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					{testerMode ? (
						<button type="button" className="btn-primary" onClick={redeem} disabled={busy || !code.trim()}>
							{busy ? 'Unlocking…' : 'Unlock tester access'}
						</button>
					) : (
						<button type="button" className="btn-primary" onClick={() => void buyLicense()} disabled={busy}>
							{busy ? 'Opening Polar…' : `Pay ${currentPriceText}`}
						</button>
					)}
				</>
			}
		>
			{testerMode ? (
				<>
					<p className="modal-lead">
						Enter the tester access code Hangwork gave you. It unlocks publishing for this signed-in account
						without a purchase.
					</p>
					<label className="field">
						<span className="field-label">Tester access code</span>
						<input
							className={`text-input${error ? ' invalid' : ''}`}
							type="text"
							autoComplete="off"
							placeholder="Enter the code Hangwork gave you"
							value={code}
							onChange={(event) => setCode(event.target.value)}
							onKeyDown={(event) => event.key === 'Enter' && void redeem()}
						/>
						{error && <span className="field-error">{error}</span>}
					</label>
					<p className="modal-note">
						Ready to buy instead?{' '}
						<button
							type="button"
							className="btn-link"
							onClick={() => {
								setTesterMode(false);
								setCode('');
								setError(null);
							}}
							disabled={busy}
						>
							Open secure checkout
						</button>
					</p>
				</>
			) : (
				<>
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
					<p className="modal-lead">
						{context === 'unlock'
							? 'Building and previewing are free — pay once now and publishing is unlocked whenever you’re ready, on any device. Polar handles the secure checkout. Your work is saved.'
							: 'Building and previewing are free. Publishing needs a one-time license. Polar handles the secure checkout, and publishing continues after payment. Your work is saved.'}
					</p>
					{error && <p className="field-error">{error}</p>}
					<p className="modal-note">
						Testing Hangwork?{' '}
						<button
							type="button"
							className="btn-link"
							onClick={() => {
								setTesterMode(true);
								setError(null);
							}}
							disabled={busy}
						>
							Enter a tester access code
						</button>
					</p>
				</>
			)}
		</Modal>
	);
}
