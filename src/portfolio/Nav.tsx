import { useEffect, useState, type CSSProperties } from 'react';
import { withBase, stripSlashes, type NavItem, type NavStyle } from './types';
import './Nav.css';

export interface NavProps {
	items: NavItem[];
	/** Site base path (e.g. import.meta.env.BASE_URL). */
	base: string;
	/** Current page path, stripped of slashes ('' = Home). */
	current: string;
	/** Site-wide navigation layout. Absent = 'dock'. */
	navStyle?: NavStyle;
	/** Phones (and the 'minimal' style) open the menu as a full-screen fade-in overlay. */
	fullscreenMobile?: boolean;
	/** In the editor preview, switch pages instead of navigating. */
	onNavigate?: (path: string) => void;
}

// The Mac-dock hover magnify, ported from the Phase 1 vanilla script: the hovered
// item scales up, its neighbours a little, the rest shrink and fade. Only runs on
// devices with a real hover (desktop); touch falls back to the CSS in Nav.css.
function magnify(index: number, hovered: number | null): { link: CSSProperties; item: CSSProperties } {
	if (hovered === null) return { link: {}, item: {} };
	if (index === hovered)
		return { link: { paddingTop: '12px', paddingBottom: '12px' }, item: { transform: 'scale(1.8)', color: '#000000' } };
	if (Math.abs(index - hovered) === 1)
		return { link: { paddingTop: '6px', paddingBottom: '6px' }, item: { transform: 'scale(1.25)', color: '#666666' } };
	return { link: { paddingTop: '3px', paddingBottom: '3px' }, item: { transform: 'scale(1)', color: '#999999' } };
}

export default function Nav({ items, base, current, navStyle = 'dock', fullscreenMobile, onNavigate }: NavProps) {
	const [hovered, setHovered] = useState<number | null>(null);
	const [hoverCapable, setHoverCapable] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		setHoverCapable(window.matchMedia('(hover: hover)').matches);
	}, []);

	// The 'minimal' style hides the desktop list, so its menu is always the
	// full-screen overlay; other styles use it only when the artist opts in.
	const overlayMode = fullscreenMobile || navStyle === 'minimal';

	// Close the overlay on Escape and lock the page scroll while it's open.
	useEffect(() => {
		if (!menuOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setMenuOpen(false);
		};
		window.addEventListener('keydown', onKey);
		const prevOverflow = overlayMode ? document.body.style.overflow : '';
		if (overlayMode) document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			if (overlayMode) document.body.style.overflow = prevOverflow;
		};
	}, [menuOpen, overlayMode]);

	const links = items.filter((item) => !item.hidden).map((item) => ({
		label: item.label,
		path: item.path,
		href: withBase(base, item.path),
		isActive: stripSlashes(item.path) === current,
	}));

	const go = (path: string) => (e: React.MouseEvent) => {
		setMenuOpen(false);
		if (onNavigate) {
			e.preventDefault();
			onNavigate(path);
		}
	};

	const isDock = navStyle === 'dock';
	const showDesktopList = navStyle !== 'minimal';

	return (
		<div className={`navigation-shell nav-${navStyle} ${overlayMode ? 'nav-overlay-mode' : 'nav-compact-mode'}`}>
			{showDesktopList &&
				(isDock ? (
					<div className="mac-dock-vertical desktop-nav" onMouseLeave={() => setHovered(null)}>
						{links.map((item, i) => {
							const styles = magnify(i, hovered);
							return (
								<a
									key={`${item.path}-${i}`}
									href={item.href}
									className={`dock-link ${item.isActive ? 'active' : ''}`}
									style={styles.link}
									onMouseEnter={hoverCapable ? () => setHovered(i) : undefined}
									onClick={go(item.path)}
								>
									<span className="dock-item" style={styles.item}>
										{item.label}
									</span>
								</a>
							);
						})}
					</div>
				) : (
					<div className="nav-links-row desktop-nav">
						{links.map((item, i) => (
							<a
								key={`${item.path}-${i}`}
								href={item.href}
								className={`row-link ${item.isActive ? 'active' : ''}`}
								onClick={go(item.path)}
							>
								{item.label}
							</a>
						))}
					</div>
				))}

			{/* Hamburger trigger — CSS shows it on phones always, and on desktop for the
			    'minimal' style. Toggles the compact dropdown or the full-screen overlay. */}
			<button
				type="button"
				className={`nav-menu-trigger ${menuOpen ? 'is-open' : ''}`}
				aria-label={menuOpen ? 'Close site navigation' : 'Open site navigation'}
				aria-expanded={menuOpen}
				onClick={() => setMenuOpen((open) => !open)}
			>
				<span className="hamburger-line"></span>
				<span className="hamburger-line"></span>
				<span className="hamburger-line"></span>
			</button>

			<div
				className={`nav-menu ${overlayMode ? 'nav-menu-overlay' : 'nav-menu-compact'} ${menuOpen ? 'is-open' : ''}`}
				onClick={(e) => {
					if (e.target === e.currentTarget) setMenuOpen(false);
				}}
			>
				<div className="nav-menu-inner">
					{links.map((item, i) => (
						<a
							key={`${item.path}-${i}`}
							href={item.href}
							className={`nav-menu-link ${item.isActive ? 'active' : ''}`}
							style={{ '--nav-menu-index': i } as CSSProperties}
							onClick={go(item.path)}
						>
							{item.label}
						</a>
					))}
				</div>
			</div>
		</div>
	);
}
