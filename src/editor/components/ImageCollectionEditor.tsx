// The workhorse behind both ProjectsEditor and GalleryEditor: an ordered list of
// images with upload, delete, drag-reorder, and per-image metadata. `variant`
// controls how much metadata is shown. The list collapses to a one-line summary
// so pages with many images stay scannable in the panel.
import { useState } from 'react';
import { useEditor } from '../store';
import { Section } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { SortableList, SortableItem } from './ui/Sortable';
import { getAssetPreviewUrl } from '../lib/assets';
import { PLACEHOLDER_IMAGE } from '../lib/content-init';
import { isUrl } from '../lib/validation';
import {
	getSampleArtwork,
	isSampleWithdrawn,
	sampleArtworkUrl,
	sampleReplacement,
} from '../lib/sample-artwork';
import type { AccessibleImageUpload } from '../lib/image-accessibility';
import ImageAccessibilityModal from './ImageAccessibilityModal';
import { showSampleUnavailable } from '../../portfolio/sampleFallback';

export interface ImageCollectionEditorProps {
	folder: string;
	title?: string;
	variant: 'projects' | 'gallery';
	addLabel: string;
	emptyLabel: string;
	/** Render without the Section wrapper (when embedded inside a PageEditor block). */
	embedded?: boolean;
	/** Overrides the default "arrange in the preview" helper line. */
	hint?: string;
	/** Whether uploads must supply alt text or an explicit decorative choice. */
	requireAltText?: boolean;
}

export default function ImageCollectionEditor({
	folder,
	title,
	variant,
	addLabel,
	emptyLabel,
	embedded,
	hint,
	requireAltText = false,
}: ImageCollectionEditorProps) {
	const {
		doc,
		addGalleryImages,
		replaceGalleryImage,
		replaceSampleWithSuccessor,
		removeGalleryImage,
		moveGalleryImage,
		updateGalleryMeta,
	} = useEditor();
	const [collapsed, setCollapsed] = useState(false);
	const [compact, setCompact] = useState(true);
	const [pendingUpload, setPendingUpload] = useState<{
		files: File[];
		replaceEntryId?: string;
		replacingSample?: boolean;
	} | null>(null);
	if (!doc) return null;
	const entries = doc.galleries[folder] ?? [];
	const accessibilityReviewCount = requireAltText
		? entries.filter((entry) => !entry.sampleAssetId && !entry.meta.alt.trim() && !entry.meta.decorative).length
		: 0;

	const finishUpload = (images: AccessibleImageUpload[]) => {
		if (!pendingUpload) return;
		if (pendingUpload.replaceEntryId) {
			const image = images[0];
			if (image) replaceGalleryImage(folder, pendingUpload.replaceEntryId, image);
		} else {
			addGalleryImages(folder, images);
		}
		setPendingUpload(null);
	};
	const beginUpload = (
		files: File[],
		options?: { replaceEntryId?: string; replacingSample?: boolean },
	) => {
		if (requireAltText) {
			setPendingUpload({ files, ...options });
			return;
		}
		const images = files.map((file) => ({ file, alt: '' }));
		if (options?.replaceEntryId) {
			const image = images[0];
			if (image) replaceGalleryImage(folder, options.replaceEntryId, image);
		} else {
			addGalleryImages(folder, images);
		}
	};

	const body = (
		<>
			{entries.length > 0 && (
				<button type="button" className="collapse-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
					<span className="collapse-chevron" aria-hidden="true">
						{collapsed ? '▸' : '▾'}
					</span>
					{entries.length} image{entries.length === 1 ? '' : 's'}
					{collapsed && <span className="collapse-note">— click to show</span>}
				</button>
			)}

			{(!collapsed || entries.length === 0) && (
				<>
						<ImageDrop multiple onFiles={(files) => beginUpload(files)}>
							<span>{addLabel}</span>
						</ImageDrop>
						{accessibilityReviewCount > 0 && (
							<p className="accessibility-review-warning" role="status">
								Accessibility review: {accessibilityReviewCount} older image{accessibilityReviewCount === 1 ? '' : 's'} need alt text or an explicit decorative choice. Open Details to review.
							</p>
						)}

					{entries.length === 0 ? (
						<p className="muted">{emptyLabel}</p>
					) : (
						<>
							<div className="image-list-heading">
								<p className="muted">
									{hint ??
										'Arrange images in the live preview — drag one to move it, drag its corner handle to resize. ⠿ here sets the stacking: the top image sits in front when images overlap.'}
								</p>
								<div className="image-view-toggle" role="group" aria-label="Image editor view">
									<button type="button" className={compact ? 'active' : ''} aria-pressed={compact} onClick={() => setCompact(true)}>
										Compact
									</button>
									<button type="button" className={!compact ? 'active' : ''} aria-pressed={!compact} onClick={() => setCompact(false)}>
										Details
									</button>
								</div>
							</div>
							<SortableList ids={entries.map((e) => e.id)} onReorder={(f, t) => moveGalleryImage(folder, f, t)}>
								<div className={`card-list ${compact ? 'image-card-list-compact' : ''}`}>
										{entries.map((entry, idx) => {
											const sample = getSampleArtwork(entry.sampleAssetId);
											const url =
												getAssetPreviewUrl(entry.assetId) ??
												sampleArtworkUrl(entry.sampleAssetId) ??
												PLACEHOLDER_IMAGE;
											const linkInvalid = entry.meta.link && !isUrl(entry.meta.link);
											const artworkName = entry.meta.title || entry.filename || `image ${idx + 1}`;
											const successor = sampleReplacement(entry.sampleAssetId);
											return (
											<SortableItem key={entry.id} id={entry.id}>
												{(handle) => (
													<div className={`card ${compact ? 'image-card-compact' : ''}`}>
														<button
															type="button"
															className="drag-handle"
															ref={handle.setActivatorNodeRef}
															{...handle.attributes}
															{...handle.listeners}
															aria-label={`Drag ${artworkName} to reorder`}
														>
															⠿
														</button>
														<div className="card-media">
											<img
												className="card-thumb"
												src={url}
												alt=""
												onError={
													sample
														? (event) => showSampleUnavailable(event.currentTarget)
														: undefined
												}
											/>
																<span className="card-filename" title={entry.filename}>
																	{entry.filename}
																</span>
																{sample && (
																	<span className="sample-asset-label">
																		Sample — replace or remove
																	</span>
																)}
																{sample?.status === 'retiring' && sample.retirementDate && (
																	<span className="sample-withdrawal-date">
																		Withdraws {new Date(sample.retirementDate).toLocaleDateString()}
																	</span>
																)}
																{sample && isSampleWithdrawn(sample) && (
																	<span className="sample-withdrawal-date">Sample withdrawn</span>
																)}
																<ImageDrop
																	ariaLabel={`Replace ${artworkName}`}
																	onFiles={(files) =>
														beginUpload(files.slice(0, 1), {
															replaceEntryId: entry.id,
															replacingSample: !!entry.sampleAssetId,
														})
																	}
																>
																	<span>Replace</span>
																</ImageDrop>
																{successor && (
																	<button
																		type="button"
																		className="btn-link sample-successor"
																		onClick={() => replaceSampleWithSuccessor(folder, entry.id)}
																	>
																		Use replacement
																	</button>
																)}
															</div>
														{!compact && (
															<div className="card-fields">
																<label className="image-description-field">
																	<span>Title</span>
																	<input
																		className="text-input"
																		value={entry.meta.title}
																		onChange={(e) =>
																			updateGalleryMeta(folder, entry.id, {
																				title: e.target.value,
																			})
																		}
																	/>
																</label>
																	<label className="image-description-field">
																		<span>Alt text</span>
																		<input
																			className="text-input"
																			placeholder="Blue ceramic vase on a wooden table"
																			value={entry.meta.alt}
																			disabled={!!entry.meta.decorative}
																			onChange={(e) =>
																				updateGalleryMeta(folder, entry.id, {
																					alt: e.target.value,
																					decorative: undefined,
																				})
																			}
																		/>
																		<label className="decorative-image-check compact">
																			<input
																				type="checkbox"
																				checked={!!entry.meta.decorative}
																				onChange={(event) =>
																					updateGalleryMeta(folder, entry.id, {
																						alt: event.target.checked ? '' : entry.meta.alt,
																						decorative: event.target.checked ? true : undefined,
																					})
																				}
																			/>
																			Decorative image
																		</label>
																	</label>
																{variant === 'projects' && (
																	<>
																		<label className="image-description-field">
																			<span>Caption (optional)</span>
																			<textarea
																				className="text-area"
																				rows={2}
																				value={entry.meta.description}
																				onChange={(e) =>
																					updateGalleryMeta(folder, entry.id, {
																						description: e.target.value,
																					})
																				}
																			/>
																		</label>
																		<label className="image-description-field">
																			<span>Project link</span>
																			<input
																				className={`text-input ${linkInvalid ? 'invalid' : ''}`}
																				placeholder="example.com/project"
																				value={entry.meta.link}
																				onChange={(e) =>
																					updateGalleryMeta(folder, entry.id, {
																						link: e.target.value,
																					})
																				}
																			/>
																		</label>
																	</>
																)}
															</div>
														)}
														<div className="card-actions">
															<button
																type="button"
																className="btn-icon"
																disabled={idx === 0}
																onClick={() => moveGalleryImage(folder, idx, idx - 1)}
																aria-label={`Move ${artworkName} up`}
															>
																↑
															</button>
															<button
																type="button"
																className="btn-icon"
																disabled={idx === entries.length - 1}
																onClick={() => moveGalleryImage(folder, idx, idx + 1)}
																aria-label={`Move ${artworkName} down`}
															>
																↓
															</button>
															<button
																type="button"
																className="btn-icon danger"
																onClick={() => removeGalleryImage(folder, entry.id)}
																aria-label={`Delete ${artworkName}`}
															>
																✕
															</button>
														</div>
													</div>
												)}
											</SortableItem>
										);
									})}
								</div>
							</SortableList>
						</>
					)}
				</>
			)}
		</>
	);

	const uploadModal = pendingUpload && (
		<ImageAccessibilityModal
			files={pendingUpload.files}
			replacingSample={pendingUpload.replacingSample}
			required={requireAltText}
			onCancel={() => setPendingUpload(null)}
			onConfirm={finishUpload}
		/>
	);
	if (embedded)
		return (
			<>
				{body}
				{uploadModal}
			</>
		);
	return (
		<>
			<Section title={title ?? ''} action={<span className="count">{entries.length}</span>}>
				{body}
			</Section>
			{uploadModal}
		</>
	);
}
