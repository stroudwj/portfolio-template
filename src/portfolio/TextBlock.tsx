import { Fragment } from 'react';
import type { TextAlign, TextStyle } from '../lib/content';
import { safeHref } from './safeHref';
import './TextBlock.css';

/** Free text as React nodes: "\n" is a line break, "\n\n" a blank line (like the bio). */
export function TextLines({ text }: { text: string }) {
	const lines = text.split('\n');
	return (
		<>
			{lines.flatMap((line, i) =>
				i === 0
					? [<Fragment key={`l${i}`}>{line}</Fragment>]
					: [<br key={`b${i}`} />, <Fragment key={`l${i}`}>{line}</Fragment>],
			)}
		</>
	);
}

interface TextContentProps {
	text: string;
	style?: TextStyle;
	link?: string;
	className?: string;
}

/**
 * The semantic text element shared by flow blocks and text placed on a canvas.
 * A link is applied to the words, rather than the whole layout box, so keyboard
 * focus stays clear and predictable.
 */
export function TextContent({ text, style = 'body', link, className }: TextContentProps) {
	const href = safeHref(link);
	const content = href ? (
		<a href={href}>
			<TextLines text={text} />
		</a>
	) : (
		<TextLines text={text} />
	);
	const classes = ['text-block-content', `text-style-${style}`, className].filter(Boolean).join(' ');

	switch (style) {
		case 'heading':
			return <h2 className={classes}>{content}</h2>;
		case 'subheading':
			return <h3 className={classes}>{content}</h3>;
		case 'quote':
			return <blockquote className={classes}>{content}</blockquote>;
		default:
			return <p className={classes}>{content}</p>;
	}
}

/** A free-text page block. */
export default function TextBlock({
	text,
	align,
	style = 'body',
	link,
}: {
	text: string;
	align?: TextAlign;
	style?: TextStyle;
	link?: string;
}) {
	if (!text.trim()) return null;
	return (
		<div className={`text-block align-${align ?? 'left'} style-${style}`}>
			<TextContent text={text} style={style} link={link} />
		</div>
	);
}
