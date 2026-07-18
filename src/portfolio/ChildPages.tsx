import type { ChildrenStyle } from '../lib/content';
import './ChildPages.css';

export interface ChildPageItem {
	/** Page key / path, e.g. "work/project-a". */
	key: string;
	label: string;
	href: string;
	/** Resolved thumbnail URL (explicit thumbnail, else the sub-page's first image). */
	thumbSrc?: string;
}

/**
 * A page's sub-pages linking into each one, in one of four presentations:
 * 'cards' (default) — a grid of thumbnail cards; 'large' — big two-column
 * covers; 'list' — compact rows with a small square thumb; 'index' — a pure
 * typographic list, no images.
 */
export default function ChildPages({
	items,
	style = 'cards',
	onNavigate,
}: {
	items: ChildPageItem[];
	style?: ChildrenStyle;
	/** Editor preview: switch pages in place instead of following the link. */
	onNavigate?: (path: string) => void;
}) {
	if (!items.length) return null;
	return (
		<div className={`child-pages child-style-${style}`}>
			{items.map((item) => (
				<a
					key={item.key}
					className="child-card"
					href={item.href}
					onClick={
						onNavigate
							? (e) => {
									e.preventDefault();
									onNavigate(item.key);
								}
							: undefined
					}
				>
					{style !== 'index' &&
						(item.thumbSrc ? <img src={item.thumbSrc} alt={item.label} /> : <div className="child-thumb-empty" />)}
					<span>{item.label}</span>
				</a>
			))}
		</div>
	);
}
