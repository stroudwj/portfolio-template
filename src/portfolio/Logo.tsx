import './Logo.css';

export interface LogoProps {
	/** Text shown as the logo (site.logo || site.name). */
	logo: string;
	/** Home href (already base-joined). */
	href: string;
	/** In the editor preview, intercept the click instead of navigating. */
	onNavigate?: (path: string) => void;
}

export default function Logo({ logo, href, onNavigate }: LogoProps) {
	return (
		<div className="header-logo-container">
			<a
				href={href}
				className="header-logo"
				onClick={
					onNavigate
						? (e) => {
								e.preventDefault();
								onNavigate('');
							}
						: undefined
				}
			>
				{logo}
			</a>
		</div>
	);
}
