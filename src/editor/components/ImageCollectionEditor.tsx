// The workhorse behind both ProjectsEditor and GalleryEditor: an ordered list of
// images with upload, delete, drag-reorder, and per-image metadata. `variant`
// controls how much metadata is shown. The list collapses to a one-line summary
// so pages with many images stay scannable in the panel.
import { useRef, useState } from 'react';
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
import { readEffectClipboard, writeEffectClipboard } from '../lib/effect-clipboard';
import {
	imageGroupTargets,
	WORKBENCH_FOLDER,
	writeImageTransfer,
} from '../lib/image-transfer';
import ImageCropDialog, { type ImageCropSettings } from './ImageCropDialog';

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

/** Pull reusable photos into the current group without leaving the block editor. */
function WorkbenchPicker({ targetFolder }: { targetFolder: string }) {
	const { doc, transferGalleryImage } = useEditor();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const detailsRef = useRef<HTMLDetailsElement>(null);
	if (!doc) return null;
	const entries = doc.galleries[WORKBENCH_FOLDER] ?? [];
	const folders = [
		...new Set(
			entries
				.map((entry) => entry.meta.workbenchFolder?.trim())
				.filter((value): value is string => !!value),
		),
	].sort((a, b) => a.localeCompare(b));
	return (
		<details className="workbench-picker" ref={detailsRef}>
			<summary>
				<span>From workbench…</span>
				<small>{entries.length} reusable</small>
			</summary>
			{entries.length === 0 ? (
				<p className="muted">
					Upload reusable photos in the Image workbench at the top of Pages.
				</p>
			) : (
				<>
					{folders.length > 0 && (
						<div className="workbench-picker-folders" aria-label="Workbench folders">
							{folders.map((folder) => (
								<span key={folder}>▰ {folder}</span>
							))}
						</div>
					)}
					<div className="workbench-picker-grid">
						{entries.map((entry, index) => {
							const name = entry.meta.title || entry.filename || `Image ${index + 1}`;
							return (
								<label
									key={entry.id}
									className={selected.has(entry.id) ? 'selected' : ''}
								>
									<input
										type="checkbox"
										checked={selected.has(entry.id)}
										onChange={() =>
											setSelected((current) => {
												const next = new Set(current);
												if (next.has(entry.id)) next.delete(entry.id);
												else next.add(entry.id);
												return next;
											})
										}
										aria-label={`Select ${name} from workbench`}
									/>
									<img src={getAssetPreviewUrl(entry.assetId) ?? ''} alt="" />
									<span title={name}>{name}</span>
								</label>
							);
						})}
					</div>
					<div className="workbench-picker-actions">
						<button
							type="button"
							className="btn-primary"
							disabled={!selected.size}
							onClick={() => {
								for (const entry of entries)
									if (selected.has(entry.id))
										transferGalleryImage(
											WORKBENCH_FOLDER,
											entry.id,
											targetFolder,
											false,
										);
								setSelected(new Set());
								detailsRef.current?.removeAttribute('open');
							}}
						>
							Copy {selected.size || ''} to this image group
						</button>
					</div>
				</>
			)}
		</details>
	);
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
		transferGalleryImage,
	} = useEditor();
	const [collapsed, setCollapsed] = useState(false);
	const [compact, setCompact] = useState(true);
	const [cropEntryId, setCropEntryId] = useState<string | null>(null);
	const [pendingUpload, setPendingUpload] = useState<{
		files: File[];
		replaceEntryId?: string;
		replacingSample?: boolean;
	} | null>(null);
	if (!doc) return null;
	const entries = doc.galleries[folder] ?? [];
	const cropEntry = entries.find((entry) => entry.id === cropEntryId);
	const cropUrl = cropEntry
		? getAssetPreviewUrl(cropEntry.assetId) ??
			sampleArtworkUrl(cropEntry.sampleAssetId) ??
			PLACEHOLDER_IMAGE
		: undefined;
	const moveTargets = imageGroupTargets(doc).filter((target) => target.folder !== folder);
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
						<ImageDrop
							multiple
							onFiles={(files) => beginUpload(files)}
							onImageTransfer={(payload) =>
								transferGalleryImage(
									payload.sourceFolder,
									payload.entryId,
									folder,
									payload.sourceFolder === WORKBENCH_FOLDER ? false : payload.move,
								)
							}
						>
							<span>{addLabel}</span>
						</ImageDrop>
						<WorkbenchPicker targetFolder={folder} />
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
											const linkInvalid =
												!!entry.meta.link &&
												!isUrl(entry.meta.link) &&
												!entry.meta.link.startsWith('/') &&
												!entry.meta.link.startsWith('#');
											const linkRequired =
												entry.meta.clickAction === 'link' && !entry.meta.link.trim();
											const artworkName = entry.meta.title || entry.filename || `image ${idx + 1}`;
											const successor = sampleReplacement(entry.sampleAssetId);
											const artworkEffects = entry.meta.effects;
											const patchEffects = (
												patch: Partial<NonNullable<typeof artworkEffects>>,
											) => {
												const effects = { ...(artworkEffects ?? {}), ...patch };
												for (const key of Object.keys(effects) as Array<keyof typeof effects>)
													if (effects[key] === undefined) delete effects[key];
												updateGalleryMeta(folder, entry.id, {
													effects: Object.keys(effects).length ? effects : undefined,
												});
											};
											return (
											<SortableItem key={entry.id} id={entry.id}>
												{(handle) => (
													<div
														className={`card ${
															compact ? 'image-card-compact' : 'image-card-detailed'
														}`}
													>
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
												draggable={!entry.sampleAssetId}
												title={
													entry.sampleAssetId
														? undefined
														: 'Drag into another image group to move it'
												}
												onDragStart={
													entry.sampleAssetId
														? undefined
														: (event) =>
																writeImageTransfer(event.dataTransfer, {
																	sourceFolder: folder,
																	entryId: entry.id,
																	move: true,
																})
												}
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
																		<div className="artwork-crop-editor">
																			<div>
																				<strong>Crop photo</strong>
																				<small>
																					{entry.meta.cropAspect ? `${entry.meta.cropAspect} frame` : 'Original frame'}
																					{entry.meta.cropZoom && entry.meta.cropZoom > 1 ? ` · ${entry.meta.cropZoom.toFixed(2)}× zoom` : ''}
																				</small>
																			</div>
																			<button type="button" className="btn-secondary" onClick={() => setCropEntryId(entry.id)}>
																				Open crop lightbox…
																			</button>
																		</div>
																	<div className="artwork-effects-editor">
																		<div className="artwork-effects-heading">
																			<span>Artwork effects</span>
																			<div>
																				<button
																					type="button"
																					className="btn-link"
																					onClick={() =>
																						writeEffectClipboard({
																							kind: 'artwork',
																							effects: artworkEffects,
																						})
																					}
																				>
																					Copy
																				</button>
																				<button
																					type="button"
																					className="btn-link"
																					onClick={() => {
																						const copied = readEffectClipboard();
																						if (copied?.kind === 'artwork')
																							updateGalleryMeta(folder, entry.id, {
																								effects: copied.effects
																									? { ...copied.effects }
																									: undefined,
																							});
																						else alert('Copy effects from an artwork first.');
																					}}
																				>
																					Paste
																				</button>
																			</div>
																		</div>
																		<div className="artwork-effects-grid">
																			<label>
																				<span>Hanging</span>
																				<select
																					className="select-input"
																					value={
																						artworkEffects?.hang === true
																							? 'on'
																							: artworkEffects?.hang === false
																								? 'off'
																								: ''
																					}
																					onChange={(event) =>
																						patchEffects({
																							hang:
																								event.target.value === 'on'
																									? true
																									: event.target.value === 'off'
																										? false
																										: undefined,
																						})
																					}
																				>
																					<option value="">Use site/page setting</option>
																					<option value="on">Hang this artwork</option>
																					<option value="off">Keep this artwork straight</option>
																				</select>
																			</label>
																			<label>
																				<span>Mount</span>
																				<select
																					className="select-input"
																					value={artworkEffects?.mount ?? ''}
																					onChange={(event) =>
																						patchEffects({
																							mount: (event.target.value || undefined) as NonNullable<
																								typeof artworkEffects
																							>['mount'],
																						})
																					}
																				>
																					<option value="">None</option>
																					<option value="tape">Permanent tape</option>
																					<option value="nail">Nail</option>
																					<option value="hook">Picture hook</option>
																					<option value="frame">Physical frame</option>
																				</select>
																			</label>
																			<label>
																				<span>On hover</span>
																				<select
																					className="select-input"
																					value={artworkEffects?.hover ?? ''}
																					onChange={(event) =>
																						patchEffects({
																							hover: (event.target.value || undefined) as NonNullable<
																								typeof artworkEffects
																							>['hover'],
																						})
																					}
																				>
																					<option value="">Still</option>
																					<option value="lift">Lift</option>
																					<option value="tilt">Tilt</option>
																					<option value="zoom">Zoom</option>
																					<option value="mono">Mono to color</option>
																				</select>
																			</label>
																			<label>
																				<span>On arrival</span>
																				<select
																					className="select-input"
																					value={artworkEffects?.reveal ?? ''}
																					onChange={(event) =>
																						patchEffects({
																							reveal: (event.target.value || undefined) as NonNullable<
																								typeof artworkEffects
																							>['reveal'],
																						})
																					}
																				>
																					<option value="">Still</option>
																					<option value="fade">Fade</option>
																					<option value="rise">Rise</option>
																					<option value="wipe">Wipe</option>
																				</select>
																			</label>
																		</div>
																		<label className="motion-range compact artwork-skew-control">
																			<span>
																				Tilt
																				<output>{artworkEffects?.skew ?? 0}°</output>
																			</span>
																			<input
																				type="range"
																				min={-6}
																				max={6}
																				step={0.25}
																				value={artworkEffects?.skew ?? 0}
																				aria-label={`Hanging tilt for ${artworkName}`}
																				onChange={(event) => {
																					const skew = Number(event.target.value);
																					patchEffects({ skew: skew === 0 ? undefined : skew });
																				}}
																			/>
																		</label>
																		{(artworkEffects?.hover || artworkEffects?.reveal) && (
																			<label className="effect-phone-control">
																				<input
																					type="checkbox"
																					checked={artworkEffects.phone !== false}
																					onChange={(event) =>
																						patchEffects({
																							phone: event.target.checked ? undefined : false,
																						})
																					}
																				/>
																				Use on phones
																			</label>
																		)}
																		<small>Reduced-motion visitors automatically see a still version.</small>
																	</div>
																{variant === 'projects' && (
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
																)}
																<div className="image-click-editor">
																	<label className="image-description-field">
																		<span>When the image is clicked</span>
																		<select
																			className="select-input"
																			value={entry.meta.clickAction ?? 'lightbox'}
																			onChange={(event) =>
																				updateGalleryMeta(folder, entry.id, {
																					clickAction:
																						event.target.value === 'link'
																							? 'link'
																							: undefined,
																				})
																			}
																		>
																			<option value="lightbox">Open the full-size image</option>
																			<option value="link">Go to a link</option>
																		</select>
																	</label>
																	{(entry.meta.clickAction === 'link' || variant === 'projects') && (
																		<label className="image-description-field">
																			<span>
																				{entry.meta.clickAction === 'link'
																					? 'Where it goes'
																					: 'Project link in the full-size view (optional)'}
																			</span>
																			<input
																				className={`text-input ${
																					linkInvalid || linkRequired ? 'invalid' : ''
																				}`}
																				placeholder="https://… or /art"
																				value={entry.meta.link}
																				onChange={(event) =>
																					updateGalleryMeta(folder, entry.id, {
																						link: event.target.value,
																					})
																				}
																			/>
																			{(linkInvalid || linkRequired) && (
																				<span className="field-error">
																					Add a full web address, a site page such as /art, or a section such as #work.
																				</span>
																			)}
																		</label>
																	)}
																</div>
															</div>
														)}
														<div className="card-actions">
															<details className="image-card-actions-menu">
																<summary
																	aria-label={`More actions for ${artworkName}`}
																	title={`More actions for ${artworkName}`}
																>
																	•••
																</summary>
																<div className="image-card-actions-popover">
																	<label>
																		<span>Hanging</span>
																		<select
																			className="select-input"
																			aria-label={`Hanging for ${artworkName}`}
																			value={
																				artworkEffects?.hang === true
																					? 'on'
																					: artworkEffects?.hang === false
																						? 'off'
																						: ''
																			}
																			onChange={(event) =>
																				patchEffects({
																					hang:
																						event.target.value === 'on'
																							? true
																							: event.target.value === 'off'
																								? false
																								: undefined,
																				})
																			}
																		>
																			<option value="">Use site/page setting</option>
																			<option value="on">Hang this image</option>
																			<option value="off">Do not hang</option>
																		</select>
																	</label>
																	<label>
																		<span>Copy</span>
																		<select
																			className="select-input"
																			aria-label={`Copy ${artworkName} to another image group`}
																			defaultValue=""
																			onChange={(event) => {
																				const destination = event.target.value;
																				if (destination)
																					transferGalleryImage(
																						folder,
																						entry.id,
																						destination,
																						false,
																					);
																				event.target.value = '';
																			}}
																		>
																			<option value="">Copy to…</option>
																			<option value={WORKBENCH_FOLDER}>Image workbench</option>
																			{moveTargets.map((target) => (
																				<option key={target.folder} value={target.folder}>
																					{target.label}
																				</option>
																			))}
																		</select>
																	</label>
																	<label>
																		<span>Move</span>
																		<select
																			className="select-input"
																			aria-label={`Move ${artworkName} to another image group`}
																			defaultValue=""
																			onChange={(event) => {
																				const destination = event.target.value;
																				if (destination)
																					transferGalleryImage(
																						folder,
																						entry.id,
																						destination,
																						true,
																					);
																				event.target.value = '';
																			}}
																		>
																			<option value="">Move to…</option>
																			<option value={WORKBENCH_FOLDER}>Image workbench</option>
																			{moveTargets.map((target) => (
																				<option key={target.folder} value={target.folder}>
																					{target.label}
																				</option>
																			))}
																		</select>
																	</label>
																	<div className="image-card-order-actions">
																		<button
																			type="button"
																			className="btn-secondary"
																			disabled={idx === 0}
																			onClick={() => moveGalleryImage(folder, idx, idx - 1)}
																		>
																			↑ Earlier
																		</button>
																		<button
																			type="button"
																			className="btn-secondary"
																			disabled={idx === entries.length - 1}
																			onClick={() => moveGalleryImage(folder, idx, idx + 1)}
																		>
																			↓ Later
																		</button>
																	</div>
																	<button
																		type="button"
																		className="btn-ghost danger image-card-delete"
																		onClick={() => removeGalleryImage(folder, entry.id)}
																	>
																		Delete image
																	</button>
																</div>
															</details>
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
	const cropModal = cropEntry && cropUrl && (
		<ImageCropDialog
			src={cropUrl}
			name={cropEntry.meta.title || cropEntry.filename || 'photo'}
			initial={{
				aspect: cropEntry.meta.cropAspect,
				focusX: cropEntry.meta.focusX ?? 50,
				focusY: cropEntry.meta.focusY ?? 50,
				zoom: cropEntry.meta.cropZoom ?? 1,
			}}
			onClose={() => setCropEntryId(null)}
			onSave={(settings: ImageCropSettings) => {
				const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(settings.aspect ?? '');
				const ratio = match
					? Number(match[1]) / Number(match[2])
					: settings.naturalAspect;
				updateGalleryMeta(folder, cropEntry.id, {
					cropAspect: settings.aspect,
					cropZoom: settings.zoom > 1.001 ? settings.zoom : undefined,
					focusX: settings.focusX,
					focusY: settings.focusY,
					layout:
						cropEntry.meta.layout && ratio
							? { ...cropEntry.meta.layout, ar: ratio }
							: cropEntry.meta.layout,
				});
				setCropEntryId(null);
			}}
		/>
	);
	if (embedded)
		return (
			<>
				{body}
				{uploadModal}
				{cropModal}
			</>
		);
	return (
		<>
			<Section title={title ?? ''} action={<span className="count">{entries.length}</span>}>
				{body}
			</Section>
			{uploadModal}
			{cropModal}
		</>
	);
}
