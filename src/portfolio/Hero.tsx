import './Hero.css';
import type { PageHeadingPosition } from '../lib/content';

export interface HeroProps {
	heading?: string;
	position?: PageHeadingPosition;
}

/** The Home page heading block ("Selected Works"). */
export default function Hero({ heading, position = 'right' }: HeroProps) {
	if (!heading) return null;
	return (
		<div className={`page-header heading-position-${position}`}>
			<h1 className="page-title">{heading}</h1>
		</div>
	);
}
