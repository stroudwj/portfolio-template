import Nav from './Nav';
import Logo from './Logo';
import { withBase, type LogoPosition, type NavItem, type NavStyle } from './types';
import './frame.css';

export interface PortfolioFrameProps {
	nav: NavItem[];
	logo: string;
	/** Resolved logo image URL; replaces the text logo when present. */
	logoImageSrc?: string;
	base: string;
	/** Current page path, stripped ('' = Home). */
	current: string;
	/** Site-wide navigation layout. Absent = 'dock'. */
	navStyle?: NavStyle;
	/** Phones open the menu as a full-screen fade-in overlay. */
	fullscreenMobile?: boolean;
	automaticContrast?: boolean;
	fallbackBackground?: string;
	stabilized?: boolean;
	logoPosition?: LogoPosition;
	logoX?: number;
	logoY?: number;
	onNavigate?: (path: string) => void;
	children: React.ReactNode;
}

/** The shared chrome: sidebar nav + centered logo wrapping page content. */
export default function PortfolioFrame({
	nav,
	logo,
	logoImageSrc,
	base,
	current,
	navStyle = 'dock',
	fullscreenMobile,
	automaticContrast = true,
	fallbackBackground = '#ffffff',
	stabilized = true,
	logoPosition = 'center',
	logoX,
	logoY,
	onNavigate,
	children,
}: PortfolioFrameProps) {
	return (
		<>
			<Logo
				logo={logo}
				imageSrc={logoImageSrc}
				href={withBase(base)}
				onNavigate={onNavigate}
				automaticContrast={automaticContrast}
				fallbackBackground={fallbackBackground}
				stabilized={stabilized}
				position={logoPosition}
				freeformX={logoX}
				freeformY={logoY}
			/>
			<div className={`portfolio-container nav-style-${navStyle} logo-position-${logoPosition}`}>
				<nav className={`sidebar ${stabilized ? 'is-stabilized' : ''}`}>
					<Nav
						items={nav}
						base={base}
						current={current}
						navStyle={navStyle}
						fullscreenMobile={fullscreenMobile}
						onNavigate={onNavigate}
						automaticContrast={automaticContrast}
						fallbackBackground={fallbackBackground}
						stabilized={stabilized}
					/>
				</nav>
				<section className="content-view">{children}</section>
			</div>
		</>
	);
}
