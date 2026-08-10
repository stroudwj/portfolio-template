// Compact per-section scroll-scene picker for the section settings row. Same
// portalled, viewport-clamped popover pattern as ColorSwatchPicker so the
// control works next to either edge of the editor. The choices are picks from
// the site motion vocabulary — never new animation: an absent entry inherits
// the site feel, 'none' pins the section still even when the site moves.
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { SectionMotionConfig, SectionMotionEffect } from '../../../lib/content';

export const SECTION_MOTION_CHOICES: Array<{
	value: SectionMotionEffect | '';
	label: string;
}> = [
	{ value: '', label: 'Inherit' },
	{ value: 'reveal', label: 'Reveal' },
	{ value: 'drift', label: 'Drift' },
	{ value: 'pin', label: 'Pin' },
	{ value: 'scrub', label: 'Scroll scrub' },
	{ value: 'sequence', label: 'Sequence' },
	{ value: 'none', label: 'Off — always still' },
];

/** Compact effect names for the trigger chip — the control labels itself with
 * the active scene so the row reads at a glance. */
export const SECTION_MOTION_SHORT: Record<SectionMotionEffect, string> = {
	reveal: 'Reveal',
	drift: 'Drift',
	pin: 'Pin',
	scrub: 'Scrub',
	sequence: 'Sequence',
	none: 'Off',
};

/** The stored config a picked effect implies. Inherit clears the entry; Off
 * needs no strength or phone choice; switching between effects keeps both. */
export function nextSectionMotion(
	current: SectionMotionConfig | undefined,
	effect: SectionMotionEffect | '',
): SectionMotionConfig | undefined {
	if (!effect) return undefined;
	if (effect === 'none') return { effect };
	return { effect, intensity: current?.intensity ?? 45, phone: current?.phone };
}

const POPOVER_WIDTH = 248;
const VIEWPORT_GAP = 8;

export function SectionMotionPicker({
	value,
	onChange,
	label,
}: {
	value?: SectionMotionConfig;
	onChange: (motion: SectionMotionConfig | undefined) => void;
	/** Accessible name for the trigger + popover. */
	label: string;
}) {
	const [open, setOpen] = useState(false);
	const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);

	const place = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;
		const box = trigger.getBoundingClientRect();
		const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
		const height = popoverRef.current?.getBoundingClientRect().height ?? 220;
		const left = Math.max(
			VIEWPORT_GAP,
			Math.min(box.left, window.innerWidth - width - VIEWPORT_GAP),
		);
		const below = box.bottom + 6;
		const top =
			below + height <= window.innerHeight - VIEWPORT_GAP
				? below
				: Math.max(VIEWPORT_GAP, box.top - height - 6);
		setPosition({ position: 'fixed', left, top, width, visibility: 'visible' });
	}, []);

	useLayoutEffect(() => {
		if (!open) return;
		place();
		const frame = window.requestAnimationFrame(place);
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	}, [open, place]);

	const adjustable = !!value && value.effect !== 'none';

	const popover = open ? (
		<>
			<div
				className="motion-scene-backdrop"
				onClick={() => setOpen(false)}
				aria-hidden="true"
			/>
			<div
				ref={popoverRef}
				className="motion-scene-popover"
				role="dialog"
				aria-label={label}
				style={position}
			>
				<label className="motion-scene-choice">
					<span>Scroll scene</span>
					<select
						className="select-input"
						value={value?.effect ?? ''}
						onChange={(event) =>
							onChange(
								nextSectionMotion(value, event.target.value as SectionMotionEffect | ''),
							)
						}
					>
						{SECTION_MOTION_CHOICES.map((choice) => (
							<option key={choice.value || 'inherit'} value={choice.value}>
								{choice.label}
							</option>
						))}
					</select>
				</label>
				{adjustable && value && (
					<>
						<label className="motion-range compact">
							<span>
								Strength <output>{value.intensity ?? 45}%</output>
							</span>
							<input
								type="range"
								min={1}
								max={100}
								step={1}
								value={value.intensity ?? 45}
								onChange={(event) =>
									onChange({ ...value, intensity: Number(event.target.value) })
								}
							/>
						</label>
						<label className="compact-check">
							<input
								type="checkbox"
								checked={value.phone ?? false}
								onChange={(event) =>
									onChange({ ...value, phone: event.target.checked || undefined })
								}
							/>
							Use on phones
						</label>
					</>
				)}
				<small>
					Inherit follows the page’s scene if one is set, otherwise the site’s
					from Design. Off keeps this section still even when the rest of the
					site moves.
				</small>
			</div>
		</>
	) : null;

	return (
		<div className="motion-scene-picker">
			<button
				ref={triggerRef}
				type="button"
				className={`btn-icon motion-scene-trigger${value ? ' active' : ''}`}
				onClick={() => setOpen((current) => !current)}
				aria-label={`${label}. ${value ? 'Has its own scroll scene' : 'Inherits the page or site motion'}`}
				aria-expanded={open}
				title="Motion — how this section moves as visitors scroll"
			>
				<span aria-hidden="true">∿</span>
				{value ? SECTION_MOTION_SHORT[value.effect] : 'Motion'}
			</button>
			{typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
		</div>
	);
}
