import PortfolioFrame from './PortfolioFrame';
import PortfolioPage from './PortfolioPage';
import CreativeEffects from './CreativeEffects';
import type { CSSProperties } from 'react';
import { themeToVars, fontFacesCss, backgroundBlockVars } from './theme';
import type { ImageLayout, PortfolioData, TextLayout } from './types';
import type { CanvasLayoutUpdates } from './types';
import type { SectionBreakpoint } from './SectionResizeHandle';

export interface PortfolioProps extends PortfolioData {
	page: string;
	base: string;
	onNavigate?: (path: string) => void;
	/** Editor preview: makes gallery images movable/resizable and reports changes. */
	onImageLayout?: (folder: string, imageId: string, layout: ImageLayout) => void;
	/** Editor preview: reports a text block placed/moved on the page canvas. */
	onTextLayout?: (page: string, blockId: string, layout: TextLayout) => void;
	/** Editor preview: reports a video embed placed/moved on the page canvas. */
	onEmbedLayout?: (page: string, blockId: string, layout: ImageLayout) => void;
	onCanvasLayouts?: (page: string, folder: string, updates: CanvasLayoutUpdates) => void;
	resizeBreakpoint?: SectionBreakpoint;
	onSectionHeight?: (
		page: string,
		partKey: string,
		breakpoint: SectionBreakpoint,
		height: number | undefined,
	) => void;
	onFooterHeight?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
}

/**
 * Full portfolio for one page: theme + frame + page body. Used by the editor
 * preview (the Astro site composes the same pieces itself, per page, so it can
 * hydrate the gallery island). Every visible component is shared with the site.
 */
export default function Portfolio({ page, content, galleries, profileImageSrc, logoImageSrc, pageThumbs, productImageSrcs, fontFaces, resumeHref, base, onNavigate, onImageLayout, onTextLayout, onEmbedLayout, onCanvasLayouts, resizeBreakpoint, onSectionHeight, onFooterHeight }: PortfolioProps) {
	const current = page === 'home' ? '' : page;
	const pageBackground = content.pages[page]?.background;
	const automaticContrast = content.theme.automaticTextContrast !== false;
	const rootStyle: CSSProperties = {
		...themeToVars(content.theme),
		...backgroundBlockVars(pageBackground, automaticContrast),
	};
	const creativeClasses = [
		content.site.creative?.looseHang && 'creative-loose-hang',
		content.site.creative?.slowReveal && 'creative-slow-reveal',
		content.site.creative?.artworkWobble && 'creative-artwork-wobble',
		content.site.creative?.colorSpin && 'creative-color-spin',
	]
		.filter(Boolean)
		.join(' ');
	return (
		<div className={`portfolio-root${creativeClasses ? ` ${creativeClasses}` : ''}`} style={rootStyle}>
			{!!fontFaces?.length && <style>{fontFacesCss(fontFaces)}</style>}
			<CreativeEffects creative={content.site.creative} />
			<PortfolioFrame
				nav={content.nav}
				logo={content.site.logo || content.site.name}
				logoImageSrc={logoImageSrc}
				base={base}
				current={current}
				navStyle={content.theme.navStyle}
				fullscreenMobile={content.theme.fullscreenMobileMenu}
				automaticContrast={automaticContrast}
				fallbackBackground={pageBackground || content.theme.backgroundColor}
				stabilized={content.theme.stabilizeNavigation !== false}
				onNavigate={onNavigate}
			>
				<PortfolioPage
					page={page}
					content={content}
					galleries={galleries}
					profileImageSrc={profileImageSrc}
					pageThumbs={pageThumbs}
					productImageSrcs={productImageSrcs}
					resumeHref={resumeHref}
					base={base}
					onNavigate={onNavigate}
					onImageLayout={onImageLayout}
					onTextLayout={onTextLayout}
					onEmbedLayout={onEmbedLayout}
					onCanvasLayouts={onCanvasLayouts}
					resizeBreakpoint={resizeBreakpoint}
					onSectionHeight={onSectionHeight}
					onFooterHeight={onFooterHeight}
				/>
			</PortfolioFrame>
		</div>
	);
}
