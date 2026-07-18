// "Sign your work" — a small drawing pad. Strokes are captured as polylines in
// the shared 300×120 signature space and stored in content.site.signature, so
// they publish through content.json with no image file. The site renders them
// at the foot of every page (see src/portfolio/Signature.tsx).
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import { SIGNATURE_VIEW } from '../../portfolio/Signature';

/** Round to 0.1 so a flourish-y signature stays small in content.json. */
const round = (n: number) => Math.round(n * 10) / 10;

export default function SignatureEditor() {
	const { doc, setSignature } = useEditor();
	const padRef = useRef<SVGSVGElement>(null);
	/** The stroke being drawn right now (committed on pointer release). */
	const [draft, setDraft] = useState<number[][] | null>(null);
	if (!doc) return null;
	const strokes = doc.content.site.signature?.strokes ?? [];

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
			if (points.length > 1) setSignature({ strokes: [...strokes, points] });
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
	};

	const undoStroke = () =>
		setSignature(strokes.length > 1 ? { strokes: strokes.slice(0, -1) } : undefined);

	const shown = draft ? [...strokes, draft] : strokes;

	return (
		<Section title="Signature">
			<Field
				label="Sign your site"
				hint="Draw with your mouse, pen or finger — your signature is signed at the bottom of every page, in your site’s text color."
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
					<button type="button" className="btn-ghost" onClick={() => setSignature(undefined)}>
						Clear
					</button>
				</div>
			)}
		</Section>
	);
}
