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
	context = 'publish',
}: {
	onClose: () => void;
	/** 'publish' = resume Publish after checkout; 'unlock' = pay before building. */
	context?: 'publish' | 'unlock';
}) {
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

	return (
		<Modal
			title="Own Hangwork forever"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={() => void buyLicense()} disabled={busy}>
						{busy ? 'Opening Polar…' : `Pay ${currentPriceText} once`}
					</button>
				</>
			}
		>
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
		</Modal>
	);
}
