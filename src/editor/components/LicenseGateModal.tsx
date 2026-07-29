// The publishing license gate. Polar checkout is created server-side for the signed-in
// account using the lifetime product; signed webhooks keep the
// account entitlement in sync and the return flow resumes publishing.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountError } from '../lib/account/client';
import { clearResumePublish, markResumePublish, startPolarCheckout } from '../lib/polar-checkout';
import { currentPriceText, pricing } from '../../lib/pricing';

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
			title={testerMode ? 'Unlock tester publishing' : 'Own Hangwork forever'}
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
							{busy ? 'Opening Polar…' : `Pay ${currentPriceText} once`}
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
							Buy lifetime access
						</button>
					</p>
				</>
			) : (
				<>
					<div className="checkout-options">
						<div className="checkout-option selected">
							<span className="checkout-option-heading">
								<span>Lifetime access</span>
								<span className="checkout-price">
									<strong>{currentPriceText}</strong>
									<small>once</small>
								</span>
							</span>
							<span>Yours forever, with no renewal or subscription.</span>
						</div>
					</div>
					<p className="modal-lead">
						{context === 'unlock'
							? 'Building and previewing are free. Buy lifetime access when you are ready; Polar handles the secure checkout and your work stays saved.'
							: 'Publishing needs a lifetime license. Polar handles the secure checkout and your work stays saved.'}
					</p>
					<p className="modal-note">
						Your license includes the editor, yourname.hangwork.art, publishing, and future editor updates.
						{' '}{pricing.refundDays}-day refund, no questions asked.
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
