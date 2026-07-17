// The workhorse behind both ProjectsEditor and GalleryEditor: an ordered list of
// images with upload, delete, drag-reorder, and per-image metadata. `variant`
// controls how much metadata is shown.
import { useEditor } from '../store';
import { Section } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import { SortableList, SortableItem } from './ui/Sortable';
import { getAssetUrl } from '../lib/assets';
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
}

export default function ImageCollectionEditor({ folder, title, variant, addLabel, emptyLabel, embedded }: ImageCollectionEditorProps) {
	const { doc, addGalleryImages, removeGalleryImage, moveGalleryImage, updateGalleryMeta } = useEditor();
	if (!doc) return null;
	const entries = doc.galleries[folder] ?? [];

	const body = (
		<>
			<ImageDrop multiple onFiles={(files) => addGalleryImages(folder, files)}>
				<span>{addLabel}</span>
			</ImageDrop>

			{entries.length === 0 ? (
				<p className="muted">{emptyLabel}</p>
			) : (
				<SortableList ids={entries.map((e) => e.id)} onReorder={(f, t) => moveGalleryImage(folder, f, t)}>
					<div className="card-list">
						{entries.map((entry, idx) => {
							const url = getAssetUrl(entry.assetId) ?? PLACEHOLDER_IMAGE;
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
											<img className="card-thumb" src={url} alt="" />
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
