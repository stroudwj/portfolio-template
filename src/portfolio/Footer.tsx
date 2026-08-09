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
import type { FooterColumn, ImageLayout } from '../lib/content';
import { withBase } from './types';

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
	name,
	nameSize,
	columns,
	base = '',
	onNavigate,
}: {
	text: string;
	imageSrc?: string;
	imageLayout?: ImageLayout;
	onImageLayout?: (layout: ImageLayout) => void;
	heights?: ResponsiveSectionHeight;
	resizeBreakpoint?: SectionBreakpoint;
	onHeightChange?: (breakpoint: SectionBreakpoint, height: number | undefined) => void;
	/** Display-scale closing name above the columns. */
	name?: string;
	/** name size in pt. Absent = 72. */
	nameSize?: number;
	/** Up to three headed link columns; extras beyond three are not rendered. */
	columns?: FooterColumn[];
	/** Site base path, for resolving internal column links. */
	base?: string;
	/** Editor preview: switch pages in place for internal column links. */
	onNavigate?: (path: string) => void;
}) {
	const shownColumns = (columns ?? [])
		.map((column) => ({ ...column, links: column.links.filter((link) => link.label.trim()) }))
		.filter((column) => column.heading?.trim() || column.links.length)
		.slice(0, 3);
	const trimmedName = name?.trim() ?? '';
	if (!text.trim() && !imageSrc && !trimmedName && !shownColumns.length) return null;
	const external = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
	return (
		<footer className="site-footer" style={responsiveHeightVars(heights)}>
			{trimmedName && (
				<p
					className="site-footer-name"
					style={{ '--footer-name-size': `${Math.min(Math.max(nameSize ?? 72, 8), 300)}pt` } as React.CSSProperties}
				>
					{trimmedName}
				</p>
			)}
			{imageSrc && imageLayout ? (
				<Gallery
					images={[{ id: '__footer-image__', src: imageSrc, alt: 'Footer image', layout: imageLayout }]}
					alt="Footer image"
					editable={!!onImageLayout}
					onLayoutChange={onImageLayout ? (_id, layout) => onImageLayout(layout) : undefined}
				/>
			) : imageSrc ? <img className="site-footer-image" src={imageSrc} alt="" /> : null}
			{shownColumns.length > 0 && (
				<div className="site-footer-columns">
					{shownColumns.map((column, columnIndex) => (
						<div className="site-footer-column" key={columnIndex}>
							{column.heading?.trim() && <h2 className="site-footer-column-heading">{column.heading}</h2>}
							{column.links.map((link, linkIndex) => (
								<a
									key={linkIndex}
									href={external(link.url) ? link.url : withBase(base, link.url)}
									{...(external(link.url) ? { target: '_blank', rel: 'noopener' } : {})}
									onClick={
										!external(link.url) && onNavigate
											? (event) => {
													event.preventDefault();
													onNavigate(link.url);
												}
											: undefined
									}
								>
									{link.label}
								</a>
							))}
						</div>
					))}
				</div>
			)}
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
