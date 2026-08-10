import './Hero.css';
import {
	useEffect,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
} from 'react';
import type { KineticTextConfig, PageHeadingPosition } from '../lib/content';
import {
	KineticInline,
	KineticMarquee,
	kineticClass,
	kineticStyle,
} from './KineticText';

export interface HeroProps {
	heading?: string;
	position?: PageHeadingPosition;
	freeformX?: number;
	freeformY?: number;
	/** Editor preview: makes a freeform heading directly draggable. */
	onPositionChange?: (x: number, y: number) => void;
	kinetic?: KineticTextConfig;
}

/** The Home page heading block ("Selected Works"). */
export default function Hero({
	heading,
	position = 'right',
	freeformX = 50,
	freeformY = 56,
	onPositionChange,
	kinetic,
}: HeroProps) {
	const [draft, setDraft] = useState({ x: freeformX, y: freeformY });
	useEffect(() => setDraft({ x: freeformX, y: freeformY }), [freeformX, freeformY]);

	if (!heading) return null;
	const editable = position === 'freeform' && !!onPositionChange;
	const clampPosition = (x: number, y: number) => ({
		x: Math.min(95, Math.max(5, Math.round(x))),
		y: Math.min(240, Math.max(-120, Math.round(y))),
	});
	const moveWithKeyboard = (event: KeyboardEvent<HTMLHeadingElement>) => {
		if (!editable || !onPositionChange) return;
		const amount = event.shiftKey ? 10 : 1;
		const offsets: Record<string, [number, number]> = {
			ArrowLeft: [-amount, 0],
			ArrowRight: [amount, 0],
			ArrowUp: [0, -amount],
			ArrowDown: [0, amount],
		};
		const offset = offsets[event.key];
		if (!offset) return;
		event.preventDefault();
		const next = clampPosition(draft.x + offset[0], draft.y + offset[1]);
		setDraft(next);
		onPositionChange(next.x, next.y);
	};
	const startDrag = (event: PointerEvent<HTMLHeadingElement>) => {
		if (!editable || !onPositionChange || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget;
		const host = target.parentElement;
		if (!host) return;
		const hostRect = host.getBoundingClientRect();
		const startClientX = event.clientX;
		const startClientY = event.clientY;
		const start = draft;
		target.setPointerCapture(event.pointerId);

		const move = (moveEvent: globalThis.PointerEvent) => {
			const next = clampPosition(
				start.x + ((moveEvent.clientX - startClientX) / Math.max(hostRect.width, 1)) * 100,
				start.y + moveEvent.clientY - startClientY,
			);
			setDraft(next);
		};
		const finish = (finishEvent: globalThis.PointerEvent) => {
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', finish);
			target.removeEventListener('pointercancel', finish);
			const next = clampPosition(
				start.x + ((finishEvent.clientX - startClientX) / Math.max(hostRect.width, 1)) * 100,
				start.y + finishEvent.clientY - startClientY,
			);
			setDraft(next);
			onPositionChange(next.x, next.y);
		};
		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', finish);
		target.addEventListener('pointercancel', finish);
	};
	const freeformStyle = position === 'freeform'
		? { '--page-heading-x': `${draft.x}%`, '--page-heading-y': `${draft.y}px` } as CSSProperties
		: undefined;
	return (
		<div className={`page-header heading-position-${position}`} style={freeformStyle}>
			<h1
				className={`page-title ${kineticClass(kinetic)}${editable ? ' is-position-editable' : ''}`}
				style={kineticStyle(kinetic)}
				data-kinetic-target={kinetic ? 'page:heading' : undefined}
				tabIndex={editable ? 0 : undefined}
				aria-label={editable ? `${heading}. Drag or use arrow keys to move this page heading.` : undefined}
				onPointerDown={editable ? startDrag : undefined}
				onKeyDown={editable ? moveWithKeyboard : undefined}
			>
				{kinetic?.effect === 'marquee' ? (
					<KineticMarquee duplicate={heading}>{heading}</KineticMarquee>
				) : (
					<KineticInline text={heading} config={kinetic} />
				)}
			</h1>
		</div>
	);
}
