import { useEditor } from '../store';
import { accessibilityAudit, performanceAudit } from '../lib/site-audit';
import { Section } from './ui/controls';

function bytesLabel(bytes: number): string {
	if (!bytes) return 'reference files';
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB known media`;
}

export default function SiteAuditPanel() {
	const { doc } = useEditor();
	if (!doc) return null;
	const performance = performanceAudit(doc);
	const accessibility = accessibilityAudit(doc);
	const errors = accessibility.filter((finding) => finding.severity === 'error');

	return (
		<Section title="Pre-publish quality" sectionKey="_publish-quality">
			<div className="performance-meter" data-score={performance.score}>
				<div className="performance-meter-heading">
					<span>
						<strong>Performance</strong>
						<small>{performance.label}</small>
					</span>
					<output aria-label={`Performance score ${performance.score} out of 100`}>
						{performance.score}
					</output>
				</div>
				<div className="performance-track" aria-hidden="true">
					<span style={{ width: `${performance.score}%` }} />
				</div>
				<p>{performance.imageCount} artworks · {bytesLabel(performance.knownBytes)} · motion load {performance.motionWeight}</p>
				<ul>
					{performance.notes.map((note) => <li key={note}>{note}</li>)}
				</ul>
			</div>

			<div className="accessibility-audit">
				<div className="accessibility-audit-heading">
					<span>
						<strong>Accessibility</strong>
						<small>Structure, labels, contrast, forms, and motion</small>
					</span>
					<b className={errors.length ? 'needs-work' : 'ready'}>
						{accessibility.length ? `${accessibility.length} to review` : 'Ready'}
					</b>
				</div>
				{accessibility.length ? (
					<ul>
						{accessibility.map((finding, index) => (
							<li className={finding.severity} key={`${finding.message}-${index}`}>
								{finding.message}
							</li>
						))}
					</ul>
				) : (
					<p>No structural accessibility problems found.</p>
				)}
				<p className="audit-pass-note">Reduced-motion visitors automatically receive still transitions, text, artwork, film, and scroll scenes.</p>
			</div>
		</Section>
	);
}
