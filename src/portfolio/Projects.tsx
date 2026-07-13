import Gallery from './Gallery';
import type { ResolvedImage } from './types';

export interface ProjectsProps {
	/** Each image is a project: its title/description/link show in the lightbox. */
	images: ResolvedImage[];
	alt?: string;
	emptyMessage?: React.ReactNode;
}

/**
 * The "Selected Works" collection. Projects share the Gallery's grid + lightbox;
 * the difference is purely in the editor, where each image is edited as a project
 * card (title, description, link). Rendering here matches the site exactly.
 */
export default function Projects({ images, alt, emptyMessage }: ProjectsProps) {
	return <Gallery images={images} alt={alt} emptyMessage={emptyMessage} />;
}
