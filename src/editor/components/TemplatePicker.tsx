// The landing-page look picker (BACKLOG spec 11): offered after the workbench
// build — or straight away for already-organized artists — filtered by the
// intake discipline. Picking a look applies it live behind the panel: the
// artist's works re-hang into the template's image positions, and the panel
// stays open so switching looks re-flows the same works. Each apply is one
// undo; closing keeps whatever hangs now.
import { useState } from 'react';
import { useEditor, type TemplateApplyReport } from '../store';
import {
	starterDiscipline,
	templatesForDiscipline,
	type ReadyStarterRecipe,
} from '../lib/templates';
import { sampleArtworkUrl } from '../lib/sample-artwork';
import { PanelIcon } from './ui/panel-icons';

function reportLine(report: TemplateApplyReport): string {
	if (!report.rehung && report.samplesLeft)
		return 'Showing labeled sample works — rehang them with your own whenever you’re ready.';
	const parts: string[] = [];
	if (report.rehung)
		parts.push(`Re-hung ${report.rehung} of your ${report.rehung === 1 ? 'work' : 'works'}`);
	if (report.overflow) parts.push(`${report.overflow} more follow after the last position`);
	if (report.samplesLeft)
		parts.push(
			`${report.samplesLeft} sample ${report.samplesLeft === 1 ? 'frame' : 'frames'} still to fill`,
		);
	return parts.length ? `${parts.join('; ')}.` : 'This look is on the wall.';
}

export default function TemplatePicker({
	intakeStarterId,
	onApplied,
	onClose,
}: {
	/** The intake's starter choice (null = blank) — sets which looks lead. */
	intakeStarterId?: string | null;
	/** Called after each successful apply, e.g. to show the home page. */
	onApplied?: () => void;
	onClose: () => void;
}) {
	const { applyTemplate } = useEditor();
	const discipline = starterDiscipline(intakeStarterId);
	const { matched, more } = templatesForDiscipline(discipline);
	const [applied, setApplied] = useState<{ id: string; report: TemplateApplyReport } | null>(
		null,
	);

	const pick = (recipe: ReadyStarterRecipe) => {
		const report = applyTemplate(recipe.content);
		if (!report) return;
		setApplied({ id: recipe.id, report });
		onApplied?.();
	};

	const card = (recipe: ReadyStarterRecipe) => {
		const cover = sampleArtworkUrl(recipe.coverSampleAssetId);
		const active = applied?.id === recipe.id;
		return (
			<button
				key={recipe.id}
				type="button"
				className={`template-pick-card${active ? ' active' : ''}`}
				aria-pressed={active}
				onClick={() => pick(recipe)}
			>
				<span className="template-pick-cover">{cover && <img src={cover} alt="" />}</span>
				<span className="template-pick-copy">
					<strong>{recipe.name}</strong>
					<small>{recipe.tagline}</small>
				</span>
			</button>
		);
	};

	return (
		<div
			className="floating-panel floating-template-picker"
			role="dialog"
			aria-label="Pick a landing page look"
		>
			<header className="floating-panel-head">
				<strong>
					<PanelIcon type="sparkle" />
					Pick a landing page look
				</strong>
				<button
					type="button"
					className="pv-icon-button"
					aria-label="Keep this look"
					title="Keep this look"
					onClick={onClose}
				>
					<PanelIcon type="close" />
				</button>
			</header>
			<div className="floating-panel-body template-picker-body">
				<p className="template-picker-lead">
					Your works re-hang into each look’s positions — switch freely, and one undo brings
					the last hang back.
				</p>
				<div className="template-pick-grid">{matched.map(card)}</div>
				{more.length > 0 && (
					<>
						<p className="template-picker-more">More looks</p>
						<div className="template-pick-grid">{more.map(card)}</div>
					</>
				)}
				{applied && (
					<p className="template-picker-report" role="status">
						{reportLine(applied.report)}
					</p>
				)}
			</div>
			<footer className="floating-panel-guide-foot">
				<button type="button" className="btn-primary" onClick={onClose}>
					Keep this look
				</button>
			</footer>
		</div>
	);
}
