// Editor-only canvas grid preference (overlay density + snap), shared between
// the editor panel (where the buttons live) and every CanvasGallery instance
// (which draws the overlay and snaps drags). Module-level store so the two stay
// in sync without threading props through the whole portfolio tree; persisted
// to localStorage so the choice survives sessions. Never published.
import { useSyncExternalStore } from 'react';

/** Grid overlay density choices (vertical columns across the canvas); 0 = off. */
export const GRID_OPTIONS = [0, 8, 12, 16] as const;

const GRID_PREFS_KEY = 'portfolio-editor.canvas-grid';

export interface GridPrefs {
	cols: number;
	snap: boolean;
}

function load(): GridPrefs {
	if (typeof window === 'undefined') return { cols: 0, snap: true };
	try {
		const parsed = JSON.parse(window.localStorage.getItem(GRID_PREFS_KEY) ?? '') as Partial<GridPrefs>;
		return {
			cols: (GRID_OPTIONS as readonly number[]).includes(parsed.cols ?? -1) ? (parsed.cols as number) : 0,
			snap: parsed.snap !== false,
		};
	} catch {
		return { cols: 0, snap: true };
	}
}

let prefs: GridPrefs = load();
const listeners = new Set<() => void>();

export function setGridPrefs(patch: Partial<GridPrefs>): void {
	prefs = { ...prefs, ...patch };
	try {
		window.localStorage.setItem(GRID_PREFS_KEY, JSON.stringify(prefs));
	} catch {
		/* storage full/blocked — the in-memory value still works this session */
	}
	for (const fn of listeners) fn();
}

const subscribe = (fn: () => void): (() => void) => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};

const getSnapshot = (): GridPrefs => prefs;
const getServerSnapshot = (): GridPrefs => ({ cols: 0, snap: true });

/** Live grid prefs — re-renders the caller whenever any component changes them. */
export function useGridPrefs(): GridPrefs {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
