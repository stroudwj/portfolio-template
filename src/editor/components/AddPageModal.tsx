import { useState } from 'react';
import { useEditor } from '../store';
import { Modal } from './ui/Modal';

const PAGE_TYPES = [
	{ id: 'blank', name: 'Blank page', description: 'An empty page with its own image group.' },
	{ id: 'artwork', name: 'Artwork project', description: 'Project fields for a single work.' },
	{ id: 'collaboration', name: 'Collaboration project', description: 'Project fields for work made together.' },
	{ id: 'exhibition', name: 'Exhibition project', description: 'Project fields for a show.' },
] as const;

type PageTypeId = (typeof PAGE_TYPES)[number]['id'];

/** The add-page chooser: a name, and (for top-level pages) what to start from.
 * Sub-pages always start blank, so the chooser collapses to just the name. */
export default function AddPageModal({
	parentKey,
	parentLabel,
	hidden = false,
	onClose,
}: {
	/** When set, the new page is created as a sub-page of this page. */
	parentKey?: string;
	parentLabel?: string;
	/** New top-level pages can start outside the site menu ("Not linked"). */
	hidden?: boolean;
	onClose: () => void;
}) {
	const { addPage, addChildPage } = useEditor();
	const [name, setName] = useState('');
	const [type, setType] = useState<PageTypeId>('blank');
	const forChild = !!parentKey;

	const submit = () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		if (parentKey) addChildPage(parentKey, trimmed);
		else addPage(trimmed, type === 'blank' ? undefined : type, hidden ? { hidden: true } : undefined);
		onClose();
	};

	return (
		<Modal
			title={forChild ? `Add a sub-page under ${parentLabel ?? parentKey}` : 'Add a page'}
			onClose={onClose}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="btn-primary" disabled={!name.trim()} onClick={submit}>
						Add page
					</button>
				</>
			}
		>
			<form
				className="add-page-form"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				{/* The visible primary lives in the modal footer, outside this form;
				    without a submit control inside, Enter in the name field would do
				    nothing (implicit submission needs one). */}
				<button type="submit" hidden aria-hidden="true" tabIndex={-1} />
				<label className="field">
					<span className="field-label">Page name</span>
					<input
						className="text-input"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={forChild ? 'Sketchbook' : 'Paintings'}
						autoFocus
					/>
					{hidden && (
						<span className="field-hint">
							This page starts outside the site menu — visitors reach it only by its link.
						</span>
					)}
				</label>
				{!forChild && (
					<fieldset className="add-page-types">
						<legend className="field-label">Start from</legend>
						{PAGE_TYPES.map((candidate) => (
							<label
								key={candidate.id}
								className={`add-page-type ${type === candidate.id ? 'selected' : ''}`}
							>
								<input
									type="radio"
									name="add-page-type"
									value={candidate.id}
									checked={type === candidate.id}
									onChange={() => setType(candidate.id)}
								/>
								<span>
									<strong>{candidate.name}</strong>
									<small>{candidate.description}</small>
								</span>
							</label>
						))}
						<p className="field-hint">
							Project pages begin with fields like year, medium, dimensions, collaborators, and
							exhibition history.
						</p>
					</fieldset>
				)}
			</form>
		</Modal>
	);
}
