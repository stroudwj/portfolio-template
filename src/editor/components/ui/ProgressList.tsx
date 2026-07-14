// The live step checklist shown while publishing or loading a published site. The last
// step shows a spinner (◐); completed steps show a check (✓).
import type { PublishProgress } from '../../lib/exporter';

/** Append a new step, or update the detail of the current one (same step name = update). */
export function appendStep(log: PublishProgress[], p: PublishProgress): PublishProgress[] {
	if (log.length && log[log.length - 1].step === p.step) {
		const next = log.slice();
		next[next.length - 1] = p;
		return next;
	}
	return [...log, p];
}

export function ProgressList({ log }: { log: PublishProgress[] }) {
	return (
		<ul className="progress-list">
			{log.map((p, i) => {
				const last = i === log.length - 1;
				return (
					<li key={p.step} className={last ? 'active' : 'done'}>
						<span className="progress-mark">{last ? '◐' : '✓'}</span>
						<span>
							{p.step}
							{p.detail ? <span className="progress-detail"> {p.detail}</span> : null}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
