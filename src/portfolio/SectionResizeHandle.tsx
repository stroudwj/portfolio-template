import type { ResponsiveSectionHeight } from './types';
import { useEffect, useRef } from 'react';

export type SectionBreakpoint = 'desktop' | 'phone';

export function responsiveHeightVars(
	height: ResponsiveSectionHeight | undefined,
): React.CSSProperties {
	return {
		'--section-min-desktop': height?.desktopGap !== undefined
			? '0px'
			: height?.desktopVw !== undefined
			? `${height.desktopVw}vw`
			: `${height?.desktop ?? 0}px`,
		'--section-min-phone': height?.phoneGap !== undefined
			? '0px'
			: height?.phoneVw !== undefined
			? `${height.phoneVw}vw`
			: `${height?.phone ?? 0}px`,
		'--section-gap-desktop': `${height?.desktopGap ?? 0}px`,
		'--section-gap-phone': `${height?.phoneGap ?? 0}px`,
	} as React.CSSProperties;
}

export default function SectionResizeHandle({
	breakpoint,
	value,
	viewportValue,
	gapValue,
	label,
	onChange,
	useTrailingGap = false,
}: {
	breakpoint: SectionBreakpoint;
	value?: number;
	/** Width-relative minimum in viewport-width units. */
	viewportValue?: number;
	gapValue?: number;
	label: string;
	onChange: (
		height: number | undefined,
		viewportHeight?: number,
		gap?: number,
		recordHistory?: boolean,
	) => void;
	/** Page sections store trailing space; footer sizing remains a minimum height. */
	useTrailingGap?: boolean;
}) {
	const handleRef = useRef<HTMLDivElement>(null);
	const minCssVar =
		breakpoint === 'phone' ? '--section-min-phone' : '--section-min-desktop';
	const gapCssVar =
		breakpoint === 'phone' ? '--section-gap-phone' : '--section-gap-desktop';
	const measuredHeight = (handle: HTMLElement): number =>
		Math.round(handle.parentElement?.getBoundingClientRect().height ?? value ?? 0);

	const naturalHeight = (handle: HTMLElement): number =>
		handle.parentElement?.querySelector<HTMLElement>(':scope > .motion-section-inner')
			?.getBoundingClientRect().height ?? 0;

	const applyMinimumLive = (
		handle: HTMLElement,
		height: number | undefined,
		viewportHeight?: number,
	) => {
		const parent = handle.parentElement;
		if (!parent) return;
		if (height === undefined) parent.style.removeProperty(minCssVar);
		else if (viewportHeight !== undefined)
			parent.style.setProperty(minCssVar, `${Math.max(0, viewportHeight)}vw`);
		else parent.style.setProperty(minCssVar, `${Math.max(0, Math.round(height))}px`);
	};

	const applyGapLive = (handle: HTMLElement, gap: number | undefined) => {
		const parent = handle.parentElement;
		if (!parent) return;
		parent.style.setProperty(minCssVar, '0px');
		parent.style.setProperty(gapCssVar, `${Math.max(0, Math.round(gap ?? 0))}px`);
	};

	// Convert legacy total minimum heights into the trailing space the artist
	// actually sees. Persisting the gap rather than the total prevents growing
	// freeform canvases from consuming it at wider published viewports.
	useEffect(() => {
		if (!useTrailingGap || gapValue !== undefined) return;
		if (value === undefined && viewportValue === undefined) return;
		const handle = handleRef.current;
		if (!handle) return;
		const gap = Math.max(0, measuredHeight(handle) - naturalHeight(handle));
		onChange(undefined, undefined, Math.round(gap), false);
	}, [gapValue, onChange, useTrailingGap, value, viewportValue]);

	const start = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget;
		const win = handle.ownerDocument.defaultView ?? window;
		let lastClientY = event.clientY;
		let draft = measuredHeight(handle);
		let draftViewport: number | undefined;
		let draftGap = useTrailingGap ? Math.max(0, draft - naturalHeight(handle)) : undefined;
		const update = (clientY: number) => {
			const parentTop = handle.parentElement?.getBoundingClientRect().top;
			if (parentTop === undefined) return;
			// Measure from the section's live viewport position. This keeps the edge
			// under the pointer when the preview scrolls during the drag.
			draft = Math.max(0, clientY - parentTop);
			if (useTrailingGap) {
				draftGap = Math.max(0, draft - naturalHeight(handle));
				applyGapLive(handle, draftGap);
			} else {
				draftViewport = undefined;
				applyMinimumLive(handle, draft);
			}
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
			onChange(
				useTrailingGap ? undefined : Math.round(draft),
				draftViewport,
				draftGap === undefined ? undefined : Math.round(draftGap),
			);
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
		if (useTrailingGap) applyGapLive(handle, undefined);
		else applyMinimumLive(handle, undefined);
		onChange(undefined, undefined, undefined);
	};

	return (
		<div
			ref={handleRef}
			className="section-resize-handle"
			role="separator"
			tabIndex={0}
			aria-orientation="horizontal"
			aria-label={`Resize ${label} for ${breakpoint}`}
			aria-valuenow={gapValue ?? value}
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
				if (useTrailingGap) {
					const current = gapValue ?? Math.max(
						0,
						measuredHeight(event.currentTarget) - naturalHeight(event.currentTarget),
					);
					const nextGap = Math.max(0, current + direction * 8);
					applyGapLive(event.currentTarget, nextGap);
					onChange(undefined, undefined, nextGap);
				} else {
					const next = Math.max(0, (value ?? measuredHeight(event.currentTarget)) + direction * 8);
					applyMinimumLive(event.currentTarget, next);
					onChange(next);
				}
			}}
		>
			<span className="section-resize-line" aria-hidden="true" />
			<span className="section-resize-icon" aria-hidden="true">↕</span>
		</div>
	);
}
