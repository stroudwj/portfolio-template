import Nav from './Nav';
import Logo from './Logo';
import { withBase, type NavItem } from './types';
import './frame.css';

export interface PortfolioFrameProps {
	nav: NavItem[];
	logo: string;
	/** Resolved logo image URL; replaces the text logo when present. */
	logoImageSrc?: string;
	base: string;
	/** Current page path, stripped ('' = Home). */
	current: string;
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
	onNavigate,
	children,
}: PortfolioFrameProps) {
	return (
		<>
			<Logo logo={logo} imageSrc={logoImageSrc} href={withBase(base)} onNavigate={onNavigate} />
			<div className="portfolio-container">
				<nav className="sidebar">
					<Nav items={nav} base={base} current={current} onNavigate={onNavigate} />
				</nav>
				<section className="content-view">{children}</section>
			</div>
		</>
	);
}
