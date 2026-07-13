import { useState } from 'react';
import { useEditor } from '../store';
import Portfolio from '../../portfolio/Portfolio';
import { docToPortfolioData } from '../lib/content-init';

const PAGES = [
	{ key: 'home', label: 'Home' },
	{ key: 'art', label: 'Art' },
	{ key: 'photography', label: 'Photography' },
	{ key: 'bio', label: 'About' },
];

/** Live preview — renders the SAME shared portfolio components as the real site. */
export default function PreviewPanel({ base }: { base: string }) {
	const { doc } = useEditor();
	const [page, setPage] = useState('home');
	if (!doc) return null;

	const data = docToPortfolioData(doc);
	const navigate = (path: string) => setPage(path === '' ? 'home' : path);

	return (
		<div className="preview">
			<div className="preview-tabs">
				{PAGES.map((p) => (
					<button
						key={p.key}
						type="button"
						className={`preview-tab ${page === p.key ? 'active' : ''}`}
						onClick={() => setPage(p.key)}
					>
						{p.label}
					</button>
				))}
			</div>
			<div className="preview-surface">
				<Portfolio
					page={page}
					content={data.content}
					galleries={data.galleries}
					profileImageSrc={data.profileImageSrc}
					base={base}
					onNavigate={navigate}
				/>
			</div>
		</div>
	);
}
