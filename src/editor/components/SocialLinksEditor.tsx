import { useEditor } from '../store';
import { Section } from './ui/controls';
import { SortableList, SortableItem } from './ui/Sortable';
import { isUrl } from '../lib/validation';

export function SocialLinksFields() {
	const { doc, addSocial, updateSocial, removeSocial, moveSocial } = useEditor();
	if (!doc) return null;
	const social = doc.content.social;
	const ids = social.map((_, i) => `s${i}`);

	return (
		<>
			<div className="about-subsection-head">
				<span className="field-label">Social links</span>
				<button type="button" className="btn-ghost" onClick={addSocial}>
					＋ Add link
				</button>
			</div>
			{social.length === 0 ? (
				<p className="muted about-empty-copy">Add links visitors can use to find your work elsewhere.</p>
			) : (
				<SortableList ids={ids} onReorder={moveSocial}>
					<div className="card-list">
						{social.map((s, i) => {
							const socialName = s.label.trim() || `social link ${i + 1}`;
							return (
								<SortableItem key={`s${i}`} id={`s${i}`}>
									{(handle) => (
										<div className="card row" role="group" aria-label={socialName}>
											<button
												type="button"
												className="drag-handle"
												ref={handle.setActivatorNodeRef}
												{...handle.attributes}
												{...handle.listeners}
												aria-label={`Drag ${socialName} to reorder`}
											>
												⠿
											</button>
											<input
												className="text-input"
												aria-label={`Name of ${socialName}`}
												placeholder="Label (e.g. Instagram)"
												value={s.label}
												onChange={(e) => updateSocial(i, { label: e.target.value })}
											/>
											<input
												className={`text-input ${s.url && !isUrl(s.url) ? 'invalid' : ''}`}
												aria-label={`Web address for ${socialName}`}
												placeholder="https://…"
												value={s.url}
												onChange={(e) => updateSocial(i, { url: e.target.value })}
											/>
											<button
												type="button"
												className="btn-icon danger"
												onClick={() => removeSocial(i)}
												aria-label={`Remove ${socialName}`}
											>
												✕
											</button>
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
}

export default function SocialLinksEditor() {
	return (
		<Section title="Social links" sectionKey="_social">
			<SocialLinksFields />
		</Section>
	);
}
