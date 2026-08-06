// Editor-only canvas guide preference (overlay + snap), shared between the
// editor panel (where the buttons live) and every CanvasGallery instance
// (which draws the overlay and snaps drags). Module-level store so the two stay
// in sync without threading props through the whole portfolio tree; persisted
// to localStorage so the choice survives sessions. Never published.
import { useSyncExternalStore } from 'react';

/** One choosable guide overlay. 'squares' is a uniform n-column checker of
 *  square cells; 'columns' shades the n columns (with gutters) of the Grid
 *  layout, so guide edges land exactly on grid-mode image edges and margins. */
export interface GuideOption {
	id: string;
	label: string;
	title: string;
	kind: 'off' | 'squares' | 'columns';
	n: number;
}

export const GUIDE_OPTIONS: readonly GuideOption[] = [
	{ id: 'off', label: 'Off', title: 'Hide the guides', kind: 'off', n: 0 },
	{ id: 'sq-8', label: '8', title: 'Guide squares — 8 across', kind: 'squares', n: 8 },
	{ id: 'sq-12', label: '12', title: 'Guide squares — 12 across', kind: 'squares', n: 12 },
	{ id: 'sq-16', label: '16', title: 'Guide squares — 16 across', kind: 'squares', n: 16 },
	{ id: 'sq-24', label: '24', title: 'Guide squares — 24 across (small)', kind: 'squares', n: 24 },
	{ id: 'sq-32', label: '32', title: 'Guide squares — 32 across (smallest)', kind: 'squares', n: 32 },
	{ id: 'col-2', label: '2col', title: 'Column guides matching a 2-column Grid (image edges and margins)', kind: 'columns', n: 2 },
	{ id: 'col-3', label: '3col', title: 'Column guides matching a 3-column Grid (image edges and margins)', kind: 'columns', n: 3 },
	{ id: 'col-4', label: '4col', title: 'Column guides matching a 4-column Grid (image edges and margins)', kind: 'columns', n: 4 },
] as const;

/** Any `sq-N` / `col-N` id resolves, so artists can type their own column
 * count beyond the preset buttons. */
const CUSTOM_GUIDE = /^(sq|col)-(\d{1,2})$/;

export const guideById = (id: string): GuideOption => {
	const preset = GUIDE_OPTIONS.find((o) => o.id === id);
	if (preset) return preset;
	const match = CUSTOM_GUIDE.exec(id);
	if (match) {
		const n = Math.min(Math.max(Number(match[2]), 2), 32);
		return match[1] === 'sq'
			? { id, label: String(n), title: `Guide squares — ${n} across`, kind: 'squares', n }
			: {
					id,
					label: `${n}col`,
					title: `Column guides matching a ${n}-column Grid (image edges and margins)`,
					kind: 'columns',
					n,
				};
	}
	return GUIDE_OPTIONS[0];
};

export const isGuideId = (id: string): boolean =>
	GUIDE_OPTIONS.some((o) => o.id === id) || CUSTOM_GUIDE.test(id);

const GRID_PREFS_KEY = 'portfolio-editor.canvas-grid';

export interface GridPrefs {
	/** Selected GuideOption id ('off' = no overlay). */
	guide: string;
	snap: boolean;
	/** Magnetic snap to a neighboring item's edges while dragging — independent of the
	 *  guide overlay above, on by default. Toggleable from the toolbar or Shift+S. */
	edgeSnap: boolean;
	/** Magnetic alignment of an item's/group's horizontal midpoint to the canvas center. */
	centerSnap: boolean;
	/** Editor-only section boundary lines and resize handles, visible by default. */
	sectionEdges: boolean;
}

function load(): GridPrefs {
	if (typeof window === 'undefined')
		return { guide: 'off', snap: true, edgeSnap: true, centerSnap: true, sectionEdges: true };
	try {
		const parsed = JSON.parse(window.localStorage.getItem(GRID_PREFS_KEY) ?? '') as Partial<GridPrefs> & {
			cols?: number;
		};
		// Migrate the pre-guides shape ({ cols: 0|8|12|16 }) to a guide id.
		const legacy = typeof parsed.cols === 'number' ? (parsed.cols > 0 ? `sq-${parsed.cols}` : 'off') : undefined;
		const guide = parsed.guide ?? legacy ?? 'off';
		return {
			guide: isGuideId(guide) ? guide : 'off',
			snap: parsed.snap !== false,
			edgeSnap: parsed.edgeSnap !== false,
			centerSnap: parsed.centerSnap !== false,
			sectionEdges: parsed.sectionEdges !== false,
		};
	} catch {
		return { guide: 'off', snap: true, edgeSnap: true, centerSnap: true, sectionEdges: true };
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
const serverPrefs: GridPrefs = {
	guide: 'off',
	snap: true,
	edgeSnap: true,
	centerSnap: true,
	sectionEdges: true,
};
const getServerSnapshot = (): GridPrefs => serverPrefs;

/** Live guide prefs — re-renders the caller whenever any component changes them. */
export function useGridPrefs(): GridPrefs {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** One-off read outside React (e.g. a keyboard shortcut handler) — not reactive. */
export function getGridPrefs(): GridPrefs {
	return prefs;
}

/** Flip edge-snap on/off, keeping the localStorage-backed store as the single source
 *  of truth (the Shift+S shortcut and the toolbar checkbox both go through this). */
export function toggleEdgeSnap(): void {
	setGridPrefs({ edgeSnap: !prefs.edgeSnap });
}
