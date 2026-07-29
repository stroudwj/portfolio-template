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
	align: TextAlign;
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
	align: 'left',
};

const TEXT_SIZES: Array<{ value: RichTextSize; label: string; commandSize: string }> = [
	{ value: 'body', label: 'Body', commandSize: '3' },
	{ value: 'subheading', label: 'Small', commandSize: '5' },
	{ value: 'heading', label: 'Large', commandSize: '7' },
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
	return node instanceof HTMLElement ? node : node.parentElement;
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
	const [toolbar, setToolbar] = useState<ToolbarState>(DEFAULT_TOOLBAR);
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

	const refreshToolbar = useCallback(() => {
		const editor = editorRef.current;
		if (!editor || !selectionElement(editor)) return;
		const doc = editor.ownerDocument;
		const commands = editingDocument(doc);
		setToolbar({
			bold: commands.queryCommandState('bold'),
			italic: commands.queryCommandState('italic'),
			underline: commands.queryCommandState('underline'),
			strike: commands.queryCommandState('strikeThrough'),
			size: selectedSize(editor),
			align: selectedAlign(editor),
		});
	}, []);

	useEffect(() => {
		const editor = editorRef.current;
		const doc = editor?.ownerDocument;
		if (!doc) return;
		doc.addEventListener('selectionchange', refreshToolbar);
		return () => doc.removeEventListener('selectionchange', refreshToolbar);
	}, [refreshToolbar]);

	const emit = useCallback(() => {
		const editor = editorRef.current;
		if (!editor) return;
		const next = richTextFromElement(editor);
		lastEmittedRef.current = JSON.stringify(next);
		onChange(richTextPlainText(next), next);
		refreshToolbar();
	}, [onChange, refreshToolbar]);

	const runCommand = (command: string, argument?: string) => {
		const editor = editorRef.current;
		if (!editor) return;
		editor.focus();
		editingDocument(editor.ownerDocument).execCommand(command, false, argument);
		emit();
	};

	const keepSelection = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();

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
		runCommand(command);
	};

	return (
		<div className="rich-text-editor-shell">
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
							onClick={() => runCommand('fontSize', size.commandSize)}
						>
							{size.label}
						</button>
					))}
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
				onKeyUp={refreshToolbar}
				onMouseUp={refreshToolbar}
				onFocus={refreshToolbar}
				onPaste={(event) => {
					event.preventDefault();
					const text = event.clipboardData.getData('text/plain');
					if (editorRef.current)
						editingDocument(editorRef.current.ownerDocument).execCommand('insertText', false, text);
					emit();
				}}
			/>
			<p className="rich-text-shortcuts">
				Select words to format them. Each paragraph can have its own alignment.
			</p>
		</div>
	);
}
