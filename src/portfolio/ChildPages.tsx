import './ChildPages.css';

export interface ChildPageItem {
	/** Page key / path, e.g. "work/project-a". */
	key: string;
	label: string;
	href: string;
	/** Resolved thumbnail URL (explicit thumbnail, else the sub-page's first image). */
	thumbSrc?: string;
}

/** A page's sub-pages as a grid of thumbnail cards linking into each one. */
export default function ChildPages({
	items,
	onNavigate,
}: {
	items: ChildPageItem[];
	/** Editor preview: switch pages in place instead of following the link. */
	onNavigate?: (path: string) => void;
}) {
	if (!items.length) return null;
	return (
		<div className="child-pages">
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
					{item.thumbSrc ? <img src={item.thumbSrc} alt={item.label} /> : <div className="child-thumb-empty" />}
					<span>{item.label}</span>
				</a>
			))}
		</div>
	);
}
