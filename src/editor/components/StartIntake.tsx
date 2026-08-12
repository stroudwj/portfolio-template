// The artist intake: four quick questions instead of a template wall. Every
// answer changes something real — the starter structure, the name on the
// header, a page per series, whether the editor opens into the workbench
// (sort-it-here) or straight onto the wall, and whether the crop & light
// tools get pointed out. Skippable at every step; no answer is wasted.
import { useState } from 'react';
import { funnelStep } from '../../lib/funnel';
import { starterShotUrl, type StarterRecipe } from '../lib/templates';
import { BlockIcon } from './ui/block-icons';
import { PanelIcon } from './ui/panel-icons';

type ReadyStarter = StarterRecipe & { content: NonNullable<StarterRecipe['content']> };

export interface IntakeAnswers {
	/** null = blank portfolio ("a bit of everything"). */
	starter: ReadyStarter | null;
	/** The name that goes on the wall (site header); empty = keep the sample's. */
	name: string;
	/** One page is hung per series title. */
	series: string[];
	workflow: 'pile' | 'organized';
	finishing: boolean;
}

const STEP_COUNT = 4;

export default function StartIntake({
	starters,
	onComplete,
	onCancel,
}: {
	starters: ReadyStarter[];
	onComplete: (answers: IntakeAnswers) => void;
	onCancel: () => void;
}) {
	const [step, setStep] = useState(0);
	const [starter, setStarter] = useState<ReadyStarter | null>(null);
	const [name, setName] = useState('');
	const [seriesText, setSeriesText] = useState('');
	const [workflow, setWorkflow] = useState<'pile' | 'organized'>('pile');
	const [finishing, setFinishing] = useState(false);

	const finish = (overrides?: Partial<IntakeAnswers>) => {
		funnelStep('intake');
		return onComplete({
			starter,
			name: name.trim(),
			series: seriesText
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
				.slice(0, 8),
			workflow,
			finishing,
			...overrides,
		});
	};

	const header = (title: string, lead: string) => (
		<header className="intake-head">
			<span className="intake-progress" aria-label={`Step ${step + 1} of ${STEP_COUNT}`}>
				{Array.from({ length: STEP_COUNT }, (_, index) => (
					<i key={index} className={index <= step ? 'done' : ''} />
				))}
			</span>
			<h2>{title}</h2>
			<p>{lead}</p>
		</header>
	);

	const nav = (options?: { nextLabel?: string; onNext?: () => void }) => (
		<div className="intake-nav">
			<button
				type="button"
				className="btn-ghost"
				onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
			>
				{step === 0 ? 'Back' : 'Previous'}
			</button>
			<button
				type="button"
				className="btn-primary"
				onClick={options?.onNext ?? (() => setStep(step + 1))}
			>
				{options?.nextLabel ?? 'Next'}
			</button>
		</div>
	);

	if (step === 0)
		return (
			<div className="intake">
				{header('Pick a starting design', 'Every template is a real, finished site — your work replaces the samples, and you can switch designs later.')}
				<div className="intake-tiles">
					{/* Spec 37B: a card is the template — its own rendered page and its
					    own name. Discipline stays as ordering, not as the label. */}
					{starters.map((candidate) => {
						const shot = starterShotUrl(candidate.id);
						return (
							<button
								key={candidate.id}
								type="button"
								className={`intake-tile${starter?.id === candidate.id ? ' active' : ''}`}
								aria-pressed={starter?.id === candidate.id}
								onClick={() => {
									setStarter(candidate);
									setStep(1);
								}}
							>
								{shot && (
									<img
										src={shot}
										alt={`The ${candidate.name} template’s home page`}
										loading="lazy"
									/>
								)}
								<strong>{candidate.name}</strong>
								<small>{candidate.tagline}</small>
							</button>
						);
					})}
					<button
						type="button"
						className={`intake-tile intake-tile-blank${starter === null ? '' : ''}`}
						onClick={() => {
							setStarter(null);
							setStep(1);
						}}
					>
						<span className="intake-tile-blank-mark" aria-hidden="true">
							<PanelIcon type="sparkle" />
						</span>
						<strong>Blank wall</strong>
						<small>Start with nothing on the wall and build it yourself.</small>
					</button>
				</div>
			</div>
		);

	if (step === 1)
		return (
			<div className="intake">
				{header('Put a name on the wall', 'Both are optional — everything renames later.')}
				<label className="field">
					<span className="field-label">Your name (or studio name)</span>
					<input
						className="text-input"
						value={name}
						placeholder="e.g. Ana Torres"
						autoFocus
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<label className="field">
					<span className="field-label">Series or bodies of work — we’ll hang a page for each</span>
					<input
						className="text-input"
						value={seriesText}
						placeholder="e.g. Harbor paintings, Portraits, Sketchbook"
						onChange={(event) => setSeriesText(event.target.value)}
					/>
					<span className="field-hint">Separate with commas. Leave empty for one page to start.</span>
				</label>
				{nav()}
			</div>
		);

	if (step === 2)
		return (
			<div className="intake">
				{header('How does your work arrive?', 'This only sets where the editor opens — nothing is locked in.')}
				<div className="intake-choices">
					<button
						type="button"
						className={`intake-choice${workflow === 'pile' ? ' active' : ''}`}
						aria-pressed={workflow === 'pile'}
						onClick={() => setWorkflow('pile')}
					>
						<PanelIcon type="workbench" />
						<span>
							<strong>It’s a pile — let me sort it here</strong>
							<small>Opens the workbench first: drop everything in, then organize into series.</small>
						</span>
					</button>
					<button
						type="button"
						className={`intake-choice${workflow === 'organized' ? ' active' : ''}`}
						aria-pressed={workflow === 'organized'}
						onClick={() => setWorkflow('organized')}
					>
						<BlockIcon type="gallery" />
						<span>
							<strong>Already organized — take me to the wall</strong>
							<small>Opens straight onto your home page, ready to hang folders of finished work.</small>
						</span>
					</button>
				</div>
				{nav()}
			</div>
		);

	return (
		<div className="intake">
			{header('Are the photos gallery-ready?', 'Phone shots of real work often need a small finishing pass.')}
			<div className="intake-choices">
				<button
					type="button"
					className={`intake-choice${!finishing ? ' active' : ''}`}
					aria-pressed={!finishing}
					onClick={() => setFinishing(false)}
				>
					<BlockIcon type="images" />
					<span>
						<strong>Gallery-ready</strong>
						<small>Cropped, straight, and true to the work.</small>
					</span>
				</button>
				<button
					type="button"
					className={`intake-choice${finishing ? ' active' : ''}`}
					aria-pressed={finishing}
					onClick={() => setFinishing(true)}
				>
					<PanelIcon type="settings" />
					<span>
						<strong>Some need a crop or light tweak</strong>
						<small>Every image’s Edit has crop, brightness, and contrast — non-destructive, fix as you hang.</small>
					</span>
				</button>
			</div>
			{nav({ nextLabel: 'Hang my site', onNext: () => finish() })}
		</div>
	);
}
