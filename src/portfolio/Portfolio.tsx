import PortfolioFrame from './PortfolioFrame';
import PortfolioPage from './PortfolioPage';
import { themeToVars } from './theme';
import type { PortfolioData } from './types';

export interface PortfolioProps extends PortfolioData {
	page: string;
	base: string;
	onNavigate?: (path: string) => void;
}

/**
 * Full portfolio for one page: theme + frame + page body. Used by the editor
 * preview (the Astro site composes the same pieces itself, per page, so it can
 * hydrate the gallery island). Every visible component is shared with the site.
 */
export default function Portfolio({ page, content, galleries, profileImageSrc, pageThumbs, base, onNavigate }: PortfolioProps) {
	const current = page === 'home' ? '' : page;
	return (
		<div className="portfolio-root" style={themeToVars(content.theme)}>
			<PortfolioFrame
				nav={content.nav}
				logo={content.site.logo || content.site.name}
				base={base}
				current={current}
				onNavigate={onNavigate}
			>
				<PortfolioPage
					page={page}
					content={content}
					galleries={galleries}
					profileImageSrc={profileImageSrc}
					pageThumbs={pageThumbs}
					base={base}
					onNavigate={onNavigate}
				/>
			</PortfolioFrame>
		</div>
	);
}
