// "Sign your work" — a small drawing pad. Strokes are captured as polylines in
// the shared 300×120 signature space and stored in content.site.signature, so
// they publish through content.json with no image file. The site renders them
// at the foot of every page (see src/portfolio/Signature.tsx).
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import { SIGNATURE_VIEW } from '../../portfolio/Signature';
import { ImageDrop } from './ui/ImageDrop';
import { getAssetPreviewUrl } from '../lib/assets';

/** Round to 0.1 so a flourish-y signature stays small in content.json. */
const round = (n: number) => Math.round(n * 10) / 10;

export default function SignatureEditor() {
	const { doc, setSignature, setSignatureImage, removeSignatureImage } = useEditor();
	const padRef = useRef<SVGSVGElement>(null);
	/** The stroke being drawn right now (committed on pointer release). */
	const [draft, setDraft] = useState<number[][] | null>(null);
	if (!doc) return null;
	const signature = doc.content.site.signature;
	const strokes = signature?.strokes ?? [];
	const align = signature?.align ?? 'center';
	const signatureImageUrl = getAssetPreviewUrl(doc.signatureImage?.assetId);

	const toPoint = (e: { clientX: number; clientY: number }): number[] => {
		const rect = padRef.current!.getBoundingClientRect();
		return [
			round(((e.clientX - rect.left) / rect.width) * SIGNATURE_VIEW.w),
			round(((e.clientY - rect.top) / rect.height) * SIGNATURE_VIEW.h),
		];
	};

	const startStroke = (e: React.PointerEvent) => {
		const pad = padRef.current;
		if (!pad || e.button !== 0) return;
		e.preventDefault();
		const win = pad.ownerDocument.defaultView ?? window;
		let points = [toPoint(e)];
		setDraft(points);
		const move = (ev: PointerEvent) => {
			points = [...points, toPoint(ev)];
			setDraft(points);
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			setDraft(null);
			if (points.length > 1)
				setSignature({ ...signature, strokes: [...strokes, points] });
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
	};

	const undoStroke = () =>
		setSignature({ ...signature, strokes: strokes.slice(0, -1) });

	const shown = draft ? [...strokes, draft] : strokes;

	return (
		<Section title="Signature" sectionKey="_signature" defaultCollapsed>
			<Field
				label="Signature position"
				hint="Place the signature at the left, middle, or right edge of every page."
			>
				<div className="chip-row" role="group" aria-label="Signature position">
					{(['left', 'center', 'right'] as const).map((position) => (
						<button
							key={position}
							type="button"
							className={`btn-icon btn-chip ${align === position ? 'active' : ''}`}
							aria-pressed={align === position}
							onClick={() =>
								setSignature({
									strokes,
									...signature,
									align: position === 'center' ? undefined : position,
								})
							}
						>
							{position === 'center' ? 'Middle' : position[0].toUpperCase() + position.slice(1)}
						</button>
					))}
				</div>
			</Field>
			<Field
				label="Signature image"
				hint="Optional. Upload a transparent PNG or another image instead of drawing."
			>
				<div className="signature-image-picker">
					{signatureImageUrl && <img src={signatureImageUrl} alt="Current signature" />}
					<ImageDrop ariaLabel="Choose a signature image" onFiles={(files) => setSignatureImage(files[0])}>
						<span>{signatureImageUrl ? 'Replace image' : 'Upload signature image'}</span>
					</ImageDrop>
					{doc.signatureImage.filename && (
						<button type="button" className="btn-ghost" onClick={removeSignatureImage}>
							Remove image
						</button>
					)}
				</div>
			</Field>
			<Field
				label="Sign your site"
				hint="Draw with your mouse, pen or finger. The drawing is used whenever no signature image is uploaded."
			>
				<svg
					ref={padRef}
					className="signature-pad"
					viewBox={`0 0 ${SIGNATURE_VIEW.w} ${SIGNATURE_VIEW.h}`}
					onPointerDown={startStroke}
					role="application"
					aria-label="Signature drawing pad"
				>
					<line className="signature-baseline" x1="20" y1="95" x2="280" y2="95" />
					{shown
						.filter((s) => s.length > 1)
						.map((points, i) => (
							<polyline key={i} points={points.map((p) => p.join(',')).join(' ')} />
						))}
				</svg>
			</Field>
			{strokes.length > 0 && (
				<div className="signature-actions">
					<button type="button" className="btn-ghost" onClick={undoStroke}>
						Undo stroke
					</button>
					<button type="button" className="btn-ghost" onClick={() => setSignature({ ...signature, strokes: [] })}>
						Clear drawing
					</button>
				</div>
			)}
		</Section>
	);
}
