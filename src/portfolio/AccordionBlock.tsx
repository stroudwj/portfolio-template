import './AccordionBlock.css';
import type { AccordionItem } from '../lib/content';

export interface AccordionBlockProps {
	/** Groups the rows so opening one closes the others (native `<details name>`). */
	blockId: string;
	items: AccordionItem[];
	/** Row-title size in pt; display scale expected. Absent = 56. */
	titleSize?: number;
	/** Row-title font. Absent = the theme heading font. */
	fontFamily?: string;
	/** The editor keeps an empty accordion visible so the artist can fill it in. */
	editorPreview?: boolean;
}

const DEFAULT_TITLE_SIZE = 56;

/**
 * Full-width accordion rows — a display-scale title beside a +/− mark, hairline
 * rules between rows, body text underneath when open. Built on `<details name>`:
 * the browser enforces one-open-at-a-time and toggling works with no script at
 * all, so the published static page needs no hydration. Browsers without
 * exclusive-accordion support degrade to independently-openable rows.
 */
export default function AccordionBlock({
	blockId,
	items,
	titleSize,
	fontFamily,
	editorPreview,
}: AccordionBlockProps) {
	const rows = items.filter((item) => item.title.trim() || item.text?.trim());
	if (!rows.length && !editorPreview) return null;
	const size = Math.min(Math.max(titleSize ?? DEFAULT_TITLE_SIZE, 8), 200);
	const style = {
		'--accordion-title-size': `${size}pt`,
		...(fontFamily ? { '--accordion-title-font': fontFamily } : {}),
	} as React.CSSProperties;

	return (
		<div className="accordion-block" style={style}>
			{rows.map((item) => (
				<details className="accordion-row" key={item.id} name={`accordion-${blockId}`}>
					<summary className="accordion-row-summary">
						<span className="accordion-row-title">{item.title.trim() || 'Untitled'}</span>
						<span className="accordion-row-mark" aria-hidden="true" />
					</summary>
					{item.text?.trim() && (
						<div className="accordion-row-body">
							{item.text
								.split(/\n{2,}/)
								.map((paragraph) => paragraph.trim())
								.filter(Boolean)
								.map((paragraph, index) => (
									<p key={index}>{paragraph}</p>
								))}
						</div>
					)}
				</details>
			))}
			{!rows.length && editorPreview && (
				<p className="accordion-empty-hint">Add accordion rows in the page panel</p>
			)}
		</div>
	);
}
