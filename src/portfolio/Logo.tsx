import './Logo.css';
import { useChromeContrast } from './useChromeContrast';
import type { LogoPosition } from '../lib/content';

export interface LogoProps {
	/** Text shown as the logo (site.logo || site.name). */
	logo: string;
	/** Resolved logo image URL; when present it replaces the text logo. */
	imageSrc?: string;
	/** Home href (already base-joined). */
	href: string;
	/** In the editor preview, intercept the click instead of navigating. */
	onNavigate?: (path: string) => void;
	automaticContrast?: boolean;
	fallbackBackground?: string;
	stabilized?: boolean;
	position?: LogoPosition;
	freeformX?: number;
	freeformY?: number;
}

export default function Logo({
	logo,
	imageSrc,
	href,
	onNavigate,
	automaticContrast = true,
	fallbackBackground = '#ffffff',
	stabilized = true,
	position = 'center',
	freeformX = 50,
	freeformY = 40,
}: LogoProps) {
	const { ref, ink } = useChromeContrast<HTMLDivElement>(
		automaticContrast,
		fallbackBackground,
	);
	return (
		<div
			ref={ref}
			className={`header-logo-container logo-position-${position} ${stabilized ? 'is-stabilized' : ''}`}
			style={
				{
					...(ink ? { '--chrome-ink': ink } : {}),
					'--logo-x': `${Math.min(100, Math.max(0, freeformX))}%`,
					'--logo-y': `${Math.min(400, Math.max(0, freeformY))}px`,
				} as React.CSSProperties
			}
		>
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
