import { useRef, useState, type ReactNode } from 'react';
import { isImageFile, MAX_IMAGE_BYTES } from '../../lib/validation';

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
	const [over, setOver] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handle = (fileList: FileList | null) => {
		if (!fileList) return;
		const all = Array.from(fileList);
		const valid = all.filter((f) => isImageFile(f) && f.size <= MAX_IMAGE_BYTES);
		const rejected = all.length - valid.length;
		setError(rejected > 0 ? `${rejected} file(s) skipped (must be an image under 10 MB).` : null);
		if (valid.length) onFiles(multiple ? valid : valid.slice(0, 1));
	};

	return (
		<div>
			<div
				className={`imagedrop ${over ? 'over' : ''}`}
				role="button"
				tabIndex={0}
				onClick={() => inputRef.current?.click()}
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
					handle(e.dataTransfer.files);
				}}
			>
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					multiple={multiple}
					hidden
					onChange={(e) => {
						handle(e.target.files);
						e.target.value = '';
					}}
				/>
				{children ?? <span>Click or drop image{multiple ? 's' : ''} here</span>}
			</div>
			{error && <span className="field-error">{error}</span>}
		</div>
	);
}
