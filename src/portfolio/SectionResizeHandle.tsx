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
		const startY = event.clientY;
		const startHeight = measuredHeight(handle);
		let draft = startHeight;
		const move = (next: PointerEvent) => {
			draft = Math.max(0, startHeight + next.clientY - startY);
			applyLive(handle, draft);
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			onChange(Math.round(draft));
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
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
			<span aria-hidden="true" />
		</div>
	);
}
