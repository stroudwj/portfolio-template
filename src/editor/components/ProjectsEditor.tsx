import ImageCollectionEditor from './ImageCollectionEditor';

/** The Home "Selected Works" collection — each image is a project card. */
export default function ProjectsEditor() {
	return (
		<ImageCollectionEditor
			folder="selected-works"
			title="Projects — Selected Works"
			variant="projects"
			addLabel="+ Add project image(s)"
			emptyLabel="No projects yet. Add images to get started."
		/>
	);
}
