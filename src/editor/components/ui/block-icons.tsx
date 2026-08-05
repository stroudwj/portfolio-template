// Outline block icons (DESIGN.md: Lucide/Tabler style, 16–20px, --ink-soft at
// rest, never filled, never colored). Inline so nothing external ships.
import type { ReactNode } from 'react';

export type BlockIconType =
	| 'text'
	| 'images'
	| 'gallery'
	| 'video'
	| 'audio'
	| 'map'
	| 'shots'
	| 'button'
	| 'divider'
	| 'children'
	| 'about'
	| 'contact'
	| 'form'
	| 'products'
	| 'project';

const PATHS: Record<BlockIconType, ReactNode> = {
	// Type / text box
	text: (
		<>
			<path d="M5 7V5h14v2" />
			<path d="M12 5v14" />
			<path d="M9 19h6" />
		</>
	),
	// Photo in a frame
	images: (
		<>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<circle cx="9" cy="10" r="1.6" />
			<path d="m5 19 5.5-5.5 3 3L17 13l4 4" />
		</>
	),
	// Grid of frames (legacy main gallery)
	gallery: (
		<>
			<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
			<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
			<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
			<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
		</>
	),
	// Play frame
	video: (
		<>
			<rect x="2.5" y="5" width="19" height="14" rx="2" />
			<path d="m10 9.5 5 2.5-5 2.5z" />
		</>
	),
	// Note
	audio: (
		<>
			<path d="M9 18V6l11-2v12" />
			<circle cx="6.5" cy="18" r="2.5" />
			<circle cx="17.5" cy="16" r="2.5" />
		</>
	),
	// Map pin
	map: (
		<>
			<path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z" />
			<circle cx="12" cy="10" r="2.5" />
		</>
	),
	// Film strip
	shots: (
		<>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M7.5 4v16M16.5 4v16" />
			<path d="M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" />
		</>
	),
	// Pill with a pointer
	button: (
		<>
			<rect x="2.5" y="6.5" width="19" height="8" rx="4" />
			<path d="m13 12 6.5 6.5m0 0-.5-3m.5 3-3-.5" />
		</>
	),
	// Horizontal rule between content
	divider: (
		<>
			<path d="M3 12h18" />
			<path d="M8 5.5h8M8 18.5h8" />
		</>
	),
	// Stacked page cards
	children: (
		<>
			<rect x="3" y="8.5" width="14.5" height="12" rx="2" />
			<path d="M7.5 8.5V6a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-1.5" />
		</>
	),
	// Person
	about: (
		<>
			<circle cx="12" cy="8" r="3.5" />
			<path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
		</>
	),
	// Envelope
	contact: (
		<>
			<rect x="3" y="5.5" width="18" height="13" rx="2" />
			<path d="m3.5 7 8.5 6 8.5-6" />
		</>
	),
	// Fields with a send caret
	form: (
		<>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M7 9h10M7 13h6" />
			<path d="m14.5 16.5 2 2 3-3.5" />
		</>
	),
	// Shopping bag
	products: (
		<>
			<path d="M5.5 8h13l-1 12a1.8 1.8 0 0 1-1.8 1.6H8.3A1.8 1.8 0 0 1 6.5 20Z" />
			<path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3" />
		</>
	),
	// Tag with detail lines
	project: (
		<>
			<path d="M3 11V4h7l11 11-7 7L3 11Z" />
			<circle cx="7.5" cy="8.5" r="1.4" />
		</>
	),
};

/** One outline icon per block type, sized by the surrounding text/CSS. */
export function BlockIcon({ type }: { type: BlockIconType }) {
	return (
		<svg
			className="block-icon"
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
