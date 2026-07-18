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
}

export default function ImageCollectionEditor({ folder, title, variant, addLabel, emptyLabel, embedded, hint }: ImageCollectionEditorProps) {
	const { doc, addGalleryImages, removeGalleryImage, moveGalleryImage, updateGalleryMeta } = useEditor();
	const [collapsed, setCollapsed] = useState(false);
	if (!doc) return null;
	const entries = doc.galleries[folder] ?? [];

	const body = (
		<>
			{entries.length > 0 && (
				<button
					type="button"
					className="collapse-toggle"
					onClick={() => setCollapsed((c) => !c)}
					aria-expanded={!collapsed}
				>
					<span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
					{entries.length} image{entries.length === 1 ? '' : 's'}
					{collapsed && <span className="collapse-note">— click to show</span>}
				</button>
			)}

			{(!collapsed || entries.length === 0) && (
				<>
					<ImageDrop multiple onFiles={(files) => addGalleryImages(folder, files)}>
						<span>{addLabel}</span>
					</ImageDrop>

					{entries.length === 0 ? (
						<p className="muted">{emptyLabel}</p>
					) : (
						<>
							<p className="muted">
								{hint ??
									'Arrange images in the live preview — drag one to move it, drag its corner handle to resize. ⠿ here sets the stacking: the top image sits in front when images overlap.'}
							</p>
							<SortableList ids={entries.map((e) => e.id)} onReorder={(f, t) => moveGalleryImage(folder, f, t)}>
								<div className="card-list">
									{entries.map((entry, idx) => {
										const url = getAssetPreviewUrl(entry.assetId) ?? PLACEHOLDER_IMAGE;
										const linkInvalid = entry.meta.link && !isUrl(entry.meta.link);
										return (
											<SortableItem key={entry.id} id={entry.id}>
												{(handle) => (
													<div className="card">
														<button
															type="button"
															className="drag-handle"
															ref={handle.setActivatorNodeRef}
															{...handle.attributes}
															{...handle.listeners}
															aria-label="Drag to reorder"
														>
															⠿
														</button>
														<div className="card-media">
															<img className="card-thumb" src={url} alt="" />
															<span className="card-filename" title={entry.filename}>
																{entry.filename}
															</span>
														</div>
														<div className="card-fields">
															<input
																className="text-input"
																placeholder="Title"
																value={entry.meta.title}
																onChange={(e) => updateGalleryMeta(folder, entry.id, { title: e.target.value })}
															/>
															{variant === 'projects' && (
																<>
																	<textarea
																		className="text-area"
																		rows={2}
																		placeholder="Description"
																		value={entry.meta.description}
																		onChange={(e) => updateGalleryMeta(folder, entry.id, { description: e.target.value })}
																	/>
																	<input
																		className={`text-input ${linkInvalid ? 'invalid' : ''}`}
																		placeholder="Link (https://…)"
																		value={entry.meta.link}
																		onChange={(e) => updateGalleryMeta(folder, entry.id, { link: e.target.value })}
																	/>
																</>
															)}
														</div>
														<div className="card-actions">
															<button
																type="button"
																className="btn-icon"
																disabled={idx === 0}
																onClick={() => moveGalleryImage(folder, idx, idx - 1)}
																aria-label="Move up"
															>
																↑
															</button>
															<button
																type="button"
																className="btn-icon"
																disabled={idx === entries.length - 1}
																onClick={() => moveGalleryImage(folder, idx, idx + 1)}
																aria-label="Move down"
															>
																↓
															</button>
															<button
																type="button"
																className="btn-icon danger"
																onClick={() => removeGalleryImage(folder, entry.id)}
																aria-label="Delete"
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

	if (embedded) return body;
	return (
		<Section title={title ?? ''} action={<span className="count">{entries.length}</span>}>
			{body}
		</Section>
	);
}
