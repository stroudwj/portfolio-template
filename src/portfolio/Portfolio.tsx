import PortfolioFrame from './PortfolioFrame';
import PortfolioPage from './PortfolioPage';
import { type InlineTextEditing } from './InlineTextEditor';
import CreativeEffects from './CreativeEffects';
import { useEffect, useRef, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { themeToVars, fontFacesCss, backgroundBlockVars } from './theme';
import { resolveSiteMotion, siteMotionRootClass } from './siteMotion';
import './SiteMotion.css';
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
	onProfileImageLayout?: (layout: ImageLayout) => void;
	onProfileContentLayout?: (layout: ImageLayout) => void;
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
	onChildItemLayout?: (page: string, blockId: string, itemId: string, layout: ImageLayout) => void;
	onChildCardLabel?: (page: string, blockId: string, itemId: string, label: string) => void;
	onCarouselHost?: (
		page: string,
		blockId: string,
		hostId: string | undefined,
		layout?: ImageLayout,
	) => void;
	onCarouselFocus?: (folder: string, imageId: string, focusX: number, focusY: number) => void;
	onCarouselZoom?: (folder: string, imageId: string, zoom: number) => void;
	resizeBreakpoint?: SectionBreakpoint;
	onSectionHeight?: (
		page: string,
		partKey: string,
		breakpoint: SectionBreakpoint,
		height: number | undefined,
		viewportHeight?: number,
		gap?: number,
		recordHistory?: boolean,
	) => void;
	onFooterHeight?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
	onFooterImageLayout?: (layout: ImageLayout) => void;
	onPageHeadingPosition?: (x: number, y: number) => void;
	/** Show editor-only guidance for empty portfolio content. */
	editorPreview?: boolean;
	/** Published static runtime only: record privacy-light page totals. */
	analytics?: boolean;
	onSelectBlock?: (pageKey: string, blockId: string) => void;
	/** Editor preview: the text block currently being edited in place. */
	inlineTextEditing?: InlineTextEditing;
}

/**
 * Full portfolio for one page: theme + frame + page body. Used by the editor
 * preview (the Astro site composes the same pieces itself, per page, so it can
 * hydrate the gallery island). Every visible component is shared with the site.
 */
export default function Portfolio({ page, content, galleries, profileImageSrc, logoImageSrc, pageThumbs, productImageSrcs, fontFaces, resumeHref, base, onNavigate, onImageLayout, onProfileImageLayout, onProfileContentLayout, onTextLayout, onEmbedLayout, onEmbedFlowLayout, onCanvasLayouts, onDeleteCanvasItems, onCarouselFrame, onWidgetLayout, onChildItemLayout, onChildCardLabel, onCarouselHost, onCarouselFocus, onCarouselZoom, resizeBreakpoint, onSectionHeight, onFooterHeight, onFooterImageLayout, onPageHeadingPosition, editorPreview = false, analytics = false, onSelectBlock, inlineTextEditing }: PortfolioProps) {
	const current = page === 'home' ? '' : page;
	// `text` is retained in the schema for older sites, but the editor now has one
	// canonical header text value: the site name.
	const headerMode =
		(content.site.headerMode ?? (logoImageSrc ? 'image' : 'name')) === 'image'
			? 'image'
			: 'name';
	const headerText = content.site.name;
	const pageBackground = content.pages[page]?.background;
	const pageHanging = content.pages[page]?.hanging;
	const pageHangingStrength = content.pages[page]?.hangingStrength;
	const automaticContrast = content.theme.automaticTextContrast !== false;
	const rootStyle = {
		...themeToVars(content.theme),
		...backgroundBlockVars(pageBackground, automaticContrast),
		'--hang-strength': String(pageHangingStrength ?? content.site.creative?.hangStrength ?? 0.75),
	} as CSSProperties;
	const creativeClasses = [
		siteMotionRootClass(resolveSiteMotion(content.theme.motion)),
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
				logoStabilized={content.theme.stabilizeLogo !== false}
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
					onProfileImageLayout={onProfileImageLayout}
					onProfileContentLayout={onProfileContentLayout}
					onTextLayout={onTextLayout}
					onEmbedLayout={onEmbedLayout}
					onEmbedFlowLayout={onEmbedFlowLayout}
					onCanvasLayouts={onCanvasLayouts}
					onDeleteCanvasItems={onDeleteCanvasItems}
					onCarouselFrame={onCarouselFrame}
					onWidgetLayout={onWidgetLayout}
					onChildItemLayout={onChildItemLayout}
					onChildCardLabel={onChildCardLabel}
					onCarouselHost={onCarouselHost}
					onCarouselFocus={onCarouselFocus}
					onCarouselZoom={onCarouselZoom}
					resizeBreakpoint={resizeBreakpoint}
					onSectionHeight={onSectionHeight}
					onFooterHeight={onFooterHeight}
					onFooterImageLayout={onFooterImageLayout}
					onPageHeadingPosition={onPageHeadingPosition}
					editorPreview={editorPreview}
					onSelectBlock={onSelectBlock}
					inlineTextEditing={inlineTextEditing}
				/>
			</PortfolioFrame>
		</div>
	);
}
