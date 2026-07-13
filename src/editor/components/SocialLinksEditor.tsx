import { useEditor } from '../store';
import { Section } from './ui/controls';
import { SortableList, SortableItem } from './ui/Sortable';
import { isUrl } from '../lib/validation';

export default function SocialLinksEditor() {
	const { doc, addSocial, updateSocial, removeSocial, moveSocial } = useEditor();
	if (!doc) return null;
	const social = doc.content.social;
	const ids = social.map((_, i) => `s${i}`);

	return (
		<Section
			title="Social links"
			action={
				<button type="button" className="btn-ghost" onClick={addSocial}>
					+ Add
				</button>
			}
		>
			{social.length === 0 ? (
				<p className="muted">No links yet.</p>
			) : (
				<SortableList ids={ids} onReorder={moveSocial}>
					<div className="card-list">
						{social.map((s, i) => (
							<SortableItem key={`s${i}`} id={`s${i}`}>
								{(handle) => (
									<div className="card row">
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
										<input
											className="text-input"
											placeholder="Label (e.g. Instagram)"
											value={s.label}
											onChange={(e) => updateSocial(i, { label: e.target.value })}
										/>
										<input
											className={`text-input ${s.url && !isUrl(s.url) ? 'invalid' : ''}`}
											placeholder="https://…"
											value={s.url}
											onChange={(e) => updateSocial(i, { url: e.target.value })}
										/>
										<button
											type="button"
											className="btn-icon danger"
											onClick={() => removeSocial(i)}
											aria-label="Remove"
										>
											✕
										</button>
									</div>
								)}
							</SortableItem>
						))}
					</div>
				</SortableList>
			)}
		</Section>
	);
}
