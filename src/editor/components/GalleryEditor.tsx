import ImageCollectionEditor from './ImageCollectionEditor';

/** A plain image gallery (Art, Photography): upload, delete, reorder. */
export default function GalleryEditor({ folder, title }: { folder: string; title: string }) {
	return (
		<ImageCollectionEditor
			folder={folder}
			title={title}
			variant="gallery"
			addLabel="+ Add image(s)"
			emptyLabel="No images yet."
		/>
	);
}
