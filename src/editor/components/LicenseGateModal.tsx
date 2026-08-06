// The publishing license gate. Polar checkout is created server-side for the signed-in
// account using the lifetime product; signed webhooks keep the
// account entitlement in sync and the return flow resumes publishing.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountError } from '../lib/account/client';
import {
	clearResumePublish,
	markResumePublish,
	startPolarCheckout,
	type HangworkPlan,
} from '../lib/polar-checkout';
import {
	currentPriceText,
	monthlyPriceText,
	monthlyUpgradeCreditText,
	pricing,
} from '../../lib/pricing';

export default function LicenseGateModal({
	onClose,
	context = 'publish',
	defaultPlan = 'lifetime',
	currentPlan = null,
}: {
	onClose: () => void;
	/** 'publish' = resume Publish after checkout; 'unlock' = pay before building. */
	context?: 'publish' | 'unlock';
	defaultPlan?: HangworkPlan;
	currentPlan?: HangworkPlan | null;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedPlan, setSelectedPlan] = useState<HangworkPlan>(
		currentPlan === 'monthly' ? 'lifetime' : defaultPlan,
	);
	const upgradePrice = pricing.lifetimePrice - pricing.monthlyUpgradeCredit;

	const buyLicense = async () => {
		setBusy(true);
		setError(null);
		if (context === 'publish') markResumePublish();
		try {
			await startPolarCheckout(selectedPlan);
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
			title={currentPlan === 'monthly' ? 'Upgrade to lifetime' : 'Choose your Hangwork plan'}
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={() => void buyLicense()} disabled={busy}>
						{busy
							? 'Opening Polar…'
							: currentPlan === 'monthly'
								? `Upgrade for $${upgradePrice} — ${monthlyUpgradeCreditText} off`
								: selectedPlan === 'monthly'
									? `Go live free for ${pricing.monthlyTrialDays} days`
									: `Pay ${currentPriceText} once`}
					</button>
				</>
			}
		>
			<div className="checkout-options">
				<button
					type="button"
					className={`checkout-option${selectedPlan === 'lifetime' ? ' selected' : ''}`}
					aria-pressed={selectedPlan === 'lifetime'}
					onClick={() => setSelectedPlan('lifetime')}
					disabled={busy}
				>
					<span className="checkout-option-heading">
						<span>Lifetime access</span>
						<span className="checkout-price">
							<strong>{currentPlan === 'monthly' ? `$${upgradePrice}` : currentPriceText}</strong>
							<small>{currentPlan === 'monthly' ? `${monthlyUpgradeCreditText} off` : 'once'}</small>
						</span>
					</span>
					<span>Every feature, including site and backup downloads. Pay once and keep access.</span>
				</button>
				<button
					type="button"
					className={`checkout-option${selectedPlan === 'monthly' ? ' selected' : ''}`}
					aria-pressed={selectedPlan === 'monthly'}
					onClick={() => setSelectedPlan('monthly')}
					disabled={busy || currentPlan === 'monthly'}
				>
					<span className="checkout-option-heading">
						<span>{currentPlan === 'monthly' ? 'Monthly access — current plan' : 'Monthly access'}</span>
						<span className="checkout-price">
							<strong>{monthlyPriceText}</strong>
							<small>/ month</small>
						</span>
					</span>
					<span>
						{currentPlan === 'monthly'
							? 'Everything except downloads. Keep paying to retain access; your site goes offline if the subscription ends.'
							: `First ${pricing.monthlyTrialDays} days free — cancel before they end and pay nothing. Then ${monthlyPriceText}/month; everything except downloads, and your site goes offline if the subscription ends.`}
					</span>
				</button>
			</div>
			<p className="modal-lead">
				{currentPlan === 'monthly'
					? `Your first monthly payment counts toward lifetime: ${monthlyUpgradeCreditText} is applied automatically at checkout.`
					: context === 'unlock'
						? 'Building and previewing are free. Choose a plan when you are ready; Polar handles the secure checkout and your work stays saved.'
						: 'Publishing needs an active plan. Polar handles the secure checkout and your work stays saved.'}
			</p>
			<p className="modal-note">
				Both plans include the editor, yourname.hangwork.art, publishing, custom domains, and future editor updates.
				{' '}{pricing.refundDays}-day refund, no questions asked.
			</p>
			{error && <p className="field-error">{error}</p>}
		</Modal>
	);
}
