import PortfolioFrame from './PortfolioFrame';
import PortfolioPage from './PortfolioPage';
import CreativeEffects from './CreativeEffects';
import { useEffect, useRef, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { themeToVars, fontFacesCss, backgroundBlockVars } from './theme';
import type { ImageLayout, PortfolioData, TextFlowLayout, TextLayout } from './types';
import type { CanvasLayoutUpdates, CanvasSelection } from './types';
import { withBase } from './types';
import type { SectionBreakpoint } from './SectionResizeHandle';
import { transitionInDocument } from './pageTransitions';
import Analytics from './Analytics';

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
	/** Editor preview: resizes or positions an embed that remains in normal flow. */
	onEmbedFlowLayout?: (page: string, blockId: string, layout: TextFlowLayout) => void;
	onCanvasLayouts?: (page: string, folder: string, updates: CanvasLayoutUpdates) => void;
	onDeleteCanvasItems?: (
		page: string,
		folder: string,
		selection: CanvasSelection,
	) => void;
	onCarouselFrame?: (page: string, blockId: string, layout: ImageLayout) => void;
	/** Editor preview: reports a complete sub-page/product block moved on a canvas. */
	onWidgetLayout?: (page: string, blockId: string, layout: ImageLayout) => void;
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
	/** Published static runtime only: record privacy-light page totals. */
	analytics?: boolean;
}

/**
 * Full portfolio for one page: theme + frame + page body. Used by the editor
 * preview (the Astro site composes the same pieces itself, per page, so it can
 * hydrate the gallery island). Every visible component is shared with the site.
 */
export default function Portfolio({ page, content, galleries, profileImageSrc, logoImageSrc, pageThumbs, productImageSrcs, fontFaces, resumeHref, base, onNavigate, onImageLayout, onTextLayout, onEmbedLayout, onEmbedFlowLayout, onCanvasLayouts, onDeleteCanvasItems, onCarouselFrame, onWidgetLayout, onCarouselHost, onCarouselFocus, resizeBreakpoint, onSectionHeight, onFooterHeight, editorPreview = false, analytics = false }: PortfolioProps) {
	const current = page === 'home' ? '' : page;
	const headerMode =
		content.site.headerMode ??
		(logoImageSrc ? 'image' : content.site.logo ? 'text' : 'name');
	const headerText = headerMode === 'text' ? (content.site.logo || content.site.name) : content.site.name;
	const pageBackground = content.pages[page]?.background;
	const pageHanging = content.pages[page]?.hanging;
	const automaticContrast = content.theme.automaticTextContrast !== false;
	const rootStyle = {
		...themeToVars(content.theme),
		...backgroundBlockVars(pageBackground, automaticContrast),
		'--hang-strength': String(content.site.creative?.hangStrength ?? 0.7),
	} as CSSProperties;
	const creativeClasses = [
		(pageHanging ?? content.site.creative?.looseHang) && 'creative-loose-hang',
		content.theme.backgroundTexture && `texture-${content.theme.backgroundTexture}`,
		content.site.creative?.slowReveal && 'creative-slow-reveal',
		content.site.creative?.artworkWobble && 'creative-artwork-wobble',
		content.site.creative?.colorSpin && 'creative-color-spin',
		content.site.creative?.pageTransition && `page-transition-${content.site.creative.pageTransition}`,
		content.site.creative?.phone?.looseHang === false && 'creative-phone-off-loose-hang',
		content.site.creative?.phone?.slowReveal === false && 'creative-phone-off-slow-reveal',
		content.site.creative?.phone?.artworkWobble === false && 'creative-phone-off-artwork-wobble',
		content.site.creative?.phone?.colorSpin === false && 'creative-phone-off-color-spin',
	]
		.filter(Boolean)
		.join(' ');
	const transition = content.site.creative?.pageTransition;
	const cursorImage = content.site.creative?.cursorImage;
	const cursorImageSrc = cursorImage
		? /^(?:blob:|data:|https?:|\/)/i.test(cursorImage)
			? cursorImage
			: withBase(base, `assets/${cursorImage}`)
		: undefined;
	const transitionOnPhone = content.site.creative?.phone?.pageTransition !== false;
	const portfolioRootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!transition) return;
		const root = portfolioRootRef.current?.ownerDocument.documentElement;
		if (!root) return;
		const previous = root.dataset.pageTransition;
		const previousPhone = root.dataset.pageTransitionPhone;
		root.dataset.pageTransition = transition;
		if (!transitionOnPhone) root.dataset.pageTransitionPhone = 'off';
		else delete root.dataset.pageTransitionPhone;
		return () => {
			if (previous) root.dataset.pageTransition = previous;
			else delete root.dataset.pageTransition;
			if (previousPhone) root.dataset.pageTransitionPhone = previousPhone;
			else delete root.dataset.pageTransitionPhone;
		};
	}, [transition, transitionOnPhone]);
	const navigate = onNavigate
		? (path: string) => {
				if (!transition) {
					onNavigate(path);
					return;
				}
				const owner = portfolioRootRef.current?.ownerDocument ?? document;
				transitionInDocument(
					owner,
					() => flushSync(() => onNavigate(path)),
					{ phone: transitionOnPhone },
				);
			}
		: undefined;
	return (
		<div ref={portfolioRootRef} className={`portfolio-root${creativeClasses ? ` ${creativeClasses}` : ''}`} style={rootStyle}>
			{analytics && <Analytics page={page} />}
			{!!fontFaces?.length && <style>{fontFacesCss(fontFaces)}</style>}
			<CreativeEffects creative={content.site.creative} cursorImageSrc={cursorImageSrc} />
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
				onNavigate={navigate}
			>
				<PortfolioPage
					key={page}
					page={page}
					content={content}
					galleries={galleries}
					profileImageSrc={profileImageSrc}
					pageThumbs={pageThumbs}
					productImageSrcs={productImageSrcs}
					resumeHref={resumeHref}
					base={base}
					onNavigate={navigate}
					onImageLayout={onImageLayout}
					onTextLayout={onTextLayout}
					onEmbedLayout={onEmbedLayout}
					onEmbedFlowLayout={onEmbedFlowLayout}
					onCanvasLayouts={onCanvasLayouts}
					onDeleteCanvasItems={onDeleteCanvasItems}
					onCarouselFrame={onCarouselFrame}
					onWidgetLayout={onWidgetLayout}
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
