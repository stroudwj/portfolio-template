import './ShapeBlock.css';

export interface ShapeBlockProps {
	shape: 'line' | 'arrow' | 'rectangle';
	/** Stroke color. Absent = the theme ink (text color). */
	color?: string;
	/** Stroke width in px. Absent = 1 (hairline). */
	strokeWidth?: number;
	/** Arrows only: which way the head points. Absent = 'right'. */
	direction?: 'right' | 'left' | 'up' | 'down';
}

/**
 * The three canvas shape primitives — line, arrow, rectangle — as plain CSS
 * boxes that fill their canvas item. Strokes are fixed pixel widths (borders
 * and background bars, no SVG scaling), so a hairline stays a hairline at any
 * box size or aspect ratio, and the arrow head keeps its shape.
 */
export default function ShapeBlock({ shape, color, strokeWidth, direction }: ShapeBlockProps) {
	const stroke = Math.min(Math.max(strokeWidth ?? 1, 1), 24);
	const style = {
		'--shape-stroke': `${stroke}px`,
		...(color ? { '--shape-color': color } : {}),
	} as React.CSSProperties;
	if (shape === 'rectangle') {
		return <div className="shape-block shape-rectangle" style={style} aria-hidden="true" />;
	}
	if (shape === 'arrow') {
		const dir = direction ?? 'right';
		return (
			<div className={`shape-block shape-arrow shape-arrow-${dir}`} style={style} aria-hidden="true">
				<span className="shape-arrow-shaft" />
				<span className="shape-arrow-head" />
			</div>
		);
	}
	return <div className="shape-block shape-line" style={style} aria-hidden="true" />;
}
