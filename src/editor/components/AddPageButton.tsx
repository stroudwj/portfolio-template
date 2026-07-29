import { useEditor } from '../store';

/** Adds a new top-level page (name → nav entry + its own gallery + editor section). */
export default function AddPageButton() {
	const { addPage } = useEditor();
	const add = (projectTemplate?: 'artwork' | 'collaboration' | 'exhibition') => {
		const name = prompt(projectTemplate ? 'Name of the new project:' : 'Name of the new page:');
		if (name?.trim()) addPage(name.trim(), projectTemplate);
	};
	return (
		<div className="add-page-actions">
			<button type="button" className="btn-secondary add-content-action" onClick={() => add()}>
				＋ Add page
			</button>
			<details className="add-project-menu">
				<summary className="btn-secondary add-content-action">＋ Add project</summary>
				<div>
					<button type="button" onClick={() => add('artwork')}>Artwork</button>
					<button type="button" onClick={() => add('collaboration')}>Collaboration</button>
					<button type="button" onClick={() => add('exhibition')}>Exhibition</button>
				</div>
			</details>
		</div>
	);
}
