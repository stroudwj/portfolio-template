import { useEffect, useState } from 'react';
import {
	getPolarCheckoutStatus,
	isPolarReviewMode,
	polarCheckoutReturn,
	startPolarCheckout,
} from '../lib/polar-checkout';

type DemoState = 'ready' | 'loading' | 'checking' | 'succeeded' | 'error';

/**
 * A deliberately isolated merchant-review surface. It appears only with
 * `?polar_review=1`, creates a production Polar Checkout Session through our Worker,
 * and verifies the returned session. Normal Lemon Squeezy checkout remains available
 * while both merchant applications are being reviewed.
 */
export default function PolarCheckoutDemo() {
	const [visible] = useState(() => isPolarReviewMode());
	const [state, setState] = useState<DemoState>(() => (polarCheckoutReturn() ? 'checking' : 'ready'));
	const [message, setMessage] = useState('');

	useEffect(() => {
		const returned = polarCheckoutReturn();
		if (!returned) return;
		let alive = true;
		void getPolarCheckoutStatus(returned.checkoutId)
			.then((status) => {
				if (!alive) return;
				if (status === 'succeeded') {
					setState('succeeded');
					setMessage('Polar recorded the order and granted the Hangwork license benefit.');
				} else {
					setState('error');
					setMessage(`Polar returned checkout status “${status}”.`);
				}
			})
			.catch(() => {
				if (!alive) return;
				setState('error');
				setMessage('The checkout returned, but its status could not be confirmed.');
			});
		return () => {
			alive = false;
		};
	}, []);

	if (!visible) return null;

	const start = async () => {
		setState('loading');
		setMessage('');
		try {
			await startPolarCheckout();
		} catch {
			setState('error');
			setMessage('Polar checkout could not be opened. Please try again.');
		}
	};

	return (
		<aside className={`polar-demo polar-demo-${state}`} role="status" aria-live="polite">
			<div>
				<strong>{state === 'succeeded' ? 'Polar checkout complete' : 'Hangwork checkout with Polar'}</strong>
				<p>
					{state === 'succeeded'
						? message
						: state === 'checking'
							? 'Confirming the completed payment…'
							: message ||
								'$49 one-time purchase. Polar reviewers can apply the 100% review discount supplied with our application.'}
				</p>
			</div>
			{state !== 'succeeded' && state !== 'checking' && (
				<button type="button" className="btn-primary" onClick={start} disabled={state === 'loading'}>
					{state === 'loading'
						? 'Opening Polar…'
						: state === 'error'
							? 'Try checkout again'
							: 'Continue to secure checkout'}
				</button>
			)}
		</aside>
	);
}
