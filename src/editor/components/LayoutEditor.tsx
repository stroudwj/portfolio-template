// Site-wide navigation and page-spacing tools published with the site.
// Freeform canvas guides live in the preview's contextual menu.
import { useState } from 'react';
import { useEditor } from '../store';
import { Field, HelpDisclosure, InspectorTabs, Section } from './ui/controls';
import type { NavStyle } from '../../lib/content';

const MIN_GAP = -400;
const MAX_GAP = 400;
const NAV_OFFSET_LIMIT = 64;

const NAV_STYLES: Array<{ value: NavStyle; label: string; hint: string }> = [
	{ value: 'dock', label: 'Dock', hint: 'The classic left magnify sidebar.' },
	{ value: 'topbar', label: 'Top bar', hint: 'A horizontal bar across the top, links to the right.' },
	{ value: 'centered', label: 'Centered', hint: 'Spaced, uppercase links beneath the logo.' },
	{ value: 'pill', label: 'Floating pill', hint: 'A translucent capsule floating at the bottom.' },
	{ value: 'minimal', label: 'Minimal', hint: 'Just a menu button that opens a full-screen menu.' },
];

const STRUCTURE_AREAS = [
	{ id: 'navigation', label: 'Navigation', meta: 'Style & behavior' },
	{ id: 'spacing', label: 'Page spacing', meta: 'Content offset' },
] as const;

type StructureArea = (typeof STRUCTURE_AREAS)[number]['id'];

export default function LayoutEditor() {
	const { doc, setTheme } = useEditor();
	const [area, setArea] = useState<StructureArea>('navigation');
	if (!doc) return null;
	const gap = doc.content.theme.contentGap ?? 0;
	const navStyle: NavStyle = doc.content.theme.navStyle ?? 'dock';
	const fullscreenMobile = doc.content.theme.fullscreenMobileMenu ?? false;
	const stabilized = doc.content.theme.stabilizeNavigation !== false;
	const navOffsetX = doc.content.theme.navOffsetX ?? 0;
	const navOffsetY = doc.content.theme.navOffsetY ?? 0;

	const applyGap = (value: number) => {
		const clamped = Math.max(MIN_GAP, Math.min(Math.round(value), MAX_GAP));
		setTheme({ contentGap: clamped !== 0 ? clamped : undefined });
	};

	const applyNavOffset = (x: number, y: number) => {
		const clamp = (value: number) => Math.max(-NAV_OFFSET_LIMIT, Math.min(Math.round(value), NAV_OFFSET_LIMIT));
		const nextX = clamp(x);
		const nextY = clamp(y);
		setTheme({
			navOffsetX: nextX === 0 ? undefined : nextX,
			navOffsetY: nextY === 0 ? undefined : nextY,
		});
	};

	const offsetLabel = (value: number) => `${value > 0 ? '+' : ''}${value}px`;
	const spokenOffset = (value: number) => `${value} ${Math.abs(value) === 1 ? 'pixel' : 'pixels'}`;

	return (
		<Section title="Structure" sectionKey="_layout">
			<InspectorTabs
				items={STRUCTURE_AREAS}
				active={area}
				onChange={setArea}
				ariaLabel="Structure settings"
			/>

			<div className="inspector-panel" role="tabpanel">
				{area === 'navigation' && (
					<>
						<Field label="Navigation style">
							<div className="nav-style-picker" role="group" aria-label="Navigation menu style">
								{NAV_STYLES.map((style) => (
									<button
										key={style.value}
										type="button"
										className={`nav-style-option ${navStyle === style.value ? 'active' : ''}`}
										aria-pressed={navStyle === style.value}
										onClick={() => setTheme({ navStyle: style.value === 'dock' ? undefined : style.value })}
									>
										<span className={`nav-style-glyph nav-style-glyph-${style.value}`} aria-hidden="true"><i /><i /><i /></span>
										<span><strong>{style.label}</strong><small>{style.hint}</small></span>
									</button>
								))}
							</div>
						</Field>
						<Field label="Fine position" hint="Move the menu one pixel at a time without changing its layout.">
							<div className="nav-position-control">
								<div className="nav-nudge-pad" role="group" aria-label="Fine navigation position">
									<button type="button" className="nav-nudge-up" disabled={navOffsetY <= -NAV_OFFSET_LIMIT} onClick={() => applyNavOffset(navOffsetX, navOffsetY - 1)} aria-label="Move navigation up 1 pixel">↑</button>
									<button type="button" className="nav-nudge-left" disabled={navOffsetX <= -NAV_OFFSET_LIMIT} onClick={() => applyNavOffset(navOffsetX - 1, navOffsetY)} aria-label="Move navigation left 1 pixel">←</button>
									<button type="button" className="nav-nudge-reset" disabled={navOffsetX === 0 && navOffsetY === 0} onClick={() => applyNavOffset(0, 0)} aria-label="Reset navigation position" title="Reset position">↺</button>
									<button type="button" className="nav-nudge-right" disabled={navOffsetX >= NAV_OFFSET_LIMIT} onClick={() => applyNavOffset(navOffsetX + 1, navOffsetY)} aria-label="Move navigation right 1 pixel">→</button>
									<button type="button" className="nav-nudge-down" disabled={navOffsetY >= NAV_OFFSET_LIMIT} onClick={() => applyNavOffset(navOffsetX, navOffsetY + 1)} aria-label="Move navigation down 1 pixel">↓</button>
								</div>
								<div className="nav-offset-readout" aria-live="polite" aria-label={`Navigation offset: horizontal ${spokenOffset(navOffsetX)}, vertical ${spokenOffset(navOffsetY)}`}>
									<span><strong>X</strong>{offsetLabel(navOffsetX)}</span>
									<span><strong>Y</strong>{offsetLabel(navOffsetY)}</span>
								</div>
							</div>
						</Field>
						<Field label="While visitors scroll">
							<div className="chip-row" role="group" aria-label="Navigation scroll behavior">
								<button type="button" className={`btn-icon btn-chip ${stabilized ? 'active' : ''}`} aria-pressed={stabilized} onClick={() => setTheme({ stabilizeNavigation: undefined })}>Stays visible</button>
								<button type="button" className={`btn-icon btn-chip ${!stabilized ? 'active' : ''}`} aria-pressed={!stabilized} onClick={() => setTheme({ stabilizeNavigation: false })}>Scrolls away</button>
							</div>
						</Field>
						<Field label="Full-screen menu on phones">
							<div className="chip-row" role="group" aria-label="Full-screen mobile menu">
								<button type="button" className={`btn-icon btn-chip ${!fullscreenMobile ? 'active' : ''}`} aria-pressed={!fullscreenMobile} onClick={() => setTheme({ fullscreenMobileMenu: undefined })}>Compact</button>
								<button type="button" className={`btn-icon btn-chip ${fullscreenMobile ? 'active' : ''}`} aria-pressed={fullscreenMobile} onClick={() => setTheme({ fullscreenMobileMenu: true })}>Full screen</button>
							</div>
						</Field>
						<HelpDisclosure label="About navigation behavior">
							<p>The menu scroll behavior is independent from the header logo. Change the logo in Site → Header.</p>
						</HelpDisclosure>
					</>
				)}

				{area === 'spacing' && (
					<>
						<Field label="Space above page content">
							<div className="gap-row">
								<input type="range" min={MIN_GAP} max={MAX_GAP} step={1} value={gap} onChange={(e) => applyGap(Number(e.target.value))} aria-label="Space above page content" />
								<input className="text-input gap-input" type="number" min={MIN_GAP} max={MAX_GAP} value={gap} onChange={(e) => applyGap(Number(e.target.value) || 0)} aria-label="Space above page content in pixels" />
								<span className="gap-unit">px</span>
							</div>
						</Field>
						<HelpDisclosure label="About page spacing">
							<p>Negative values move artwork toward the header. Positive values add breathing room. Zero restores the default.</p>
						</HelpDisclosure>
					</>
				)}
			</div>
		</Section>
	);
}
