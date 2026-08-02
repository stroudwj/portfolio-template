import type {
	RichTextParagraph,
	RichTextRun,
	RichTextSize,
	TextAlign,
	TextStyle,
} from './content';

const BLOCK_TAGS = new Set([
	'ADDRESS',
	'BLOCKQUOTE',
	'DIV',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'P',
	'PRE',
]);

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const EXPLICIT_LINK_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const SAFE_LINK_SCHEME = /^(?:https?:|mailto:)/i;
const safeEditorLink = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return EXPLICIT_LINK_SCHEME.test(trimmed) && !SAFE_LINK_SCHEME.test(trimmed)
		? undefined
		: trimmed;
};

const cleanAlign = (value: string | null | undefined): TextAlign | undefined => {
	const normalized = value?.toLowerCase();
	return normalized === 'center' || normalized === 'right' ? normalized : undefined;
};

const cleanSize = (value: string | null | undefined): RichTextSize | undefined => {
	if (value === 'heading' || value === 'subheading') return value;
	return undefined;
};

const cleanFontSize = (value: number | string | null | undefined): number | undefined => {
	const size = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(size) ? Math.min(Math.max(Math.round(size * 10) / 10, 6), 144) : undefined;
};

const sameFormat = (a: RichTextRun, b: RichTextRun): boolean =>
	a.size === b.size &&
	a.fontSize === b.fontSize &&
	a.link === b.link &&
	a.bold === b.bold &&
	a.italic === b.italic &&
	a.underline === b.underline &&
	a.strike === b.strike;

/** Remove redundant defaults and merge adjacent runs with identical formatting. */
export function normalizeRichText(paragraphs: RichTextParagraph[]): RichTextParagraph[] {
	const normalized = paragraphs.map((paragraph) => {
		const runs: RichTextRun[] = [];
		for (const candidate of paragraph.runs) {
			const run: RichTextRun = {
				text: candidate.text.replace(/\u00a0/g, ' '),
				link: candidate.link?.trim() || undefined,
				size: cleanSize(candidate.size),
				fontSize: cleanFontSize(candidate.fontSize),
				bold: candidate.bold ? true : undefined,
				italic: candidate.italic ? true : undefined,
				underline: candidate.underline ? true : undefined,
				strike: candidate.strike ? true : undefined,
			};
			if (!run.text) continue;
			const previous = runs.at(-1);
			if (previous && sameFormat(previous, run)) previous.text += run.text;
			else runs.push(run);
		}
		return {
			align: cleanAlign(paragraph.align),
			runs,
		};
	});
	return normalized.length ? normalized : [{ runs: [] }];
}

/** Upgrade a legacy plain text/style/alignment block without mutating stored data. */
export function legacyTextToRichText(
	text: string,
	style: TextStyle | undefined,
	align: TextAlign | undefined,
): RichTextParagraph[] {
	const size: RichTextSize | undefined =
		style === 'heading' ? 'heading' : style === 'subheading' ? 'subheading' : undefined;
	return normalizeRichText(
		text.split('\n').map((line) => ({
			align,
			runs: line
				? [
						{
							text: line,
							size,
							italic: style === 'quote' ? true : undefined,
						},
					]
				: [],
		})),
	);
}

export const richTextPlainText = (paragraphs: RichTextParagraph[]): string =>
	paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');

/** Safe editor markup generated only from the structured model. */
export function richTextToEditorHtml(paragraphs: RichTextParagraph[]): string {
	return normalizeRichText(paragraphs)
		.map((paragraph) => {
			const align = paragraph.align ?? 'left';
			const content =
				paragraph.runs
					.map((run) => {
						let value = escapeHtml(run.text).replace(/\n/g, '<br>');
						if (run.bold) value = `<strong>${value}</strong>`;
						if (run.italic) value = `<em>${value}</em>`;
						if (run.underline) value = `<u>${value}</u>`;
						if (run.strike) value = `<s>${value}</s>`;
						const link = safeEditorLink(run.link);
						if (link) value = `<a href="${escapeHtml(link)}">${value}</a>`;
						const pointSize = run.fontSize
							? ` data-text-pt="${run.fontSize}" style="font-size:${run.fontSize}pt"`
							: '';
						return `<span data-text-size="${run.size ?? 'body'}"${pointSize}>${value}</span>`;
					})
					.join('') || '<br>';
			return `<div data-text-align="${align}" style="text-align:${align}">${content}</div>`;
		})
		.join('');
}

interface InlineFormat {
	size?: RichTextSize;
	fontSize?: number;
	link?: string;
	bold?: true;
	italic?: true;
	underline?: true;
	strike?: true;
}

const fontElementSize = (element: Element): RichTextSize | undefined => {
	const raw = Number(element.getAttribute('size'));
	if (!Number.isFinite(raw)) return undefined;
	if (raw >= 6) return 'heading';
	if (raw >= 4) return 'subheading';
	return undefined;
};

const elementSize = (element: HTMLElement, inherited: RichTextSize | undefined): RichTextSize | undefined => {
	const explicit = cleanSize(element.dataset.textSize);
	if (explicit || element.dataset.textSize === 'body') return explicit;
	if (element.tagName === 'FONT') return fontElementSize(element) ?? inherited;
	if (element.tagName === 'H1' || element.tagName === 'H2') return 'heading';
	if (element.tagName === 'H3' || element.tagName === 'H4') return 'subheading';
	const size = element.style.fontSize;
	if (!size) return inherited;
	const pixels = Number.parseFloat(size);
	if (Number.isFinite(pixels)) {
		if (pixels >= 30) return 'heading';
		if (pixels >= 19) return 'subheading';
		return undefined;
	}
	return size.includes('xx-large') || size.includes('xxx-large')
		? 'heading'
		: size.includes('large')
			? 'subheading'
			: inherited;
};

const appendRun = (runs: RichTextRun[], text: string, format: InlineFormat) => {
	if (!text) return;
	const run: RichTextRun = { text, ...format };
	const previous = runs.at(-1);
	if (previous && sameFormat(previous, run)) previous.text += text;
	else runs.push(run);
};

const parseInlineNode = (node: Node, inherited: InlineFormat, runs: RichTextRun[]) => {
	if (node.nodeType === Node.TEXT_NODE) {
		appendRun(runs, node.textContent ?? '', inherited);
		return;
	}
	if (!(node instanceof HTMLElement)) return;
	if (node.tagName === 'BR') {
		appendRun(runs, '\n', inherited);
		return;
	}
	const decoration = node.style.textDecorationLine || node.style.textDecoration;
	const weight = node.style.fontWeight;
	const format: InlineFormat = {
		size: elementSize(node, inherited.size),
		fontSize:
			cleanFontSize(node.dataset.textPt) ??
			(node.style.fontSize.endsWith('pt') ? cleanFontSize(node.style.fontSize.slice(0, -2)) : inherited.fontSize),
		link:
			node.tagName === 'A'
				? node.getAttribute('href')?.trim() || inherited.link
				: inherited.link,
		bold:
			inherited.bold ||
			node.tagName === 'B' ||
			node.tagName === 'STRONG' ||
			weight === 'bold' ||
			(Number.parseInt(weight, 10) >= 600 ? true : undefined),
		italic:
			inherited.italic ||
			node.tagName === 'I' ||
			node.tagName === 'EM' ||
			node.style.fontStyle === 'italic' ||
			node.style.fontStyle === 'oblique'
				? true
				: undefined,
		underline:
			inherited.underline || node.tagName === 'U' || decoration.includes('underline')
				? true
				: undefined,
		strike:
			inherited.strike ||
			node.tagName === 'S' ||
			node.tagName === 'STRIKE' ||
			node.tagName === 'DEL' ||
			decoration.includes('line-through')
				? true
				: undefined,
	};
	node.childNodes.forEach((child) => parseInlineNode(child, format, runs));
};

const paragraphFromElement = (element: HTMLElement): RichTextParagraph => {
	const runs: RichTextRun[] = [];
	const inheritedSize =
		element.tagName === 'H1' || element.tagName === 'H2'
			? 'heading'
			: element.tagName === 'H3' || element.tagName === 'H4'
				? 'subheading'
				: undefined;
	const inherited: InlineFormat = {
		size: inheritedSize,
		italic: element.tagName === 'BLOCKQUOTE' ? true : undefined,
	};
	element.childNodes.forEach((child) => parseInlineNode(child, inherited, runs));
	return {
		align: cleanAlign(
			element.style.textAlign || element.dataset.textAlign || element.getAttribute('align'),
		),
		runs,
	};
};

/** Convert browser editing DOM into the safe structured model. */
export function richTextFromElement(root: HTMLElement): RichTextParagraph[] {
	const paragraphs: RichTextParagraph[] = [];
	const looseNodes: Node[] = [];
	const flushLoose = () => {
		if (!looseNodes.length) return;
		const runs: RichTextRun[] = [];
		looseNodes.forEach((node) => parseInlineNode(node, {}, runs));
		paragraphs.push({ runs });
		looseNodes.length = 0;
	};

	root.childNodes.forEach((node) => {
		if (node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName)) {
			flushLoose();
			paragraphs.push(paragraphFromElement(node));
		} else if (node instanceof HTMLBRElement) {
			flushLoose();
			paragraphs.push({ runs: [] });
		} else {
			looseNodes.push(node);
		}
	});
	flushLoose();
	return normalizeRichText(paragraphs);
}
