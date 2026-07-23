// The published site's client runtime (Direction D, Subsystem 4).
//
// Browser static-gen (src/editor/lib/staticgen/) renders each page's HTML with
// `renderToString(<Portfolio …/>)` at publish time; this entry re-renders the SAME
// component with the SAME props (inlined as window.__HW__ by the page shell) and
// hydrates it, which switches on every interaction the editor preview has: lightbox,
// canvas galleries, nav magnify, contact forms, creative effects.
//
// Built by scripts/build-hydration-runtime.mjs into public/hangwork-runtime/
// (hydrate.js + portfolio.css — importing Portfolio pulls every component stylesheet),
// which the editor fetches at publish time and ships with each site as /_hw/*.
import { hydrateRoot } from 'react-dom/client';
import Portfolio from './Portfolio';
import type { PortfolioData } from './types';

declare global {
	interface Window {
		__HW__?: { page: string; data: PortfolioData };
	}
}

const boot = window.__HW__;
const root = document.getElementById('hw-root');
if (boot && root) {
	hydrateRoot(root, <Portfolio page={boot.page} base="/" {...boot.data} />, {
		// A markup mismatch falls back to a client render of the same tree — never fatal.
		onRecoverableError: () => {},
	});
}
