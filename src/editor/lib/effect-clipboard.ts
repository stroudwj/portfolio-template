import type { ArtworkEffectConfig, PageConfig } from '../../lib/content';

const KEY = 'portfolio-editor:effect-clipboard';

export type EffectClipboard =
	| { kind: 'artwork'; effects?: ArtworkEffectConfig }
	| { kind: 'page'; page: PageConfig };

export function writeEffectClipboard(value: EffectClipboard): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(value));
		window.dispatchEvent(new Event('portfolio-effect-clipboard'));
	} catch {
		/* A blocked session store only makes copy/paste unavailable for this tab. */
	}
}

export function readEffectClipboard(): EffectClipboard | null {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (!raw) return null;
		const value = JSON.parse(raw) as EffectClipboard;
		return value?.kind === 'artwork' || value?.kind === 'page' ? value : null;
	} catch {
		return null;
	}
}
