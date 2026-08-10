// Grid gaps are stored in rem (GalleryConfig.gapX/gapY; the renderer emits
// `--gap-x: <value>rem`). The numeric field beside each gap slider speaks px:
// nothing in the portfolio runtime overrides the root font size, so 1rem
// renders at the browser-default 16px in the editor preview and on a published
// site alike — the ×16 conversion shows exactly what renders.
const PX_PER_REM = 16;

/** Slider bounds, in rem (0–4rem ↔ 0–64px). The field clamps to the same range. */
export const GAP_REM_MAX = 4;
export const GAP_PX_MAX = GAP_REM_MAX * PX_PER_REM;

export const gapRemToPx = (rem: number): number => Math.round(rem * PX_PER_REM);
export const gapPxToRem = (px: number): number => px / PX_PER_REM;
