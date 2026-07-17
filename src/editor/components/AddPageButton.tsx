import { useEditor } from '../store';

/** Adds a new top-level page (name → nav entry + its own gallery + editor section). */
export default function AddPageButton() {
	const { addPage } = useEditor();
	return (
		<button
			type="button"
			className="btn-secondary add-page"
			onClick={() => {
				const name = prompt('Name of the new page:');
				if (name?.trim()) addPage(name.trim());
			}}
		>
			＋ Add page
		</button>
	);
}
