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
	onCarouselFrame?: (page: string, blockId: string, layout: ImageLayout) => void;
	onCarouselHost?: (
		page: string,
		blockId: string,
		hostId: string | undefined,
		layout?: ImageLayout,
	) => void;
	onCarouselFocus?: (folder: string, imageId: string, focusX: number, focusY: number) => void;
	resizeBreakpoint?: SectionBreakpoint;
	onSectionHeight?: (
		page: string,
		partKey: string,
		breakpoint: SectionBreakpoint,
		height: number | undefined,
	) => void;
	onFooterHeight?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
	/** Show editor-only guidance for empty portfolio content. */
	editorPreview?: boolean;
}

/**
 * Full portfolio for one page: theme + frame + page body. Used by the editor
 * preview (the Astro site composes the same pieces itself, per page, so it can
 * hydrate the gallery island). Every visible component is shared with the site.
 */
export default function Portfolio({ page, content, galleries, profileImageSrc, logoImageSrc, pageThumbs, productImageSrcs, fontFaces, resumeHref, base, onNavigate, onImageLayout, onTextLayout, onEmbedLayout, onCanvasLayouts, onCarouselFrame, onCarouselHost, onCarouselFocus, resizeBreakpoint, onSectionHeight, onFooterHeight, editorPreview = false }: PortfolioProps) {
	const current = page === 'home' ? '' : page;
	const headerMode =
		content.site.headerMode ??
		(logoImageSrc ? 'image' : content.site.logo ? 'text' : 'name');
	const headerText = headerMode === 'text' ? (content.site.logo || content.site.name) : content.site.name;
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
				logo={headerText}
				logoImageSrc={headerMode === 'image' ? logoImageSrc : undefined}
				base={base}
				current={current}
				navStyle={content.theme.navStyle}
				fullscreenMobile={content.theme.fullscreenMobileMenu}
				automaticContrast={automaticContrast}
				fallbackBackground={pageBackground || content.theme.backgroundColor}
				stabilized={content.theme.stabilizeNavigation !== false}
				logoPosition={content.theme.logoPosition}
				logoX={content.theme.logoX}
				logoY={content.theme.logoY}
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
					onCarouselFrame={onCarouselFrame}
					onCarouselHost={onCarouselHost}
					onCarouselFocus={onCarouselFocus}
					resizeBreakpoint={resizeBreakpoint}
					onSectionHeight={onSectionHeight}
					onFooterHeight={onFooterHeight}
					editorPreview={editorPreview}
				/>
			</PortfolioFrame>
		</div>
	);
}
