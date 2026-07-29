import { useEffect } from 'react';

type AnalyticsEvent = 'open' | 'view' | 'inquiry';

function send(page: string, event: AnalyticsEvent, duration?: number) {
	const body = JSON.stringify({ page, event, duration });
	try {
		if (navigator.sendBeacon) {
			navigator.sendBeacon('/__hangwork/event', new Blob([body], { type: 'application/json' }));
			return;
		}
		void fetch('/__hangwork/event', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			keepalive: true,
		});
	} catch {
		/* Analytics must never interfere with the portfolio itself. */
	}
}

/** Privacy-light first-party analytics: no cookies, fingerprint, referrer, or IP
 * is written. Only page totals, time totals and inquiry counts are retained. */
export default function Analytics({ page }: { page: string }) {
	useEffect(() => {
		let started = performance.now();
		let sentForSegment = false;
		send(page, 'open');
		const flush = () => {
			if (sentForSegment) return;
			const seconds = Math.round((performance.now() - started) / 1000);
			if (seconds >= 1) send(page, 'view', Math.min(seconds, 60 * 60));
			sentForSegment = true;
		};
		const visibility = () => {
			if (document.hidden) flush();
			else {
				started = performance.now();
				sentForSegment = false;
			}
		};
		const inquiry = () => send(page, 'inquiry');
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('pagehide', flush);
		window.addEventListener('hangwork:inquiry', inquiry);
		return () => {
			flush();
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('pagehide', flush);
			window.removeEventListener('hangwork:inquiry', inquiry);
		};
	}, [page]);
	return null;
}
