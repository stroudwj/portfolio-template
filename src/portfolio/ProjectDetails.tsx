import type { ProjectDetails as ProjectDetailsData, ProjectFieldKey } from '../lib/content';
import './ProjectDetails.css';

const LABELS: Array<[keyof Omit<ProjectDetailsData, 'template'>, string]> = [
	['year', 'Year'],
	['medium', 'Medium'],
	['dimensions', 'Dimensions'],
	['collaborators', 'Collaborators'],
	['exhibitionHistory', 'Exhibition history'],
];

export default function ProjectDetails({ project, labels, order, fontFamily, fontSize }: {
	project: ProjectDetailsData;
	labels?: Partial<Record<ProjectFieldKey, string>>;
	order?: ProjectFieldKey[];
	fontFamily?: string;
	fontSize?: number;
}) {
	const ordered = [...(order ?? []), ...LABELS.map(([key]) => key).filter((key) => !(order ?? []).includes(key))];
	const rows = ordered.flatMap((key) => {
		const defaultLabel = LABELS.find(([candidate]) => candidate === key)?.[1] ?? key;
		const value = project[key]?.trim();
		return value ? [{ key, label: labels?.[key] || defaultLabel, value }] : [];
	});
	if (!rows.length) return null;
	return (
		<dl className="project-details" style={{ fontFamily, fontSize: fontSize ? `${fontSize}px` : undefined }}>
			{rows.map((row) => (
				<div className="project-detail-row" key={row.key}>
					<dt>{row.label}</dt>
					<dd>{row.value}</dd>
				</div>
			))}
		</dl>
	);
}
