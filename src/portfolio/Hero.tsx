import './Hero.css';
import type { KineticTextConfig, PageHeadingPosition } from '../lib/content';
import {
	KineticInline,
	KineticMarquee,
	kineticClass,
	kineticStyle,
} from './KineticText';

export interface HeroProps {
	heading?: string;
	position?: PageHeadingPosition;
	kinetic?: KineticTextConfig;
}

/** The Home page heading block ("Selected Works"). */
export default function Hero({ heading, position = 'right', kinetic }: HeroProps) {
	if (!heading) return null;
	return (
		<div className={`page-header heading-position-${position}`}>
			<h1
				className={`page-title ${kineticClass(kinetic)}`}
				style={kineticStyle(kinetic)}
				data-kinetic-target={kinetic ? 'page:heading' : undefined}
			>
				{kinetic?.effect === 'marquee' ? (
					<KineticMarquee duplicateText={heading}>{heading}</KineticMarquee>
				) : (
					<KineticInline text={heading} config={kinetic} />
				)}
			</h1>
		</div>
	);
}
