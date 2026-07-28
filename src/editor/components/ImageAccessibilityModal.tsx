import { useState } from 'react';
import {
	imageAccessibilityComplete,
	normalizeAccessibleImages,
	type AccessibleImageUpload,
} from '../lib/image-accessibility';
import { Modal } from './ui/Modal';

export default function ImageAccessibilityModal({
	files,
	replacingSample = false,
	onCancel,
	onConfirm,
}: {
	files: File[];
	replacingSample?: boolean;
	onCancel: () => void;
	onConfirm: (images: AccessibleImageUpload[]) => void;
}) {
	const [rows, setRows] = useState(() =>
		files.map((file) => ({ file, alt: '', decorative: false })),
	);
	const complete = imageAccessibilityComplete(rows);

	return (
		<Modal
			title={files.length === 1 ? 'Describe this image' : 'Describe these images'}
			onClose={onCancel}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onCancel}>
						Cancel
					</button>
					<button
						type="button"
						className="btn-primary"
						disabled={!complete}
						onClick={() => onConfirm(normalizeAccessibleImages(rows))}
					>
						{replacingSample ? 'Replace sample image' : `Add image${files.length === 1 ? '' : 's'}`}
					</button>
				</>
			}
		>
			<p className="modal-lead">
				Add concise alt text describing what matters in the image, or explicitly mark it decorative. This choice is required for every new upload.
			</p>
			{replacingSample && (
				<p className="sample-replacement-note">
					The sample’s placement will stay the same. Its title, caption, link, credit, and inherited alt text will be cleared.
				</p>
			)}
			<div className="accessibility-upload-list">
				{rows.map((row, index) => (
					<div className="accessibility-upload-row" key={`${row.file.name}-${index}`}>
						<strong>{row.file.name}</strong>
						<label className="field">
							<span className="field-label">Alt text</span>
							<input
								className="text-input"
								value={row.alt}
								disabled={row.decorative}
								placeholder="Example: Red ceramic vessel on a walnut shelf"
								onChange={(event) =>
									setRows((current) =>
										current.map((item, itemIndex) =>
											itemIndex === index ? { ...item, alt: event.target.value } : item,
										),
									)
								}
							/>
						</label>
						<label className="decorative-image-check">
							<input
								type="checkbox"
								checked={row.decorative}
								onChange={(event) =>
									setRows((current) =>
										current.map((item, itemIndex) =>
											itemIndex === index
												? { ...item, decorative: event.target.checked, alt: event.target.checked ? '' : item.alt }
												: item,
										),
									)
								}
							/>
							Decorative image — intentionally use empty alt text
						</label>
					</div>
				))}
			</div>
		</Modal>
	);
}
