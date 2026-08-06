import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type MouseEvent,
} from 'react';
import type {
	RichTextParagraph,
	RichTextSize,
	TextAlign,
	TextStyle,
} from '../../lib/content';
import {
	legacyTextToRichText,
	richTextFromElement,
	richTextPlainText,
	richTextToEditorHtml,
} from '../../lib/richText';

interface ToolbarState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	size: RichTextSize;
	fontSize: number;
	align: TextAlign;
	link?: string;
}

/** Browser editing commands remain the interoperable way to preserve a live
 * selection while a separate toolbar button is pressed. The result is
 * immediately converted into our safe structured model. */
interface EditingDocument {
	execCommand(command: string, showUi?: boolean, value?: string): boolean;
	queryCommandState(command: string): boolean;
	queryCommandValue(command: string): string;
}

const editingDocument = (doc: Document): EditingDocument =>
	doc as unknown as EditingDocument;

const DEFAULT_TOOLBAR: ToolbarState = {
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	size: 'body',
	fontSize: 12,
	align: 'left',
	link: undefined,
};

const TEXT_SIZES: Array<{ value: RichTextSize; label: string; commandSize: string; pt: number }> = [
	{ value: 'body', label: 'Body · 12pt', commandSize: '3', pt: 12 },
	{ value: 'subheading', label: 'Small · 18pt', commandSize: '5', pt: 18 },
	{ value: 'heading', label: 'Large · 32pt', commandSize: '7', pt: 32 },
];

const ALIGNMENTS: Array<{ value: TextAlign; label: string; command: string }> = [
	{ value: 'left', label: 'L', command: 'justifyLeft' },
	{ value: 'center', label: 'C', command: 'justifyCenter' },
	{ value: 'right', label: 'R', command: 'justifyRight' },
];

const selectionElement = (root: HTMLElement): HTMLElement | null => {
	const selection = root.ownerDocument.getSelection();
	const node = selection?.anchorNode;
	if (!node || !root.contains(node)) return null;
	// nodeType, not instanceof: inside the preview iframe the nodes belong to
	// another realm whose HTMLElement is a different constructor.
	return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
};

const selectedSize = (root: HTMLElement): RichTextSize => {
	const value = Number(editingDocument(root.ownerDocument).queryCommandValue('fontSize'));
	if (value >= 6) return 'heading';
	if (value >= 4) return 'subheading';
	if (value > 0) return 'body';
	const element = selectionElement(root);
	const explicit = element?.closest<HTMLElement>('[data-text-size]')?.dataset.textSize;
	if (explicit === 'heading' || explicit === 'subheading' || explicit === 'body') return explicit;
	return 'body';
};

const selectedAlign = (root: HTMLElement): TextAlign => {
	const doc = root.ownerDocument;
	if (editingDocument(doc).queryCommandState('justifyCenter')) return 'center';
	if (editingDocument(doc).queryCommandState('justifyRight')) return 'right';
	const element = selectionElement(root);
	const block = element?.closest<HTMLElement>('[data-text-align]');
	const explicit = block?.style.textAlign || block?.dataset.textAlign;
	if (explicit === 'center' || explicit === 'right' || explicit === 'left') return explicit;
	return 'left';
};

const selectedPointSize = (root: HTMLElement): number => {
	const element = selectionElement(root)?.closest<HTMLElement>('[data-text-pt], [data-text-size], font');
	const explicit = Number(element?.dataset.textPt);
	if (Number.isFinite(explicit) && explicit >= 6) return explicit;
	const size = selectedSize(root);
	return size === 'heading' ? 32 : size === 'subheading' ? 18 : 12;
};

const selectedLink = (root: HTMLElement): string | undefined =>
	selectionElement(root)?.closest<HTMLAnchorElement>('a[href]')?.getAttribute('href')?.trim() ||
	undefined;

/**
 * The formatting toolbar alone — sizes, marks, link, alignment — driving any
 * contenteditable it can reach through `getEditor`. RichTextEditor pairs it
 * with its own editable below; the preview edit layer floats it over text
 * being edited in place on the page. `targetDocument` is where selection
 * changes are watched (the preview iframe's document, for in-place editing).
 */
export function RichTextToolbar({
	getEditor,
	targetDocument,
	onEmit,
	label,
}: {
	getEditor: () => HTMLElement | null;
	targetDocument: Document | null;
	onEmit: () => void;
	label: string;
}) {
	const selectionRef = useRef<Range | null>(null);
	const [toolbar, setToolbar] = useState<ToolbarState>(DEFAULT_TOOLBAR);
	const [pointInput, setPointInput] = useState('12');

	const refreshToolbar = useCallback(() => {
		const editor = getEditor();
		if (!editor || !selectionElement(editor)) return;
		const doc = editor.ownerDocument;
		const commands = editingDocument(doc);
		const fontSize = selectedPointSize(editor);
		setToolbar({
			bold: commands.queryCommandState('bold'),
			italic: commands.queryCommandState('italic'),
			underline: commands.queryCommandState('underline'),
			strike: commands.queryCommandState('strikeThrough'),
			size: selectedSize(editor),
			fontSize,
			align: selectedAlign(editor),
			link: selectedLink(editor),
		});
		setPointInput(String(fontSize));
		const selection = editor.ownerDocument.getSelection();
		if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange();
	}, [getEditor]);

	useEffect(() => {
		if (!targetDocument) return;
		targetDocument.addEventListener('selectionchange', refreshToolbar);
		return () => targetDocument.removeEventListener('selectionchange', refreshToolbar);
	}, [targetDocument, refreshToolbar]);

	const restoreSelection = () => {
		const editor = getEditor();
		// Capture before focus: focusing the editor from a number input can fire a
		// selectionchange with a collapsed caret and overwrite the saved range.
		const range = selectionRef.current?.cloneRange();
		if (!editor) return;
		editor.focus();
		if (!range) return;
		const selection = editor.ownerDocument.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		selectionRef.current = range.cloneRange();
	};

	const runCommand = (command: string, argument?: string) => {
		const editor = getEditor();
		if (!editor) return;
		restoreSelection();
		editingDocument(editor.ownerDocument).execCommand(command, false, argument);
		onEmit();
		refreshToolbar();
	};

	const applyPointSize = (size: RichTextSize, points: number, commandSize = '7') => {
		const editor = getEditor();
		if (!editor) return;
		const clamped = Math.min(Math.max(Math.round(points * 10) / 10, 6), 144);
		restoreSelection();
		// Use a temporary size that differs from every toolbar preset. Reusing the
		// current preset value can make execCommand a no-op, which is why an exact
		// point size occasionally appeared not to apply after choosing Large/Small.
		const markerSize = commandSize === '1' ? '7' : '1';
		editingDocument(editor.ownerDocument).execCommand('fontSize', false, markerSize);
		for (const element of editor.querySelectorAll<HTMLElement>(`font[size="${markerSize}"]`)) {
			element.removeAttribute('size');
			element.dataset.textSize = size;
			element.dataset.textPt = String(clamped);
			element.style.fontSize = `${clamped}pt`;
		}
		onEmit();
		refreshToolbar();
	};

	const editLink = () => {
		const editor = getEditor();
		if (!editor) return;
		const value = prompt(
			'Link for the selected words (leave empty to remove):',
			toolbar.link ?? 'https://',
		);
		if (value === null) return;
		const link = value.trim();
		if (
			link &&
			/^[a-z][a-z\d+.-]*:/i.test(link) &&
			!/^(?:https?:|mailto:)/i.test(link)
		) {
			alert('Use a web address, an email link, or a site path such as /work.');
			return;
		}
		restoreSelection();
		const command = link ? 'createLink' : 'unlink';
		editingDocument(editor.ownerDocument).execCommand(command, false, link);
		onEmit();
		refreshToolbar();
	};

	const keepSelection = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();

	return (
		<div className="rich-text-toolbar">
			<div className="rich-text-tool-group text-size-tools" role="group" aria-label={`Text size for ${label}`}>
				{TEXT_SIZES.map((size) => (
					<button
						key={size.value}
						type="button"
						className={toolbar.size === size.value ? 'active' : ''}
						aria-label={`${size.label} size for ${label}`}
						aria-pressed={toolbar.size === size.value}
						onMouseDown={keepSelection}
						onClick={() => applyPointSize(size.value, size.pt, size.commandSize)}
					>
						{size.label}
					</button>
				))}
				<label className="rich-text-point-size">
					<span className="sr-only">Exact point size for {label}</span>
					<input
						type="number"
						min={6}
						max={144}
						step={0.5}
						value={pointInput}
						aria-label={`Exact point size for ${label}`}
						onChange={(event) => setPointInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								applyPointSize(toolbar.size, Number(event.currentTarget.value) || toolbar.fontSize);
							}
						}}
						onBlur={(event) =>
							applyPointSize(toolbar.size, Number(event.currentTarget.value) || toolbar.fontSize)
						}
					/>
					<span>pt</span>
				</label>
			</div>
			<div className="rich-text-tool-group mark-tools" role="group" aria-label={`Formatting for ${label}`}>
				<button
					type="button"
					className={toolbar.bold ? 'active' : ''}
					aria-label={`Bold for ${label}`}
					aria-pressed={toolbar.bold}
					onMouseDown={keepSelection}
					onClick={() => runCommand('bold')}
				>
					<strong>B</strong>
				</button>
				<button
					type="button"
					className={toolbar.italic ? 'active' : ''}
					aria-label={`Italic for ${label}`}
					aria-pressed={toolbar.italic}
					onMouseDown={keepSelection}
					onClick={() => runCommand('italic')}
				>
					<em>I</em>
				</button>
				<button
					type="button"
					className={toolbar.underline ? 'active' : ''}
					aria-label={`Underline for ${label}`}
					aria-pressed={toolbar.underline}
					onMouseDown={keepSelection}
					onClick={() => runCommand('underline')}
				>
					<u>U</u>
				</button>
				<button
					type="button"
					className={toolbar.strike ? 'active' : ''}
					aria-label={`Strikethrough for ${label}`}
					aria-pressed={toolbar.strike}
					onMouseDown={keepSelection}
					onClick={() => runCommand('strikeThrough')}
				>
					<s>S</s>
				</button>
				<button
					type="button"
					className={toolbar.link ? 'active' : ''}
					title={toolbar.link ? 'Edit or remove this link' : 'Link the selected words'}
					aria-label={`Link selected words in ${label}`}
					aria-pressed={!!toolbar.link}
					onMouseDown={keepSelection}
					onClick={editLink}
				>
					Link
				</button>
			</div>
			<div className="rich-text-tool-group alignment-tools" role="group" aria-label={`Alignment within ${label}`}>
				{ALIGNMENTS.map((alignment) => (
					<button
						key={alignment.value}
						type="button"
						className={toolbar.align === alignment.value ? 'active' : ''}
						title={`Align ${alignment.value}`}
						aria-label={`Align ${alignment.value} within ${label}`}
						aria-pressed={toolbar.align === alignment.value}
						onMouseDown={keepSelection}
						onClick={() => runCommand(alignment.command)}
					>
						{alignment.label}
					</button>
				))}
			</div>
		</div>
	);
}

export default function RichTextEditor({
	value,
	legacyText,
	legacyStyle,
	legacyAlign,
	fontFamily,
	label,
	onChange,
}: {
	value?: RichTextParagraph[];
	legacyText: string;
	legacyStyle?: TextStyle;
	legacyAlign?: TextAlign;
	fontFamily: string;
	label: string;
	onChange: (plainText: string, richText: RichTextParagraph[]) => void;
}) {
	const editorRef = useRef<HTMLDivElement>(null);
	const lastEmittedRef = useRef<string | undefined>(undefined);
	const [editorDocument, setEditorDocument] = useState<Document | null>(null);
	const documentValue = useMemo(
		() => value ?? legacyTextToRichText(legacyText, legacyStyle, legacyAlign),
		[value, legacyText, legacyStyle, legacyAlign],
	);
	const signature = JSON.stringify(documentValue);

	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || lastEmittedRef.current === signature) return;
		const html = richTextToEditorHtml(documentValue);
		if (editor.innerHTML !== html) editor.innerHTML = html;
		lastEmittedRef.current = signature;
	}, [documentValue, signature]);

	useEffect(() => {
		setEditorDocument(editorRef.current?.ownerDocument ?? null);
	}, []);

	const emit = useCallback(() => {
		const editor = editorRef.current;
		if (!editor) return;
		const next = richTextFromElement(editor);
		lastEmittedRef.current = JSON.stringify(next);
		onChange(richTextPlainText(next), next);
	}, [onChange]);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!(event.metaKey || event.ctrlKey)) return;
		const key = event.key.toLowerCase();
		const command =
			key === 'b'
				? 'bold'
				: key === 'i'
					? 'italic'
					: key === 'u'
						? 'underline'
						: key === 'x' && event.shiftKey
							? 'strikeThrough'
							: undefined;
		if (!command) return;
		event.preventDefault();
		const editor = editorRef.current;
		if (!editor) return;
		editingDocument(editor.ownerDocument).execCommand(command, false, undefined);
		emit();
	};

	return (
		<div className="rich-text-editor-shell">
			<RichTextToolbar
				getEditor={() => editorRef.current}
				targetDocument={editorDocument}
				onEmit={emit}
				label={label}
			/>
			<div
				ref={editorRef}
				className="rich-text-editor"
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-multiline="true"
				aria-label={`Words in ${label}`}
				data-empty={richTextPlainText(documentValue).trim() ? undefined : 'true'}
				data-placeholder="Write something…"
				style={{ fontFamily }}
				onInput={emit}
				onKeyDown={onKeyDown}
				onPaste={(event) => {
					event.preventDefault();
					const text = event.clipboardData.getData('text/plain');
					if (editorRef.current)
						editingDocument(editorRef.current.ownerDocument).execCommand('insertText', false, text);
					emit();
				}}
			/>
			<p className="rich-text-shortcuts">
				Select words to format or link them. Each paragraph can have its own alignment.
			</p>
		</div>
	);
}
