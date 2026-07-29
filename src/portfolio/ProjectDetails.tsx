import type { ProjectDetails as ProjectDetailsData } from '../lib/content';
import './ProjectDetails.css';

const LABELS: Array<[keyof Omit<ProjectDetailsData, 'template'>, string]> = [
	['year', 'Year'],
	['medium', 'Medium'],
	['dimensions', 'Dimensions'],
	['collaborators', 'Collaborators'],
	['exhibitionHistory', 'Exhibition history'],
];

export default function ProjectDetails({ project }: { project: ProjectDetailsData }) {
	const rows = LABELS.flatMap(([key, label]) => {
		const value = project[key]?.trim();
		return value ? [{ key, label, value }] : [];
	});
	if (!rows.length) return null;
	return (
		<dl className="project-details">
			{rows.map((row) => (
				<div className="project-detail-row" key={row.key}>
					<dt>{row.label}</dt>
					<dd>{row.value}</dd>
				</div>
			))}
		</dl>
	);
}
