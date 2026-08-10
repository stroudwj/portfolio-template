import { Fragment, type ReactNode } from 'react';
import type {
	KineticTextConfig,
	RichTextParagraph,
	RichTextRun,
	TextAlign,
	TextFlowLayout,
	TextStyle,
} from '../lib/content';
import { richTextPlainText } from '../lib/richText';
import { backgroundBlockVars } from './theme';
import { clampTextFlowLayout } from './canvasLayout';
import { safeHref } from './safeHref';
import InlineTextEditor, { type InlineTextEditing } from './InlineTextEditor';
import {
	KineticInline,
	KineticMarquee,
	kineticClass,
	kineticStyle,
} from './KineticText';
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
	/** Optional card color behind the words (auto-contrast text applies). */
	background?: string;
	/** The theme's automaticTextContrast setting (default true). */
	backgroundAutoContrast?: boolean;
	link?: string;
	className?: string;
	kinetic?: KineticTextConfig;
	kineticTarget?: string;
}

function RichRun({ run, kinetic }: { run: RichTextRun; kinetic?: KineticTextConfig }) {
	let content: ReactNode = (
		<KineticInline
			text={run.text}
			config={kinetic?.effect === 'lines' ? undefined : kinetic}
		/>
	);
	if (run.bold) content = <strong>{content}</strong>;
	if (run.italic) content = <em>{content}</em>;
	if (run.underline) content = <u>{content}</u>;
	if (run.strike) content = <s>{content}</s>;
	const href = safeHref(run.link);
	if (href) content = <a href={href}>{content}</a>;
	return (
		<span
			className={`rich-text-run text-size-${run.size ?? 'body'}`}
			style={run.fontSize ? { fontSize: `${run.fontSize}pt` } : undefined}
		>
			{content}
		</span>
	);
}

function RichParagraph({
	paragraph,
	link,
	kinetic,
	index,
}: {
	paragraph: RichTextParagraph;
	link?: string;
	kinetic?: KineticTextConfig;
	index: number;
}) {
	const runs = paragraph.runs.map((run, runIndex) => (
		<RichRun key={runIndex} run={run} kinetic={kinetic} />
	));
	const hasInlineLink = paragraph.runs.some((run) => !!safeHref(run.link));
	let content: ReactNode = link && !hasInlineLink ? <a href={link}>{runs}</a> : runs;
	if (kinetic?.effect === 'lines') {
		content = (
			<span
				className="kinetic-unit"
				style={{ '--kinetic-index': index } as React.CSSProperties}
			>
				{content}
			</span>
		);
	}
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
	background,
	backgroundAutoContrast = true,
	link,
	className,
	kinetic,
	kineticTarget,
}: TextContentProps) {
	const href = safeHref(link);
	const motionClass = kineticClass(kinetic);
	// The card color rides the same --color-bg/--color-text vars color blocking
	// uses, so the words stay legible on any chosen background.
	const backgroundClass = background ? 'has-text-background' : undefined;
	const motionStyle = {
		...kineticStyle(kinetic),
		...(background ? backgroundBlockVars(background, backgroundAutoContrast) : {}),
	};
	if (richText) {
		const classes = ['text-block-content', 'rich-text-content', motionClass, backgroundClass, className].filter(Boolean).join(' ');
		if (kinetic?.effect === 'marquee') {
			const plainText = richTextPlainText(richText);
			const formattedText = richText.map((paragraph, paragraphIndex) => (
				<Fragment key={paragraphIndex}>
					{paragraphIndex > 0 && ' '}
					{paragraph.runs.map((run, runIndex) => (
						<RichRun key={runIndex} run={run} />
					))}
				</Fragment>
			));
			return (
				<div
					className={classes}
					style={{ ...(fontFamily ? { fontFamily } : {}), ...motionStyle }}
					data-kinetic-target={kineticTarget}
				>
					<KineticMarquee duplicateText={plainText}>{formattedText}</KineticMarquee>
				</div>
			);
		}
		return (
			<div
				className={classes}
				style={{ ...(fontFamily ? { fontFamily } : {}), ...motionStyle }}
				data-kinetic-target={kineticTarget}
			>
				{richText.map((paragraph, index) => (
					<RichParagraph
						key={index}
						paragraph={paragraph}
						link={href}
						kinetic={kinetic}
						index={index}
					/>
				))}
			</div>
		);
	}
	const linkedContent = href ? (
		<a href={href}>
			<KineticInline text={text} config={kinetic} />
		</a>
	) : (
		<KineticInline text={text} config={kinetic} />
	);
	const content =
		kinetic?.effect === 'marquee' ? (
			<KineticMarquee duplicateText={text}>{linkedContent}</KineticMarquee>
		) : (
			linkedContent
		);
	const classes = ['text-block-content', `text-style-${style}`, motionClass, backgroundClass, className].filter(Boolean).join(' ');
	const textStyle = { ...(fontFamily ? { fontFamily } : {}), ...motionStyle };

	switch (style) {
		case 'heading':
			return <h2 className={classes} style={textStyle} data-kinetic-target={kineticTarget}>{content}</h2>;
		case 'subheading':
			return <h3 className={classes} style={textStyle} data-kinetic-target={kineticTarget}>{content}</h3>;
		case 'quote':
			return <blockquote className={classes} style={textStyle} data-kinetic-target={kineticTarget}>{content}</blockquote>;
		default:
			return <p className={classes} style={textStyle} data-kinetic-target={kineticTarget}>{content}</p>;
	}
}

/** A free-text page block. `editing` (editor preview only) swaps the words for
 * an in-place contenteditable with the same classes, so typing happens right
 * on the page; kinetic motion pauses while the caret is active. */
export default function TextBlock({
	text,
	richText,
	fontFamily,
	align,
	style = 'body',
	background,
	backgroundAutoContrast,
	link,
	kinetic,
	flowLayout,
	kineticTarget,
	editing,
}: {
	text: string;
	richText?: RichTextParagraph[];
	fontFamily?: string;
	align?: TextAlign;
	style?: TextStyle;
	background?: string;
	backgroundAutoContrast?: boolean;
	link?: string;
	kinetic?: KineticTextConfig;
	flowLayout?: TextFlowLayout;
	kineticTarget?: string;
	editing?: InlineTextEditing;
}) {
	if (!editing && !(richText ? richTextPlainText(richText) : text).trim()) return null;
	const safeFlowLayout = flowLayout ? clampTextFlowLayout(flowLayout) : undefined;
	const flowStyle = safeFlowLayout
		? ({
				'--text-flow-x': String(safeFlowLayout.x),
				'--text-flow-w': String(safeFlowLayout.w),
			} as React.CSSProperties)
		: undefined;
	return (
		<div
			className={`text-block align-${richText ? 'left' : align ?? 'left'} style-${style}${kinetic?.effect === 'marquee' ? ' kinetic-marquee' : ''}`}
			style={flowStyle}
		>
			{editing ? (
				<InlineTextEditor
					text={text}
					richText={richText}
					legacyStyle={style}
					legacyAlign={align}
					fontFamily={fontFamily}
					onChange={editing.onChange}
					onDone={editing.onDone}
				/>
			) : (
				<TextContent
					text={text}
					richText={richText}
					fontFamily={fontFamily}
					style={style}
					background={background}
					backgroundAutoContrast={backgroundAutoContrast}
					link={link}
					kinetic={kinetic}
					kineticTarget={kineticTarget}
				/>
			)}
		</div>
	);
}
