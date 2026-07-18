// The artist's hand-drawn mark. Strokes are captured in the editor's signing
// pad (SignatureEditor) as polylines in a fixed 300×120 space and stored in
// content.site.signature, so the published site and the preview render the
// exact same inline SVG — no image file involved, and it inherits the theme's
// text color like real ink.
import type { SignatureData } from '../lib/content';
import './Signature.css';

/** The coordinate space every signature is drawn and rendered in. */
export const SIGNATURE_VIEW = { w: 300, h: 120 } as const;

export default function Signature({ data }: { data: SignatureData }) {
	const strokes = (data.strokes ?? []).filter((s) => s.length > 1);
	if (!strokes.length) return null;
	return (
		<div className="site-signature">
			<svg
				viewBox={`0 0 ${SIGNATURE_VIEW.w} ${SIGNATURE_VIEW.h}`}
				role="img"
				aria-label="Signature"
			>
				{strokes.map((points, i) => (
					<polyline key={i} points={points.map(([x, y]) => `${x},${y}`).join(' ')} />
				))}
			</svg>
		</div>
	);
}
