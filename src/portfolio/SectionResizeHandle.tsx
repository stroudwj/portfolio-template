import type { ResponsiveSectionHeight } from './types';

export type SectionBreakpoint = keyof ResponsiveSectionHeight;

export function responsiveHeightVars(
	height: ResponsiveSectionHeight | undefined,
): React.CSSProperties {
	return {
		'--section-min-desktop': `${height?.desktop ?? 0}px`,
		'--section-min-phone': `${height?.phone ?? 0}px`,
	} as React.CSSProperties;
}

export default function SectionResizeHandle({
	breakpoint,
	value,
	label,
	onChange,
}: {
	breakpoint: SectionBreakpoint;
	value?: number;
	label: string;
	onChange: (height: number | undefined) => void;
}) {
	const cssVar =
		breakpoint === 'phone' ? '--section-min-phone' : '--section-min-desktop';

	const measuredHeight = (handle: HTMLElement): number =>
		Math.round(handle.parentElement?.getBoundingClientRect().height ?? value ?? 0);

	const applyLive = (handle: HTMLElement, height: number | undefined) => {
		const parent = handle.parentElement;
		if (!parent) return;
		if (height === undefined) parent.style.removeProperty(cssVar);
		else parent.style.setProperty(cssVar, `${Math.max(0, Math.round(height))}px`);
	};

	const start = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget;
		const win = handle.ownerDocument.defaultView ?? window;
		let lastClientY = event.clientY;
		let draft = measuredHeight(handle);
		const update = (clientY: number) => {
			const parentTop = handle.parentElement?.getBoundingClientRect().top;
			if (parentTop === undefined) return;
			// Measure from the section's live viewport position. This keeps the edge
			// under the pointer when the preview scrolls during the drag.
			draft = Math.max(0, clientY - parentTop);
			applyLive(handle, draft);
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
			onChange(Math.round(draft));
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
		onChange(undefined);
	};

	return (
		<div
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
					(value ?? measuredHeight(event.currentTarget)) + direction * 8,
				);
				applyLive(event.currentTarget, next);
				onChange(next);
			}}
		>
			<span className="section-resize-line" aria-hidden="true" />
			<span className="section-resize-icon" aria-hidden="true">↕</span>
		</div>
	);
}
