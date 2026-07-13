import './Hero.css';

export interface HeroProps {
	heading?: string;
}

/** The Home page heading block ("Selected Works"). */
export default function Hero({ heading }: HeroProps) {
	if (!heading) return null;
	return (
		<div className="page-header">
			<h1 className="page-title">{heading}</h1>
		</div>
	);
}
