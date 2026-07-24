// Compact color-block picker. The popover is portalled and viewport-clamped so
// controls near either edge of the editor never open off-screen.
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

/** A curated, harmonious palette: soft paper tints, inks, and a few bolder blocks. */
const PRESET_COLORS = [
	'#faf7f2', '#f1ece3', '#e7e0d3', '#2a2a2a', '#141414',
	'#f6d9d0', '#f7ecc9', '#dcebd6', '#d2e2ee', '#e6dcf1',
	'#e0685b', '#e0a94a', '#5f9070', '#4a78a8', '#8a6bb0',
];

const POPOVER_WIDTH = 224;
const VIEWPORT_GAP = 8;
const isHex6 = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
const normalizedHex = (value: string): string =>
	`#${value.replace(/[^0-9a-f]/gi, '').slice(0, 6).toLowerCase()}`;

export function ColorSwatchPicker({
	value,
	onChange,
	label,
	themeColors = [],
}: {
	value?: string;
	onChange: (color: string | undefined) => void;
	/** Accessible name for the trigger + popover. */
	label: string;
	/** The site's own theme colors, shown first so blocks can echo the palette. */
	themeColors?: string[];
}) {
	const [open, setOpen] = useState(false);
	const [hexDraft, setHexDraft] = useState(
		value && isHex6(value) ? value.toLowerCase() : '#ffffff',
	);
	const [copied, setCopied] = useState(false);
	const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const swatches = [...themeColors, ...PRESET_COLORS]
		.filter(isHex6)
		.filter(
			(color, i, all) =>
				all.findIndex((candidate) => candidate.toLowerCase() === color.toLowerCase()) === i,
		);

	useEffect(() => {
		if (value && isHex6(value)) setHexDraft(value.toLowerCase());
	}, [value]);

	const place = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;
		const box = trigger.getBoundingClientRect();
		const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
		const height = popoverRef.current?.getBoundingClientRect().height ?? 260;
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

	const applyHex = (next: string) => {
		setHexDraft(next);
		if (isHex6(next)) onChange(next.toLowerCase());
	};

	const copyHex = async () => {
		const hex = isHex6(hexDraft)
			? hexDraft.toLowerCase()
			: value && isHex6(value)
				? value.toLowerCase()
				: '#ffffff';
		try {
			await navigator.clipboard.writeText(hex);
		} catch {
			setCopied(false);
			return;
		}
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	};

	const popover = open ? (
		<>
			<div
				className="color-swatch-backdrop"
				onClick={() => setOpen(false)}
				aria-hidden="true"
			/>
			<div
				ref={popoverRef}
				className="color-swatch-popover"
				role="dialog"
				aria-label={label}
				style={position}
			>
				<div className="color-swatch-grid">
					<button
						type="button"
						className={`color-swatch is-none ${!value ? 'active' : ''}`}
						onClick={() => {
							onChange(undefined);
							setOpen(false);
						}}
						aria-label="No color"
						title="None"
					>
						✕
					</button>
					{swatches.map((color) => (
						<button
							key={color}
							type="button"
							className={`color-swatch ${
								value?.toLowerCase() === color.toLowerCase() ? 'active' : ''
							}`}
							style={{ background: color }}
							onClick={() => {
								onChange(color);
								setOpen(false);
							}}
							aria-label={`Use ${color}`}
							title={color}
						/>
					))}
				</div>
				<div className="color-swatch-custom">
					<label>
						<span>Hex</span>
						<input
							className={`text-input color-hex-input ${isHex6(hexDraft) ? '' : 'invalid'}`}
							value={hexDraft}
							onChange={(event) => applyHex(normalizedHex(event.target.value))}
							onBlur={() => {
								if (!isHex6(hexDraft))
									setHexDraft(value && isHex6(value) ? value.toLowerCase() : '#ffffff');
							}}
							aria-label={`Hex color for ${label}`}
							aria-invalid={!isHex6(hexDraft)}
							inputMode="text"
							maxLength={7}
						/>
					</label>
					<input
						type="color"
						value={isHex6(hexDraft) ? hexDraft : '#ffffff'}
						onChange={(event) => applyHex(event.target.value)}
						aria-label={`Visual color picker for ${label}`}
					/>
					<button
						type="button"
						className="btn-icon color-copy"
						onClick={() => void copyHex()}
						aria-label={`Copy hex color for ${label}`}
						title="Copy hex color"
					>
						{copied ? '✓' : '⧉'}
					</button>
					<span className="sr-only" role="status" aria-live="polite">
						{copied ? 'Copied' : ''}
					</span>
				</div>
			</div>
		</>
	) : null;

	return (
		<div className="color-swatch-picker">
			<button
				ref={triggerRef}
				type="button"
				className={`color-swatch-trigger ${value ? 'has-color' : ''}`}
				style={value ? { background: value } : undefined}
				onClick={() => setOpen((current) => !current)}
				aria-label={value ? `${label} (${value}). Change color` : `${label}. Add a color`}
				aria-expanded={open}
				title={label}
			>
				{value ? '' : '🎨'}
			</button>
			{typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
		</div>
	);
}
