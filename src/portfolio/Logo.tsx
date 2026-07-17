import './Logo.css';

export interface LogoProps {
	/** Text shown as the logo (site.logo || site.name). */
	logo: string;
	/** Resolved logo image URL; when present it replaces the text logo. */
	imageSrc?: string;
	/** Home href (already base-joined). */
	href: string;
	/** In the editor preview, intercept the click instead of navigating. */
	onNavigate?: (path: string) => void;
}

export default function Logo({ logo, imageSrc, href, onNavigate }: LogoProps) {
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
				{imageSrc ? <img className="header-logo-image" src={imageSrc} alt={logo || 'Home'} /> : logo}
			</a>
		</div>
	);
}
