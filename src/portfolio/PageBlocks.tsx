import type { PageBlock, TextAlign } from '../lib/content';
import type { CSSProperties, MouseEventHandler } from 'react';
import { safeHref } from './safeHref';
import './PageBlocks.css';

export function PortfolioButton({
	label,
	url,
	align = 'left',
	appearance = 'solid',
	fillColor,
	textColor,
	shape,
	pinned = false,
	onClick,
}: {
	label: string;
	url: string;
	align?: TextAlign;
	appearance?: 'solid' | 'outline';
	fillColor?: string;
	textColor?: string;
	shape?: 'square' | 'rounded' | 'pill';
	/** Canvas-pinned buttons drop the flow wrapper's margins and page gutter. */
	pinned?: boolean;
	onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
	const href = safeHref(url);
	if (!label.trim() || !href) return null;

	// Every optional field is additive: with none of them set the markup is
	// byte-for-byte what it has always been (no extra class, no style attribute).
	const className = `portfolio-button appearance-${appearance}${shape ? ` shape-${shape}` : ''}`;
	const style: CSSProperties | undefined =
		fillColor || textColor
			? {
					...(fillColor ? { '--button-fill': fillColor, '--button-edge': fillColor } : {}),
					...(textColor ? { '--button-ink': textColor } : {}),
				} as CSSProperties
			: undefined;
	return (
		<div className={`portfolio-action align-${align}${pinned ? ' pinned' : ''}`}>
			<a className={className} style={style} href={href} onClick={onClick}>
				{label}
			</a>
		</div>
	);
}

/** A visible pause between groups of work, announced by assistive technology. */
export function PortfolioDivider({
	style = 'line',
	width = 'medium',
	color,
}: Pick<Extract<PageBlock, { type: 'divider' }>, 'style' | 'width' | 'color'>) {
	return (
		<div
			className={`portfolio-divider style-${style} width-${width}`}
			style={color ? ({ '--divider-color': color } as CSSProperties) : undefined}
			role="separator"
		>
			<hr aria-hidden="true" />
			{style === 'ornament' && <span aria-hidden="true">✦</span>}
		</div>
	);
}
