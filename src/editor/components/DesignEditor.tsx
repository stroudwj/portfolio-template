import { useState } from 'react';
import CreativeEditor from './CreativeEditor';
import HeaderLayoutEditor from './HeaderLayoutEditor';
import LayoutEditor from './LayoutEditor';
import SignatureEditor from './SignatureEditor';
import ThemeEditor from './ThemeEditor';

const DESIGN_AREAS = [
	{
		id: 'style',
		icon: 'Aa',
		label: 'Style',
		description: 'Themes, wall materials, colors, typography, page titles, and your signature.',
	},
	{
		id: 'structure',
		icon: '▤',
		label: 'Structure',
		description: 'Navigation, header placement, and spacing across the site.',
	},
	{
		id: 'effects',
		icon: '✦',
		label: 'Effects',
		description: 'Hanging, texture, transitions, cursor behavior, and artwork motion.',
	},
] as const;

type DesignArea = (typeof DESIGN_AREAS)[number]['id'];

/** A small second level of navigation keeps Design from becoming one long mixed list. */
export default function DesignEditor() {
	const [area, setArea] = useState<DesignArea>('style');
	const active = DESIGN_AREAS.find((item) => item.id === area) ?? DESIGN_AREAS[0];

	return (
		<div className="design-workspace">
			<header className="design-workspace-heading">
				<span className="design-eyebrow">Design</span>
				<h2>Shape the whole site</h2>
				<p>Choose an area first. Every change previews live and applies across your portfolio.</p>
			</header>
			<nav className="design-area-tabs" aria-label="Design areas" role="tablist">
				{DESIGN_AREAS.map((item) => (
					<button
						key={item.id}
						type="button"
						id={`design-area-${item.id}`}
						className={area === item.id ? 'active' : ''}
						role="tab"
						aria-selected={area === item.id}
						aria-controls={`design-panel-${item.id}`}
						onClick={() => setArea(item.id)}
					>
						<span aria-hidden="true">{item.icon}</span>
						<strong>{item.label}</strong>
					</button>
				))}
			</nav>
			<p className="design-area-description">{active.description}</p>
			<div
				className="design-area-panel"
				id={`design-panel-${area}`}
				role="tabpanel"
				aria-labelledby={`design-area-${area}`}
			>
				{area === 'style' && (
					<>
						<ThemeEditor />
						<SignatureEditor />
					</>
				)}
				{area === 'structure' && (
					<>
						<LayoutEditor />
						<HeaderLayoutEditor />
					</>
				)}
				{area === 'effects' && <CreativeEditor />}
			</div>
		</div>
	);
}
