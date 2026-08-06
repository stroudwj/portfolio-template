// In-place text editing for the editor preview: the block's own element turns
// into a contenteditable seeded from the rich text model, so the artist types
// directly on the page — same fonts, same width, same wrap. Every input event
// reparses through the shared rich-text pipeline and reports upward; the
// floating format toolbar (in the preview edit layer) drives execCommand
// against this element and the same input events keep everything in sync.
// Published sites never render this component.
import { useEffect, useRef } from 'react';
import type {
	RichTextParagraph,
	TextAlign,
	TextStyle,
} from '../lib/content';
import {
	legacyTextToRichText,
	richTextFromElement,
	richTextPlainText,
	richTextToEditorHtml,
} from '../lib/richText';
import './TextBlock.css';

export interface InlineTextEditing {
	blockId: string;
	onChange: (plainText: string, richText: RichTextParagraph[]) => void;
	onDone: () => void;
}

/** Browser editing commands, matching RichTextEditor's usage. */
const execCommand = (doc: Document, command: string, value?: string) =>
	(doc as unknown as { execCommand(c: string, ui?: boolean, v?: string): boolean }).execCommand(
		command,
		false,
		value,
	);

export default function InlineTextEditor({
	text,
	richText,
	legacyStyle,
	legacyAlign,
	fontFamily,
	className = '',
	onChange,
	onDone,
}: {
	text: string;
	richText?: RichTextParagraph[];
	legacyStyle?: TextStyle;
	legacyAlign?: TextAlign;
	fontFamily?: string;
	className?: string;
	onChange: (plainText: string, richText: RichTextParagraph[]) => void;
	onDone: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const lastEmittedRef = useRef<string | undefined>(undefined);
	const documentValue = richText ?? legacyTextToRichText(text, legacyStyle, legacyAlign);
	const signature = JSON.stringify(documentValue);

	// Seed the DOM from the model, and re-seed only on external changes (undo,
	// the editing column) — never on our own echoes, so the caret survives.
	useEffect(() => {
		const editor = ref.current;
		if (!editor || lastEmittedRef.current === signature) return;
		editor.innerHTML = richTextToEditorHtml(documentValue);
		lastEmittedRef.current = signature;
	}, [documentValue, signature]);

	// Entering edit mode puts the caret at the end of the words.
	useEffect(() => {
		const editor = ref.current;
		if (!editor) return;
		editor.focus();
		const doc = editor.ownerDocument;
		const range = doc.createRange();
		range.selectNodeContents(editor);
		range.collapse(false);
		const selection = doc.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}, []);

	const emit = () => {
		const editor = ref.current;
		if (!editor) return;
		const next = richTextFromElement(editor);
		lastEmittedRef.current = JSON.stringify(next);
		onChange(richTextPlainText(next), next);
	};

	return (
		<div
			ref={ref}
			className={`text-block-content rich-text-content inline-text-editor ${className}`.trim()}
			contentEditable
			suppressContentEditableWarning
			role="textbox"
			aria-multiline="true"
			aria-label="Edit this text in place"
			data-inline-text-editor="true"
			style={fontFamily ? { fontFamily } : undefined}
			onInput={emit}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					onDone();
					return;
				}
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
				const editor = ref.current;
				if (!editor) return;
				execCommand(editor.ownerDocument, command);
				emit();
			}}
			onPaste={(event) => {
				event.preventDefault();
				const pasted = event.clipboardData.getData('text/plain');
				const editor = ref.current;
				if (!editor) return;
				execCommand(editor.ownerDocument, 'insertText', pasted);
				emit();
			}}
		/>
	);
}
