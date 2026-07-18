import { useRef, useState, type ReactNode } from 'react';
import { isImageFile, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from '../../lib/validation';

/** Natural-order name sort so "img2" comes before "img10" — matches folder view order. */
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });

/** Recursively collect every file inside a dropped directory entry. */
async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
	if (entry.isFile) {
		const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
		out.push(file);
	} else if (entry.isDirectory) {
		const reader = (entry as FileSystemDirectoryEntry).createReader();
		// readEntries returns batches (Chrome caps them at 100) — drain until empty.
		let batch: FileSystemEntry[];
		do {
			batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
			for (const child of batch) await walkEntry(child, out);
		} while (batch.length > 0);
	}
}

/**
 * Files from a drop, folders included: dropping a directory yields every file
 * inside it (sorted by name). Entries must be grabbed synchronously — the
 * DataTransfer is dead after the first await.
 */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
	const entries = Array.from(dt.items ?? [])
		.map((item) => item.webkitGetAsEntry?.())
		.filter((e): e is FileSystemEntry => !!e);
	if (!entries.some((e) => e.isDirectory)) return Array.from(dt.files);
	const out: File[] = [];
	for (const entry of entries) await walkEntry(entry, out);
	return out.sort(byName);
}

export function ImageDrop({
	onFiles,
	multiple = false,
	children,
}: {
	onFiles: (files: File[]) => void;
	multiple?: boolean;
	children?: ReactNode;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handle = (all: File[]) => {
		const valid = all.filter((f) => isImageFile(f) && f.size <= MAX_IMAGE_BYTES);
		const rejected = all.length - valid.length;
		setError(rejected > 0 ? `${rejected} file(s) skipped (must be an image under ${MAX_IMAGE_MB} MB).` : null);
		if (valid.length) onFiles(multiple ? valid : valid.slice(0, 1));
	};

	return (
		<div>
			<div
				className={`imagedrop ${over ? 'over' : ''}`}
				role="button"
				tabIndex={0}
				onClick={(e) => {
					// The drop zone often sits inside a <label> (Field). Without this,
					// the label ALSO forwards the click to the hidden input, opening the
					// file picker a second time after the first choice.
					e.preventDefault();
					inputRef.current?.click();
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
				}}
				onDragOver={(e) => {
					e.preventDefault();
					setOver(true);
				}}
				onDragLeave={() => setOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setOver(false);
					void filesFromDrop(e.dataTransfer).then(handle);
				}}
			>
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					multiple={multiple}
					hidden
					// Keep the programmatic click from bubbling back to the div handler,
					// whose preventDefault would cancel opening the picker.
					onClick={(e) => e.stopPropagation()}
					onChange={(e) => {
						handle(Array.from(e.target.files ?? []));
						e.target.value = '';
					}}
				/>
				{children ?? <span>Click or drop image{multiple ? 's' : ''} here</span>}
			</div>
			{multiple && (
				<>
					<input
						ref={folderInputRef}
						type="file"
						hidden
						// Non-standard but universally supported; selects a whole directory.
						{...({ webkitdirectory: '' } as Record<string, string>)}
						onChange={(e) => {
							handle(Array.from(e.target.files ?? []).sort(byName));
							e.target.value = '';
						}}
					/>
					<button type="button" className="btn-link imagedrop-folder" onClick={() => folderInputRef.current?.click()}>
						…or upload a whole folder
					</button>
				</>
			)}
			{error && <span className="field-error">{error}</span>}
		</div>
	);
}
