// The optional site footer — a small centered line (or a few) at the very
// bottom of every page, typically a copyright notice or credits. Lives in
// content.site.footer; absent or empty means no footer at all.
import { Fragment } from 'react';
import type { ResponsiveSectionHeight } from './types';
import SectionResizeHandle, {
	responsiveHeightVars,
	type SectionBreakpoint,
} from './SectionResizeHandle';
import './Footer.css';
import Gallery from './Gallery';
import type { ImageLayout } from '../lib/content';

/** Keep the default credit useful as a link while leaving every other footer fully freeform. */
function FooterLine({ text }: { text: string }) {
	const parts = text.split(/(hangwork\.art)/gi);
	return (
		<>
			{parts.map((part, index) =>
				!part ? null : part.toLowerCase() === 'hangwork.art' ? (
					<a key={index} href="https://hangwork.art" target="_blank" rel="noopener">{part}</a>
				) : (
					<span key={index}>{part}</span>
				),
			)}
		</>
	);
}

export default function Footer({
	text,
	heights,
	resizeBreakpoint,
	onHeightChange,
	imageSrc,
	imageLayout,
	onImageLayout,
}: {
	text: string;
	imageSrc?: string;
	imageLayout?: ImageLayout;
	onImageLayout?: (layout: ImageLayout) => void;
	heights?: ResponsiveSectionHeight;
	resizeBreakpoint?: SectionBreakpoint;
	onHeightChange?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
}) {
	if (!text.trim() && !imageSrc) return null;
	return (
		<footer className="site-footer" style={responsiveHeightVars(heights)}>
			{imageSrc && imageLayout ? (
				<Gallery
					images={[{ id: '__footer-image__', src: imageSrc, alt: 'Footer image', layout: imageLayout }]}
					alt="Footer image"
					editable={!!onImageLayout}
					onLayoutChange={onImageLayout ? (_id, layout) => onImageLayout(layout) : undefined}
				/>
			) : imageSrc ? <img className="site-footer-image" src={imageSrc} alt="" /> : null}
			{text.trim() && <p>
				{text.split('\n').map((line, index) => (
					<Fragment key={index}>
						{index > 0 && <br />}
						<FooterLine text={line} />
					</Fragment>
				))}
			</p>}
			{resizeBreakpoint && onHeightChange && (
				<SectionResizeHandle
					breakpoint={resizeBreakpoint}
					value={heights?.[resizeBreakpoint]}
					label="footer"
					onChange={(height) => onHeightChange(resizeBreakpoint, height)}
				/>
			)}
		</footer>
	);
}
