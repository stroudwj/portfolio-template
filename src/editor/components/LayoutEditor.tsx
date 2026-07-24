// Site-wide layout tools published with the site (currently the header/content
// gap). The canvas grid overlay + snap moved to the preview toolbar
// (PreviewPanel's GridTools) so they stay reachable while scrolled deep into a
// page's controls.
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import type { NavStyle } from '../../lib/content';

const MIN_GAP = -140;
const MAX_GAP = 400;

const NAV_STYLES: Array<{ value: NavStyle; label: string; hint: string }> = [
	{ value: 'dock', label: 'Dock', hint: 'The classic left magnify sidebar.' },
	{ value: 'topbar', label: 'Top bar', hint: 'A horizontal bar across the top, links to the right.' },
	{ value: 'centered', label: 'Centered', hint: 'Spaced, uppercase links beneath the logo.' },
	{ value: 'pill', label: 'Floating pill', hint: 'A translucent capsule floating at the bottom.' },
	{ value: 'minimal', label: 'Minimal', hint: 'Just a menu button that opens a full-screen menu.' },
];

export default function LayoutEditor() {
	const { doc, setTheme } = useEditor();
	if (!doc) return null;
	const gap = doc.content.theme.contentGap ?? 0;
	const navStyle: NavStyle = doc.content.theme.navStyle ?? 'dock';
	const fullscreenMobile = doc.content.theme.fullscreenMobileMenu ?? false;
	const stabilized = doc.content.theme.stabilizeNavigation !== false;

	const applyGap = (value: number) => {
		const clamped = Math.max(MIN_GAP, Math.min(Math.round(value), MAX_GAP));
		setTheme({ contentGap: clamped !== 0 ? clamped : undefined });
	};

	return (
		<Section title="Layout" sectionKey="_layout">
			<Field label="Navigation menu" hint={NAV_STYLES.find((s) => s.value === navStyle)?.hint}>
				<div className="chip-row" role="group" aria-label="Navigation menu style">
					{NAV_STYLES.map((style) => (
						<button
							key={style.value}
							type="button"
							className={`btn-icon btn-chip ${navStyle === style.value ? 'active' : ''}`}
							onClick={() => setTheme({ navStyle: style.value === 'dock' ? undefined : style.value })}
						>
							{style.label}
						</button>
					))}
				</div>
			</Field>

			<Field
				label="Keep navigation in place"
				hint="On pins your logo and chosen menu where they are. Off lets them scroll away with the page."
			>
				<div className="chip-row" role="group" aria-label="Keep navigation in place">
					<button
						type="button"
						className={`btn-icon btn-chip ${stabilized ? 'active' : ''}`}
						onClick={() => setTheme({ stabilizeNavigation: undefined })}
					>
						On
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${!stabilized ? 'active' : ''}`}
						onClick={() => setTheme({ stabilizeNavigation: false })}
					>
						Off
					</button>
				</div>
			</Field>

			<Field
				label="Full-screen menu on phones"
				hint="Tapping the menu button fills the screen with your pages, fading in one by one. Off keeps the small corner menu."
			>
				<div className="chip-row" role="group" aria-label="Full-screen mobile menu">
					<button
						type="button"
						className={`btn-icon btn-chip ${!fullscreenMobile ? 'active' : ''}`}
						onClick={() => setTheme({ fullscreenMobileMenu: undefined })}
					>
						Off
					</button>
					<button
						type="button"
						className={`btn-icon btn-chip ${fullscreenMobile ? 'active' : ''}`}
						onClick={() => setTheme({ fullscreenMobileMenu: true })}
					>
						On
					</button>
				</div>
			</Field>

			<Field label="Space above page content" hint="Move every page up or down. Negative values bring the work closer to the header; 0 restores the original position.">
				<div className="gap-row">
					<input
						type="range"
						min={MIN_GAP}
						max={MAX_GAP}
						step={1}
						value={gap}
						onChange={(e) => applyGap(Number(e.target.value))}
						aria-label="Space above page content"
					/>
					<input
						className="text-input gap-input"
						type="number"
						min={MIN_GAP}
						max={MAX_GAP}
						value={gap}
						onChange={(e) => applyGap(Number(e.target.value) || 0)}
						aria-label="Space above page content in pixels"
					/>
					<span className="gap-unit">px</span>
				</div>
			</Field>
		</Section>
	);
}
