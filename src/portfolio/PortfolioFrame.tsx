import Nav from './Nav';
import Logo from './Logo';
import { withBase, type NavItem } from './types';
import './frame.css';

export interface PortfolioFrameProps {
	nav: NavItem[];
	logo: string;
	base: string;
	/** Current page path, stripped ('' = Home). */
	current: string;
	showLogo?: boolean;
	onNavigate?: (path: string) => void;
	children: React.ReactNode;
}

/** The shared chrome: sidebar nav + centered logo wrapping page content. */
export default function PortfolioFrame({
	nav,
	logo,
	base,
	current,
	showLogo = true,
	onNavigate,
	children,
}: PortfolioFrameProps) {
	return (
		<>
			{showLogo && <Logo logo={logo} href={withBase(base)} onNavigate={onNavigate} />}
			<div className="portfolio-container">
				<nav className="sidebar">
					<Nav items={nav} base={base} current={current} onNavigate={onNavigate} />
				</nav>
				<section className="content-view">{children}</section>
			</div>
		</>
	);
}
