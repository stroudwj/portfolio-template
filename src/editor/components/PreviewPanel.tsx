import { useState } from 'react';
import { useEditor } from '../store';
import Portfolio from '../../portfolio/Portfolio';
import { docToPortfolioData } from '../lib/content-init';

/** Live preview — renders the SAME shared portfolio components as the real site.
 *  Navigation happens through the site's own nav (sidebar, logo, sub-page cards);
 *  clicking it also scrolls the editing column to that page's controls. Gallery
 *  images are live here: drag one to move it, drag its corner handle to resize. */
export default function PreviewPanel({ base }: { base: string }) {
	const editor = useEditor();
	const { doc } = editor;
	const [page, setPage] = useState('home');
	if (!doc) return null;

	const data = docToPortfolioData(doc);
	const currentKey = doc.content.pages[page] ? page : 'home';
	const navigate = (path: string) => {
		const key = path === '' ? 'home' : path;
		setPage(key);
		// Bring that page's editing section into view alongside the preview.
		document
			.querySelector(`.editor-controls [data-section="${CSS.escape(key)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<div className="preview">
			<div className="preview-surface">
				<Portfolio
					page={currentKey}
					content={data.content}
					galleries={data.galleries}
					profileImageSrc={data.profileImageSrc}
					pageThumbs={data.pageThumbs}
					fontFaces={data.fontFaces}
					base={base}
					onNavigate={navigate}
					onImageLayout={(folder, id, layout) => editor.updateGalleryMeta(folder, id, { layout })}
				/>
			</div>
		</div>
	);
}
