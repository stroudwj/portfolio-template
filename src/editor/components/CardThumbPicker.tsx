// The sub-page card's thumbnail well. Upload stays the fast path; the "＋" can
// also pull a photo straight from the Image workbench, and either source can go
// through the crop & light lightbox first. The crop is baked into the stored
// file, so the renderer and published site need no crop metadata for thumbs.
import { useState } from 'react';
import { useEditor } from '../store';
import { ImageDrop } from './ui/ImageDrop';
import { Modal } from './ui/Modal';
import ImageCropDialog, { type ImageCropSettings } from './ImageCropDialog';
import { getAssetPreviewUrl } from '../lib/assets';
import { WORKBENCH_FOLDER } from '../lib/image-transfer';

const parseRatio = (value: string | undefined): number | undefined => {
	const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(value ?? '');
	return match ? Number(match[1]) / Number(match[2]) : undefined;
};

/** Render the crop settings into real pixels: the same cover + focus + zoom
 *  math the lightbox previews, drawn once to a canvas. */
async function bakeCroppedImage(
	src: string,
	filename: string,
	settings: ImageCropSettings,
): Promise<File | null> {
	const image = new Image();
	try {
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('image failed to load'));
			image.src = src;
		});
	} catch {
		return null;
	}
	const iw = image.naturalWidth;
	const ih = image.naturalHeight;
	if (!iw || !ih) return null;
	const frameAr = parseRatio(settings.aspect) ?? iw / ih;
	// Cover the frame, then zoom in around the focus point.
	let cropW = iw / ih > frameAr ? ih * frameAr : iw;
	let cropH = iw / ih > frameAr ? ih : iw / frameAr;
	cropW /= settings.zoom;
	cropH /= settings.zoom;
	const left = ((settings.focusX ?? 50) / 100) * (iw - cropW);
	const top = ((settings.focusY ?? 50) / 100) * (ih - cropH);
	// Thumbnails never need more than ~1600px on the long edge.
	const scale = Math.min(1, 1600 / Math.max(cropW, cropH));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(cropW * scale));
	canvas.height = Math.max(1, Math.round(cropH * scale));
	const context = canvas.getContext('2d');
	if (!context) return null;
	const brightness = settings.brightness ?? 100;
	const contrast = settings.contrast ?? 100;
	if (brightness !== 100 || contrast !== 100)
		context.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})`;
	context.drawImage(image, left, top, cropW, cropH, 0, 0, canvas.width, canvas.height);
	const keepPng = /\.png$/i.test(filename);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, keepPng ? 'image/png' : 'image/jpeg', 0.92),
	);
	if (!blob) return null;
	const base = filename.replace(/\.[a-z0-9]+$/i, '') || 'thumbnail';
	return new File([blob], `${base}-crop.${keepPng ? 'png' : 'jpg'}`, { type: blob.type });
}

export default function CardThumbPicker({ page, label }: { page: string; label: string }) {
	const { doc, setPageThumb } = useEditor();
	const [chooserOpen, setChooserOpen] = useState(false);
	const [cropSource, setCropSource] = useState<{ src: string; filename: string } | null>(null);
	if (!doc) return null;
	const workbenchEntries = doc.galleries[WORKBENCH_FOLDER] ?? [];
	const thumb = doc.pageThumbs[page];
	const thumbUrl = getAssetPreviewUrl(thumb?.assetId ?? null);
	return (
		<div className="child-thumb-picker">
			<ImageDrop
				ariaLabel={`Choose a thumbnail for ${label}`}
				onFiles={(files) => files[0] && setPageThumb(page, files[0])}
			>
				{thumbUrl ? <img className="child-thumb" src={thumbUrl} alt="" /> : <span>＋</span>}
			</ImageDrop>
			<div className="child-thumb-actions">
				<button
					type="button"
					className="btn-link"
					onClick={() => setChooserOpen(true)}
				>
					From workbench…
				</button>
				{thumbUrl && (
					<button
						type="button"
						className="btn-link"
						onClick={() =>
							setCropSource({ src: thumbUrl, filename: thumb?.filename ?? 'thumbnail' })
						}
					>
						Crop…
					</button>
				)}
			</div>
			{chooserOpen && (
				<Modal
					title={`Thumbnail for ${label} — choose from the workbench`}
					onClose={() => setChooserOpen(false)}
				>
					{workbenchEntries.length === 0 ? (
						<p className="muted">
							Upload reusable photos in the Image workbench at the top of Pages.
						</p>
					) : (
						<div className="child-thumb-workbench-grid">
							{workbenchEntries.map((entry, index) => {
								const name = entry.meta.title || entry.filename || `Image ${index + 1}`;
								const url = getAssetPreviewUrl(entry.assetId);
								if (!url) return null;
								return (
									<button
										type="button"
										key={entry.id}
										onClick={() => {
											setChooserOpen(false);
											setCropSource({ src: url, filename: entry.filename || 'thumbnail' });
										}}
									>
										<img src={url} alt="" />
										<span title={name}>{name}</span>
									</button>
								);
							})}
						</div>
					)}
				</Modal>
			)}
			{cropSource && (
				<ImageCropDialog
					src={cropSource.src}
					name={cropSource.filename}
					initial={{ focusX: 50, focusY: 50, zoom: 1 }}
					onClose={() => setCropSource(null)}
					onSave={(settings) => {
						const source = cropSource;
						setCropSource(null);
						void bakeCroppedImage(source.src, source.filename, settings).then((file) => {
							if (file) setPageThumb(page, file);
						});
					}}
				/>
			)}
		</div>
	);
}
