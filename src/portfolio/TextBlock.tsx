import { Fragment, type ReactNode } from 'react';
import type {
	RichTextParagraph,
	RichTextRun,
	TextAlign,
	TextFlowLayout,
	TextStyle,
} from '../lib/content';
import { richTextPlainText } from '../lib/richText';
import { clampTextFlowLayout } from './canvasLayout';
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
	richText?: RichTextParagraph[];
	fontFamily?: string;
	style?: TextStyle;
	link?: string;
	className?: string;
}

function RichRun({ run }: { run: RichTextRun }) {
	let content: ReactNode = run.text;
	if (run.bold) content = <strong>{content}</strong>;
	if (run.italic) content = <em>{content}</em>;
	if (run.underline) content = <u>{content}</u>;
	if (run.strike) content = <s>{content}</s>;
	return <span className={`rich-text-run text-size-${run.size ?? 'body'}`}>{content}</span>;
}

function RichParagraph({
	paragraph,
	link,
}: {
	paragraph: RichTextParagraph;
	link?: string;
}) {
	const runs = paragraph.runs.map((run, index) => <RichRun key={index} run={run} />);
	const content = link ? <a href={link}>{runs}</a> : runs;
	return (
		<p className={`rich-text-paragraph align-${paragraph.align ?? 'left'}`}>
			{runs.length === 0 ? <br /> : content}
		</p>
	);
}

/**
 * The semantic text element shared by flow blocks and text placed on a canvas.
 * A link is applied to the words, rather than the whole layout box, so keyboard
 * focus stays clear and predictable.
 */
export function TextContent({
	text,
	richText,
	fontFamily,
	style = 'body',
	link,
	className,
}: TextContentProps) {
	const href = safeHref(link);
	if (richText) {
		const classes = ['text-block-content', 'rich-text-content', className].filter(Boolean).join(' ');
		return (
			<div className={classes} style={fontFamily ? { fontFamily } : undefined}>
				{richText.map((paragraph, index) => (
					<RichParagraph key={index} paragraph={paragraph} link={href} />
				))}
			</div>
		);
	}
	const content = href ? (
		<a href={href}>
			<TextLines text={text} />
		</a>
	) : (
		<TextLines text={text} />
	);
	const classes = ['text-block-content', `text-style-${style}`, className].filter(Boolean).join(' ');
	const textStyle = fontFamily ? { fontFamily } : undefined;

	switch (style) {
		case 'heading':
			return <h2 className={classes} style={textStyle}>{content}</h2>;
		case 'subheading':
			return <h3 className={classes} style={textStyle}>{content}</h3>;
		case 'quote':
			return <blockquote className={classes} style={textStyle}>{content}</blockquote>;
		default:
			return <p className={classes} style={textStyle}>{content}</p>;
	}
}

/** A free-text page block. */
export default function TextBlock({
	text,
	richText,
	fontFamily,
	align,
	style = 'body',
	link,
	flowLayout,
}: {
	text: string;
	richText?: RichTextParagraph[];
	fontFamily?: string;
	align?: TextAlign;
	style?: TextStyle;
	link?: string;
	flowLayout?: TextFlowLayout;
}) {
	if (!(richText ? richTextPlainText(richText) : text).trim()) return null;
	const safeFlowLayout = flowLayout ? clampTextFlowLayout(flowLayout) : undefined;
	const flowStyle = safeFlowLayout
		? ({
				'--text-flow-x': String(safeFlowLayout.x),
				'--text-flow-w': String(safeFlowLayout.w),
			} as React.CSSProperties)
		: undefined;
	return (
		<div
			className={`text-block align-${richText ? 'left' : align ?? 'left'} style-${style}`}
			style={flowStyle}
		>
			<TextContent
				text={text}
				richText={richText}
				fontFamily={fontFamily}
				style={style}
				link={link}
			/>
		</div>
	);
}
