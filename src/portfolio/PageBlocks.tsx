import type { PageBlock, TextAlign } from '../lib/content';
import type { CSSProperties, MouseEventHandler } from 'react';
import { safeHref } from './safeHref';
import './PageBlocks.css';

export function PortfolioButton({
	label,
	url,
	align = 'left',
	appearance = 'solid',
	onClick,
}: {
	label: string;
	url: string;
	align?: TextAlign;
	appearance?: 'solid' | 'outline';
	onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
	const href = safeHref(url);
	if (!label.trim() || !href) return null;

	return (
		<div className={`portfolio-action align-${align}`}>
			<a className={`portfolio-button appearance-${appearance}`} href={href} onClick={onClick}>
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
