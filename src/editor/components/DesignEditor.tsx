import { useState } from 'react';
import { useEditor } from '../store';
import CreativeEditor from './CreativeEditor';
import HeaderLayoutEditor from './HeaderLayoutEditor';
import LayoutEditor from './LayoutEditor';
import PageHeadingLayoutEditor from './PageHeadingLayoutEditor';
import ThemeEditor from './ThemeEditor';
import { HelpDisclosure } from './ui/controls';
import { PanelIcon } from './ui/panel-icons';

const DESIGN_AREAS = [
	{
		id: 'style',
		label: 'Style',
		blurb: 'Theme, colors, fonts, and your signature.',
		description: 'Themes, wall materials, colors, typography, page titles, and your signature.',
	},
	{
		id: 'structure',
		label: 'Structure',
		blurb: 'Navigation style and header placement.',
		description:
			'Navigation style plus the header’s size and placement. The header’s name or logo image lives in Site → Header.',
	},
	{
		id: 'effects',
		label: 'Effects',
		blurb: 'Hanging, texture, transitions, and motion.',
		description: 'Hanging, texture, transitions, cursor behavior, and artwork motion.',
	},
] as const;

type DesignArea = (typeof DESIGN_AREAS)[number]['id'];

/** Design opens on an index of preview cards — each card shows the site's own
 * current setting — and drills into one area at a time with a way back. */
export default function DesignEditor() {
	const { doc } = useEditor();
	const [area, setArea] = useState<DesignArea | null>(null);
	const theme = doc?.content.theme;
	const active = DESIGN_AREAS.find((item) => item.id === area);

	if (!active) {
		return (
			<div className="design-workspace">
				<header className="page-panel-head">
					<h2>Design</h2>
				</header>
				<HelpDisclosure label="How design works">
					<p>
						Site-wide appearance, split into three areas. Changes preview live and apply across
						your whole portfolio.
					</p>
				</HelpDisclosure>
				<div className="design-cards">
					{DESIGN_AREAS.map((item) => (
						<button
							key={item.id}
							type="button"
							className="design-card"
							onClick={() => setArea(item.id)}
						>
							<span className="design-card-preview" aria-hidden="true">
								{item.id === 'style' && theme && (
									<span className="design-card-style" style={{ background: theme.backgroundColor }}>
										<span
											className="design-card-type"
											style={{
												color: theme.textColor,
												fontFamily: theme.headingFontFamily || theme.fontFamily,
											}}
										>
											Aa
										</span>
										<span className="design-card-swatches">
											{[theme.textColor, theme.accentColor, theme.mutedTextColor].map(
												(color, index) => (
													<span key={index} style={{ background: color }} />
												),
											)}
										</span>
									</span>
								)}
								{item.id === 'structure' && (
									<span className="design-card-wire">
										<span className="design-card-wire-head">
											<i />
											<i />
											<i />
										</span>
										<span className="design-card-wire-body" />
									</span>
								)}
								{item.id === 'effects' && <PanelIcon type="sparkle" />}
							</span>
							<span className="design-card-copy">
								<strong>{item.label}</strong>
								<small>{item.blurb}</small>
							</span>
							<span className="design-card-go" aria-hidden="true">
								<PanelIcon type="forward" />
							</span>
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="design-workspace">
			<div className="page-workspace-nav" aria-label="Current design area">
				<button type="button" className="page-workspace-back" onClick={() => setArea(null)}>
					<PanelIcon type="back" />
					Design
				</button>
				<strong className="page-workspace-title">{active.label}</strong>
				<span className="page-workspace-nav-end" aria-hidden="true" />
			</div>
			<HelpDisclosure label={`About ${active.label.toLowerCase()}`} className="design-area-help">
				<p>{active.description} Changes preview live and apply across your portfolio.</p>
			</HelpDisclosure>
			<div className="design-area-panel">
				{active.id === 'style' && <ThemeEditor />}
				{active.id === 'structure' && (
					<>
						<LayoutEditor />
						<HeaderLayoutEditor />
						<PageHeadingLayoutEditor />
					</>
				)}
				{active.id === 'effects' && <CreativeEditor />}
			</div>
		</div>
	);
}
