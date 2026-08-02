import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Modal } from './ui/Modal';

export interface ImageCropSettings {
	aspect?: string;
	focusX: number;
	focusY: number;
	zoom: number;
	naturalAspect?: number;
}

const ASPECTS = [
	{ value: '', label: 'Original' },
	{ value: '1:1', label: '1:1' },
	{ value: '3:2', label: '3:2' },
	{ value: '4:3', label: '4:3' },
	{ value: '16:9', label: '16:9' },
	{ value: '3:4', label: '3:4' },
	{ value: '2:3', label: '2:3' },
];

const ratioOf = (value: string | undefined): number | undefined => {
	const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(value ?? '');
	return match ? Number(match[1]) / Number(match[2]) : undefined;
};
const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

export default function ImageCropDialog({
	src,
	name,
	initial,
	onClose,
	onSave,
}: {
	src: string;
	name: string;
	initial: Partial<ImageCropSettings>;
	onClose: () => void;
	onSave: (settings: ImageCropSettings) => void;
}) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [aspect, setAspect] = useState(initial.aspect ?? '');
	const [focusX, setFocusX] = useState(initial.focusX ?? 50);
	const [focusY, setFocusY] = useState(initial.focusY ?? 50);
	const [zoom, setZoom] = useState(clamp(initial.zoom ?? 1, 1, 6));
	const [naturalAspect, setNaturalAspect] = useState(initial.naturalAspect);
	const viewportAspect = ratioOf(aspect) ?? naturalAspect ?? 4 / 3;

	const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || (event.target as HTMLElement).closest('.crop-resize-handle')) return;
		event.preventDefault();
		const viewport = viewportRef.current;
		if (!viewport) return;
		const win = viewport.ownerDocument.defaultView ?? window;
		const rect = viewport.getBoundingClientRect();
		const startX = event.clientX;
		const startY = event.clientY;
		const originalX = focusX;
		const originalY = focusY;
		const move = (next: PointerEvent) => {
			setFocusX(clamp(originalX - ((next.clientX - startX) / Math.max(rect.width, 1)) * (100 / zoom), 0, 100));
			setFocusY(clamp(originalY - ((next.clientY - startY) / Math.max(rect.height, 1)) * (100 / zoom), 0, 100));
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};

	const startResize = (event: ReactPointerEvent<HTMLSpanElement>, corner: string) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const win = event.currentTarget.ownerDocument.defaultView ?? window;
		const startX = event.clientX;
		const startY = event.clientY;
		const original = zoom;
		const horizontalSign = corner.includes('e') ? 1 : -1;
		const verticalSign = corner.includes('s') ? 1 : -1;
		const move = (next: PointerEvent) => {
			const delta =
				((next.clientX - startX) * horizontalSign +
					(next.clientY - startY) * verticalSign) /
				160;
			setZoom(clamp(original + delta, 1, 6));
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};

	return (
		<Modal
			title={`Crop ${name}`}
			onClose={onClose}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
					<button
						type="button"
						className="btn-primary"
						onClick={() =>
							onSave({
								aspect: aspect || undefined,
								focusX: Math.round(focusX * 10) / 10,
								focusY: Math.round(focusY * 10) / 10,
								zoom: Math.round(zoom * 100) / 100,
								naturalAspect,
							})
						}
					>
						Save crop
					</button>
				</>
			}
		>
			<div className="crop-lightbox-editor">
				<p className="muted">Drag the photo to choose what stays visible. Drag any corner or use Zoom to resize it inside the frame.</p>
				<div className="crop-aspect-buttons" role="group" aria-label="Crop frame shape">
					{ASPECTS.map((option) => (
						<button
							key={option.value || 'original'}
							type="button"
							className={aspect === option.value ? 'active' : ''}
							aria-pressed={aspect === option.value}
							onClick={() => setAspect(option.value)}
						>
							{option.label}
						</button>
					))}
				</div>
				<div className="crop-stage">
					<div
						ref={viewportRef}
						className="crop-viewport"
						style={{ aspectRatio: String(viewportAspect) }}
						onPointerDown={startPan}
					>
						<img
							src={src}
							alt=""
							draggable={false}
							onLoad={(event) => {
								const image = event.currentTarget;
								if (image.naturalWidth && image.naturalHeight)
									setNaturalAspect(image.naturalWidth / image.naturalHeight);
							}}
							style={
								{
									objectPosition: `${focusX}% ${focusY}%`,
									transform: `scale(${zoom})`,
									transformOrigin: `${focusX}% ${focusY}%`,
								} as CSSProperties
							}
						/>
						{['nw', 'ne', 'sw', 'se'].map((corner) => (
							<span
								key={corner}
								className={`crop-resize-handle corner-${corner}`}
								onPointerDown={(event) => startResize(event, corner)}
								title="Resize photo in crop frame"
								aria-hidden="true"
							/>
						))}
					</div>
				</div>
				<label className="crop-zoom-control">
					<span>Zoom <output>{zoom.toFixed(2)}×</output></span>
					<input type="range" min={1} max={6} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
				</label>
				<button
					type="button"
					className="btn-link crop-reset"
					onClick={() => {
						setAspect('');
						setFocusX(50);
						setFocusY(50);
						setZoom(1);
					}}
				>
					Reset to original
				</button>
			</div>
		</Modal>
	);
}
