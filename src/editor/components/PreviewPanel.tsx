import { useState } from 'react';
import { useEditor } from '../store';
import Portfolio from '../../portfolio/Portfolio';
import { docToPortfolioData } from '../lib/content-init';

/** Live preview — renders the SAME shared portfolio components as the real site. */
export default function PreviewPanel({ base }: { base: string }) {
	const { doc } = useEditor();
	const [page, setPage] = useState('home');
	if (!doc) return null;

	const data = docToPortfolioData(doc);
	// Tabs mirror the sidebar nav; sub-pages are reached by clicking their card in the
	// preview, exactly like on the live site.
	const tabs = doc.content.nav.map((item) => ({ key: item.path || 'home', label: item.label }));
	const currentKey = doc.content.pages[page] ? page : 'home';
	const navigate = (path: string) => setPage(path === '' ? 'home' : path);

	return (
		<div className="preview">
			<div className="preview-tabs">
				{tabs.map((p) => (
					<button
						key={p.key}
						type="button"
						className={`preview-tab ${currentKey === p.key ? 'active' : ''}`}
						onClick={() => setPage(p.key)}
					>
						{p.label}
					</button>
				))}
			</div>
			<div className="preview-surface">
				<Portfolio
					page={currentKey}
					content={data.content}
					galleries={data.galleries}
					profileImageSrc={data.profileImageSrc}
					pageThumbs={data.pageThumbs}
					base={base}
					onNavigate={navigate}
				/>
			</div>
		</div>
	);
}
