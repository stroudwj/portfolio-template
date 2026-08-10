// Outline icons for editor chrome — tabs, the pages panel, and row actions.
// Same rules as block-icons: Lucide/Tabler style, stroke only, sized by CSS,
// never filled (except the drag-grip dots), never colored. Inline so nothing
// external ships.
import type { ReactNode } from 'react';

export type PanelIconType =
	| 'pages'
	| 'design'
	| 'store'
	| 'site'
	| 'publish'
	| 'page'
	| 'home'
	| 'subpage'
	| 'grip'
	| 'settings'
	| 'trash'
	| 'plus'
	| 'info'
	| 'back'
	| 'forward'
	| 'panel-collapse'
	| 'panel-open'
	| 'sparkle'
	| 'pencil'
	| 'layers'
	| 'monitor'
	| 'phone'
	| 'expand'
	| 'more'
	| 'guides'
	| 'edges'
	| 'up'
	| 'down'
	| 'close'
	| 'undo'
	| 'redo'
	| 'chevron'
	| 'duplicate'
	| 'workbench';

const PATHS: Record<PanelIconType, ReactNode> = {
	// Two stacked sheets
	pages: (
		<>
			<rect x="8" y="3" width="12" height="15" rx="2" />
			<path d="M4 7v12a2 2 0 0 0 2 2h9" />
		</>
	),
	// Paint drop
	design: <path d="M12 3s6 6.6 6 10.7a6 6 0 1 1-12 0C6 9.6 12 3 12 3Z" />,
	// Shopping bag (mirrors the products block icon)
	store: (
		<>
			<path d="M5.5 8h13l-1 12a1.8 1.8 0 0 1-1.8 1.6H8.3A1.8 1.8 0 0 1 6.5 20Z" />
			<path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3" />
		</>
	),
	// Globe
	site: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M3 12h18" />
			<path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18Z" />
		</>
	),
	// Up into the world
	publish: (
		<>
			<path d="M12 15V4" />
			<path d="m7 8.5 5-4.5 5 4.5" />
			<path d="M5 19h14" />
		</>
	),
	// Single sheet with a folded corner
	page: (
		<>
			<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
			<path d="M14 3v5h5" />
		</>
	),
	// House
	home: (
		<>
			<path d="m4 11 8-7 8 7" />
			<path d="M6.5 9.5V20h11V9.5" />
		</>
	),
	// Corner arrow down-right
	subpage: (
		<>
			<path d="M5 4v8a2 2 0 0 0 2 2h11" />
			<path d="m14 10 4 4-4 4" />
		</>
	),
	// Six dots
	grip: (
		<>
			<circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none" />
			<circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none" />
			<circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
			<circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" />
			<circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
			<circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
		</>
	),
	// Sliders
	settings: (
		<>
			<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
			<circle cx="15" cy="7" r="2" />
			<circle cx="9" cy="12" r="2" />
			<circle cx="15" cy="17" r="2" />
		</>
	),
	trash: (
		<>
			<path d="M4.5 7h15" />
			<path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
			<path d="m6.5 7 .7 12.1A2 2 0 0 0 9.2 21h5.6a2 2 0 0 0 2-1.9L17.5 7" />
			<path d="M10 11v6M14 11v6" />
		</>
	),
	plus: <path d="M12 5v14M5 12h14" />,
	info: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 8h.01" />
			<path d="M12 11.5V16" />
		</>
	),
	back: <path d="m14 6-6 6 6 6" />,
	forward: <path d="m10 6 6 6-6 6" />,
	// Sidebar with an inward arrow — collapse the editing panel
	'panel-collapse': (
		<>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M9 4v16" />
			<path d="m16.5 9-3 3 3 3" />
		</>
	),
	// Sidebar with an outward arrow — bring the editing panel back
	'panel-open': (
		<>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M9 4v16" />
			<path d="m13.5 9 3 3-3 3" />
		</>
	),
	// Four-point star
	sparkle: <path d="M12 4l1.8 6.2L20 12l-6.2 1.8L12 20l-1.8-6.2L4 12l6.2-1.8L12 4Z" />,
	pencil: (
		<>
			<path d="m4 20 .8-3.2L15.6 6a1.9 1.9 0 0 1 2.7 0l-.3-.3a1.9 1.9 0 0 1 0 2.7L7.2 19.2 4 20Z" />
			<path d="m13.5 8 2.5 2.5" />
		</>
	),
	// Three stacked sheets
	layers: (
		<>
			<path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
			<path d="m4 12 8 4.3 8-4.3" />
			<path d="m4 16.5 8 4.3 8-4.3" />
		</>
	),
	monitor: (
		<>
			<rect x="3" y="4.5" width="18" height="13" rx="2" />
			<path d="M9 21h6M12 17.5V21" />
		</>
	),
	phone: (
		<>
			<rect x="7" y="2.5" width="10" height="19" rx="2.5" />
			<path d="M11 18.5h2" />
		</>
	),
	// Corners pulling outward
	expand: (
		<>
			<path d="M14 4h6v6" />
			<path d="M10 20H4v-6" />
			<path d="m20 4-6.5 6.5M4 20l6.5-6.5" />
		</>
	),
	// Three dots
	more: (
		<>
			<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
			<circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
			<circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
		</>
	),
	// Dotted alignment grid
	guides: (
		<>
			<path d="M9 3v18M15 3v18" strokeDasharray="2.4 3" />
			<path d="M3 9h18M3 15h18" strokeDasharray="2.4 3" />
		</>
	),
	// Section frame with a pull-down resize handle
	edges: (
		<>
			<rect x="3.5" y="4" width="17" height="10" rx="1.5" />
			<path d="M12 17v4" />
			<path d="m9.5 18.5 2.5 2.5 2.5-2.5" />
		</>
	),
	up: <path d="M12 19V5m-6 6 6-6 6 6" />,
	down: <path d="M12 5v14m6-6-6 6-6-6" />,
	close: <path d="m6 6 12 12M18 6 6 18" />,
	undo: (
		<>
			<path d="M8.5 5 4 9.5 8.5 14" />
			<path d="M4 9.5h10a6 6 0 0 1 0 12h-3" />
		</>
	),
	redo: (
		<>
			<path d="M15.5 5 20 9.5 15.5 14" />
			<path d="M20 9.5H10a6 6 0 0 0 0 12h3" />
		</>
	),
	// Chevron for collapsible rows
	chevron: <path d="m9 6 6 6-6 6" />,
	// Photo stack: a print on top of another
	workbench: (
		<>
			<rect x="3" y="7.5" width="14" height="13" rx="2" />
			<circle cx="8" cy="12" r="1.5" />
			<path d="m5 19 3.5-3.5 2.5 2.5 2-2 3.5 3.5" />
			<path d="M8 7.5V6a2 2 0 0 1 2-2h9A2 2 0 0 1 21 6v9a2 2 0 0 1-2 2h-1.5" />
		</>
	),
	// Two offset sheets
	duplicate: (
		<>
			<rect x="9" y="9" width="11.5" height="11.5" rx="2" />
			<path d="M6.5 15h-1A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5v1" />
		</>
	),
};

/** One outline icon for editor chrome, sized by the surrounding text/CSS. */
export function PanelIcon({ type }: { type: PanelIconType }) {
	return (
		<svg
			className="panel-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{PATHS[type]}
		</svg>
	);
}
