import type { ResponsiveSectionHeight } from './types';
import { useEffect, useRef } from 'react';

export type SectionBreakpoint = 'desktop' | 'phone';

export function responsiveHeightVars(
	height: ResponsiveSectionHeight | undefined,
): React.CSSProperties {
	return {
		'--section-min-desktop': height?.desktopVw !== undefined
			? `${height.desktopVw}vw`
			: `${height?.desktop ?? 0}px`,
		'--section-min-phone': height?.phoneVw !== undefined
			? `${height.phoneVw}vw`
			: `${height?.phone ?? 0}px`,
	} as React.CSSProperties;
}

export default function SectionResizeHandle({
	breakpoint,
	value,
	viewportValue,
	label,
	onChange,
	scaleWithViewport = false,
}: {
	breakpoint: SectionBreakpoint;
	value?: number;
	/** Width-relative minimum in viewport-width units. */
	viewportValue?: number;
	label: string;
	onChange: (height: number | undefined, viewportHeight?: number, recordHistory?: boolean) => void;
	/** Page sections scale with freeform canvases; footer sizing remains pixel-based. */
	scaleWithViewport?: boolean;
}) {
	const handleRef = useRef<HTMLDivElement>(null);
	const cssVar =
		breakpoint === 'phone' ? '--section-min-phone' : '--section-min-desktop';
	const toViewportHeight = (height: number, win: Window): number =>
		Math.round((height * 10000) / Math.max(win.innerWidth, 1)) / 100;

	const measuredHeight = (handle: HTMLElement): number =>
		Math.round(handle.parentElement?.getBoundingClientRect().height ?? value ?? 0);

	const applyLive = (
		handle: HTMLElement,
		height: number | undefined,
		viewportHeight?: number,
	) => {
		const parent = handle.parentElement;
		if (!parent) return;
		if (height === undefined) parent.style.removeProperty(cssVar);
		else if (scaleWithViewport && viewportHeight !== undefined)
			parent.style.setProperty(cssVar, `${Math.max(0, viewportHeight)}vw`);
		else parent.style.setProperty(cssVar, `${Math.max(0, Math.round(height))}px`);
	};

	// Documents created before width-relative section sizing only have pixels.
	// Capture the equivalent value while the editor still has the viewport in
	// which that edge is being displayed. This is a silent data migration: it
	// produces no undo step and does not visually move the edge.
	useEffect(() => {
		if (!scaleWithViewport || value === undefined || viewportValue !== undefined) return;
		const handle = handleRef.current;
		const win = handle?.ownerDocument.defaultView;
		if (!win) return;
		onChange(value, toViewportHeight(value, win), false);
	}, [breakpoint, label, onChange, scaleWithViewport, value, viewportValue]);

	const start = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget;
		const win = handle.ownerDocument.defaultView ?? window;
		let lastClientY = event.clientY;
		let draft = measuredHeight(handle);
		let draftViewport = scaleWithViewport ? toViewportHeight(draft, win) : undefined;
		const update = (clientY: number) => {
			const parentTop = handle.parentElement?.getBoundingClientRect().top;
			if (parentTop === undefined) return;
			// Measure from the section's live viewport position. This keeps the edge
			// under the pointer when the preview scrolls during the drag.
			draft = Math.max(0, clientY - parentTop);
			draftViewport = scaleWithViewport ? toViewportHeight(draft, win) : undefined;
			applyLive(handle, draft, draftViewport);
		};
		const move = (next: PointerEvent) => {
			lastClientY = next.clientY;
			update(next.clientY);
		};
		const scroll = () => update(lastClientY);
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			win.removeEventListener('scroll', scroll, true);
			try {
				if (handle.hasPointerCapture(event.pointerId))
					handle.releasePointerCapture(event.pointerId);
			} catch {
				// Window listeners still complete the gesture when capture is unavailable.
			}
			onChange(Math.round(draft), draftViewport);
		};
		try {
			handle.setPointerCapture(event.pointerId);
		} catch {
			// The fixed editor drag surface and window listeners are sufficient.
		}
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
		win.addEventListener('scroll', scroll, true);
	};

	const reset = (handle: HTMLElement) => {
		applyLive(handle, undefined);
		onChange(undefined, undefined);
	};

	return (
		<div
			ref={handleRef}
			className="section-resize-handle"
			role="separator"
			tabIndex={0}
			aria-orientation="horizontal"
			aria-label={`Resize ${label} for ${breakpoint}`}
			aria-valuenow={value}
			title={`Drag to resize ${label}. Double-click or press Home to reset.`}
			onPointerDown={start}
			onDoubleClick={(event) => reset(event.currentTarget)}
			onKeyDown={(event) => {
				if (event.key === 'Home') {
					event.preventDefault();
					reset(event.currentTarget);
					return;
				}
				if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
				event.preventDefault();
				const direction = event.key === 'ArrowUp' ? -1 : 1;
				const next = Math.max(
					0,
					(viewportValue !== undefined
						? measuredHeight(event.currentTarget)
						: value ?? measuredHeight(event.currentTarget)) + direction * 8,
				);
				const win = event.currentTarget.ownerDocument.defaultView ?? window;
				const nextViewport = scaleWithViewport ? toViewportHeight(next, win) : undefined;
				applyLive(event.currentTarget, next, nextViewport);
				onChange(next, nextViewport);
			}}
		>
			<span className="section-resize-line" aria-hidden="true" />
			<span className="section-resize-icon" aria-hidden="true">↕</span>
		</div>
	);
}
