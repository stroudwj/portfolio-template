// Phone detection for the editor door. Arranging pieces on the freeform canvas is
// desktop work; on phones the editor shows a read-only preview plus the door screen
// (send-me-the-link) instead of a fiddly touch canvas. Only PHONES are gated —
// tablets and touch laptops pass through:
//   - coarse primary pointer (finger), AND
//   - the device's smaller screen side under 600px (phones in either orientation;
//     iPads and up are wider than that on their short side).
// Screen dimensions (not the viewport) so rotating a phone can't sidestep the door,
// and narrowing a desktop window can't trigger it.
//
// TODO(mobile-light-edit): a later, separate flow should let phones add a piece to an
// EXISTING published gallery (photograph a finished work, hang it). That flow would
// bypass this gate deliberately; first-build stays desktop-only.
import { useSyncExternalStore } from 'react';

const PHONE_MAX_SHORT_SIDE = 600;

export function isPhoneContext(): boolean {
	if (typeof window === 'undefined') return false;
	const shortSide = Math.min(window.screen.width, window.screen.height);
	return shortSide < PHONE_MAX_SHORT_SIDE && window.matchMedia('(pointer: coarse)').matches;
}

function subscribe(onChange: () => void): () => void {
	// Effectively static per device, but a desktop DevTools device-mode toggle flips it.
	const mq = window.matchMedia('(pointer: coarse)');
	mq.addEventListener('change', onChange);
	window.addEventListener('resize', onChange);
	return () => {
		mq.removeEventListener('change', onChange);
		window.removeEventListener('resize', onChange);
	};
}

/** True when the editor should show the phone door instead of the editing UI. */
export function usePhoneContext(): boolean {
	return useSyncExternalStore(subscribe, isPhoneContext, () => false);
}
