// A skippable first-run practice run for the crop & light tools: one bundled,
// deliberately dim and crooked sample shot of an artwork, walked from phone
// photo to gallery-ready in four short steps. Everything here is local state
// on the sample image — the artist's own photos are never touched, and the
// real tools this rehearses live unchanged on every image's Edit
// (ImageCropDialog).
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Modal } from './ui/Modal';
import { getSampleArtwork } from '../lib/sample-artwork';

/** The staged "bad phone shot" is derived from this rights-cleared catalog
 * sample (see scripts/generate-crop-light-sample.mjs). */
const SOURCE_SAMPLE_ID = 'painter-aic-14655-v1';

/** The bundled sample's own proportions (a portrait phone frame). */
const SHOT_ASPECT = 3 / 4;

/** Aspect set tuned to artwork. The real dialog offers these shapes and more. */
const DEMO_ASPECTS: { value: string; ratio: number; label: string }[] = [
	{ value: '1:1', ratio: 1, label: '1:1' },
	{ value: '4:5', ratio: 4 / 5, label: '4:5' },
	{ value: '3:4', ratio: 3 / 4, label: '3:4' },
	{ value: '2:3', ratio: 2 / 3, label: '2:3' },
];

/** Where the painting sits inside the staged shot — picking a frame shape
 * starts from here so the first click already looks like progress. */
const SUGGESTED_FOCUS = { x: 50, y: 45, zoom: 1.5 };

const STEPS = 4;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

export default function CropLightDemo({
	src,
	onClose,
}: {
	/** The bundled demo shot (assets/demo/crop-light-sample.jpg, base-aware). */
	src: string;
	onClose: () => void;
}) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [step, setStep] = useState(0);
	const [aspect, setAspect] = useState<string | null>(null);
	const [focusX, setFocusX] = useState(50);
	const [focusY, setFocusY] = useState(50);
	const [zoom, setZoom] = useState(1);
	const [brightness, setBrightness] = useState(100);
	const [contrast, setContrast] = useState(100);

	const credit = getSampleArtwork(SOURCE_SAMPLE_ID)?.credit;
	const viewportAspect =
		DEMO_ASPECTS.find((option) => option.value === aspect)?.ratio ?? SHOT_ASPECT;
	const lightFilter =
		brightness !== 100 || contrast !== 100
			? `brightness(${brightness / 100}) contrast(${contrast / 100})`
			: undefined;

	const pickAspect = (value: string) => {
		setAspect(value);
		// An untouched photo jumps to a sensible starting crop; after that the
		// artist's own drag and zoom stay put.
		if (zoom === 1) {
			setZoom(SUGGESTED_FOCUS.zoom);
			setFocusX(SUGGESTED_FOCUS.x);
			setFocusY(SUGGESTED_FOCUS.y);
		}
	};

	// Same drag-to-position mechanics as the real crop dialog.
	const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
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

	/** The sample exactly as shot — steps 0 and the compare's left side. */
	const asShot = (
		<div
			className="crop-viewport crop-demo-still"
			style={{ width: `min(100%, ${Math.round(SHOT_ASPECT * 46)}vh, 460px)`, aspectRatio: String(SHOT_ASPECT) }}
		>
			<img
				src={src}
				alt="Sample phone shot of a painting on a wall — dim, slightly crooked, with wall filling most of the frame."
				draggable={false}
			/>
		</div>
	);

	const shotImage = (withLight: boolean) => (
		<div
			ref={viewportRef}
			className="crop-viewport"
			style={{ width: `min(100%, ${Math.round(viewportAspect * 46)}vh, 460px)`, aspectRatio: String(viewportAspect) }}
			onPointerDown={startPan}
		>
			<img
				src={src}
				alt="Sample phone shot of a painting on a wall — dim, slightly crooked, with wall filling most of the frame."
				draggable={false}
				style={
					{
						objectPosition: `${focusX}% ${focusY}%`,
						transform: `scale(${zoom})`,
						transformOrigin: `${focusX}% ${focusY}%`,
						filter: withLight ? lightFilter : undefined,
					} as CSSProperties
				}
			/>
		</div>
	);

	const heading = (title: string, lead: string) => (
		<header className="crop-demo-head">
			<span className="crop-demo-progress">Step {step + 1} of {STEPS}</span>
			<strong>{title}</strong>
			<p>{lead}</p>
		</header>
	);

	const next = () => setStep((current) => Math.min(current + 1, STEPS - 1));
	const cta = ['Fix it', 'Now the light', 'Compare', 'Back to my photos'][step];

	return (
		// The practice run opens over the floating workbench, so its modal needs
		// a stacking context above the panel's z-index (320).
		<div className="crop-demo-layer">
		<Modal
			title="Make a phone shot gallery-ready"
			onClose={onClose}
			footer={
				<>
					{step < STEPS - 1 && (
						<button type="button" className="btn-ghost" onClick={onClose}>
							Skip the demo
						</button>
					)}
					{step > 0 && (
						<button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
							Previous
						</button>
					)}
					<button type="button" className="btn-primary" onClick={step === STEPS - 1 ? onClose : next}>
						{cta}
					</button>
				</>
			}
		>
			<div className="crop-demo">
				{step === 0 && (
					<>
						{heading(
							'Here’s a phone shot straight off the wall',
							'Dim, a little crooked, and half the frame is wall. Two moves fix it — a crop and a light pass. This runs on a sample; your photos stay untouched.',
						)}
						<div className="crop-stage">{asShot}</div>
					</>
				)}
				{step === 1 && (
					<>
						{heading(
							'Crop until the work fills the frame',
							'Pick a frame shape, then drag the photo and zoom until the painting owns it. The crookedness mostly disappears with a tighter crop.',
						)}
						<div className="crop-aspect-buttons" role="group" aria-label="Crop frame shape">
							{DEMO_ASPECTS.map((option) => (
								<button
									key={option.value}
									type="button"
									className={aspect === option.value ? 'active' : ''}
									aria-pressed={aspect === option.value}
									onClick={() => pickAspect(option.value)}
								>
									{option.label}
								</button>
							))}
						</div>
						<p className="crop-demo-hint">
							1:1 suits details and square work · 4:5 most canvases · 3:4 is what phones
							shoot · 2:3 suits tall pieces.
						</p>
						<div className="crop-stage">{shotImage(false)}</div>
						<label className="crop-zoom-control">
							<span>
								Zoom <output>{zoom.toFixed(2)}×</output>
							</span>
							<input
								type="range"
								min={1}
								max={6}
								step={0.01}
								value={zoom}
								onChange={(event) => setZoom(Number(event.target.value))}
							/>
						</label>
					</>
				)}
				{step === 2 && (
					<>
						{heading(
							'Lift the light until it reads true',
							'Phone shots of walls come out dark and flat. Raise brightness until the lights look right, then add contrast until the colors sit up.',
						)}
						<div className="crop-stage">{shotImage(true)}</div>
						<div className="crop-light-controls" role="group" aria-label="Light adjustments">
							<label className="crop-zoom-control">
								<span>
									Brightness <output>{Math.round(brightness)}%</output>
								</span>
								<input
									type="range"
									min={50}
									max={150}
									step={1}
									value={brightness}
									onChange={(event) => setBrightness(Number(event.target.value))}
								/>
							</label>
							<label className="crop-zoom-control">
								<span>
									Contrast <output>{Math.round(contrast)}%</output>
								</span>
								<input
									type="range"
									min={50}
									max={150}
									step={1}
									value={contrast}
									onChange={(event) => setContrast(Number(event.target.value))}
								/>
							</label>
						</div>
					</>
				)}
				{step === 3 && (
					<>
						{heading(
							'Before and after',
							'Same file, two small moves. The same Crop & light lives on every image’s Edit — open any photo and it’s there. Your original file never changes.',
						)}
						<div className="crop-stage crop-demo-compare">
							<figure>
								<div className="crop-viewport crop-demo-still" style={{ aspectRatio: String(SHOT_ASPECT) }}>
									<img src={src} alt="The sample as shot: dim and loosely framed." draggable={false} />
								</div>
								<figcaption>As shot</figcaption>
							</figure>
							<figure>
								<div className="crop-viewport crop-demo-still" style={{ aspectRatio: String(viewportAspect) }}>
									<img
										src={src}
										alt="The sample after your crop and light pass."
										draggable={false}
										style={
											{
												objectPosition: `${focusX}% ${focusY}%`,
												transform: `scale(${zoom})`,
												transformOrigin: `${focusX}% ${focusY}%`,
												filter: lightFilter,
											} as CSSProperties
										}
									/>
								</div>
								<figcaption>After your pass</figcaption>
							</figure>
						</div>
					</>
				)}
				{credit && <p className="crop-demo-credit">Sample: {credit} Staged as a phone shot.</p>}
			</div>
		</Modal>
		</div>
	);
}
