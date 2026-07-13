import { useEffect, useState, type CSSProperties } from 'react';
import { withBase, stripSlashes, type NavItem } from './types';
import './Nav.css';

export interface NavProps {
	items: NavItem[];
	/** Site base path (e.g. import.meta.env.BASE_URL). */
	base: string;
	/** Current page path, stripped of slashes ('' = Home). */
	current: string;
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

export default function Nav({ items, base, current, onNavigate }: NavProps) {
	const [hovered, setHovered] = useState<number | null>(null);
	const [hoverCapable, setHoverCapable] = useState(false);

	useEffect(() => {
		setHoverCapable(window.matchMedia('(hover: hover)').matches);
	}, []);

	const links = items.map((item) => ({
		label: item.label,
		path: item.path,
		href: withBase(base, item.path),
		isActive: stripSlashes(item.path) === current,
	}));

	const handleClick = onNavigate
		? (path: string) => (e: React.MouseEvent) => {
				e.preventDefault();
				onNavigate(path);
			}
		: undefined;

	return (
		<div className="navigation-shell">
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
							onClick={handleClick?.(item.path)}
						>
							<span className="dock-item" style={styles.item}>
								{item.label}
							</span>
						</a>
					);
				})}
			</div>

			<details className="mobile-nav">
				<summary className="mobile-nav-trigger" aria-label="Open site navigation">
					<span className="hamburger-line"></span>
					<span className="hamburger-line"></span>
					<span className="hamburger-line"></span>
				</summary>
				<div className="mobile-nav-panel">
					{links.map((item, i) => (
						<a
							key={`${item.path}-${i}`}
							href={item.href}
							className={`mobile-nav-link ${item.isActive ? 'active' : ''}`}
							onClick={handleClick?.(item.path)}
						>
							{item.label}
						</a>
					))}
				</div>
			</details>
		</div>
	);
}
