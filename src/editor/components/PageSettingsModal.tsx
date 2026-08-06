import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { Modal } from './ui/Modal';

/** Everything about one page that isn't its content: names, menu visibility,
 * publishing, search, address, and the page-level actions. Opened from the
 * settings button on a page row or in the page workspace header. */
export default function PageSettingsModal({
	pageKey,
	onClose,
	onAddSubpage,
	focusName = false,
}: {
	pageKey: string;
	onClose: () => void;
	/** Offered for top-level pages; opens the add-sub-page flow. */
	onAddSubpage?: () => void;
	/** Double-clicking a page name opens settings ready to rename. */
	focusName?: boolean;
}) {
	const editor = useEditor();
	const page = editor.doc?.content.pages[pageKey];
	const navItem = editor.doc?.content.nav.find((item) => (item.path || 'home') === pageKey);
	const isHome = pageKey === 'home';
	const isChild = !navItem;
	const [addressDraft, setAddressDraft] = useState(pageKey);
	const nameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!focusName) return;
		nameRef.current?.focus();
		nameRef.current?.select();
	}, [focusName]);

	if (!page) return null;
	const label = page.label || (isHome ? 'Home' : pageKey);
	const trimmedAddress = addressDraft.trim();

	const applyAddress = () => {
		if (!trimmedAddress || trimmedAddress === pageKey) return;
		onClose();
		editor.changePagePath(pageKey, trimmedAddress);
	};
	const deletePage = () => {
		const extra = page.children?.length ? ' and all of its sub-pages' : '';
		if (confirm(`Delete the “${label}” page${extra}? Its images will be removed too.`)) {
			onClose();
			editor.removePage(pageKey);
		}
	};

	return (
		<Modal title="Page settings" onClose={onClose}>
			<div className="page-settings">
				<p className="page-settings-where">{isHome ? 'Your home page' : `/${pageKey}`}</p>

				<section className="page-settings-group">
					<h3>Name</h3>
					<label className="field">
						<span className="field-label">Name in the site menu</span>
						<input
							ref={nameRef}
							className="text-input"
							value={page.label ?? ''}
							onChange={(event) => editor.renamePage(pageKey, event.target.value)}
						/>
					</label>
					<label className="field">
						<span className="field-label">Browser and search title</span>
						<input
							className="text-input"
							value={page.title}
							onChange={(event) => editor.setPageTitle(pageKey, event.target.value)}
						/>
						<span className="field-hint">Use {'{name}'} for your profile name.</span>
					</label>
				</section>

				<section className="page-settings-group">
					<h3>Visibility</h3>
					{!isChild && (
						<label className="check-row">
							<input
								type="checkbox"
								checked={!navItem?.hidden}
								onChange={(event) => editor.setPageMenuVisibility(pageKey, event.target.checked)}
							/>
							<span>
								<strong>Show in the site menu</strong>
								<small>Turned off, the page moves to “Not linked” — shared only by its link.</small>
							</span>
						</label>
					)}
					<label className="check-row">
						<input
							type="checkbox"
							checked={!page.draft}
							disabled={isHome}
							onChange={(event) => editor.setPageDraft(pageKey, !event.target.checked)}
						/>
						<span>
							<strong>Include when publishing</strong>
							<small>{isHome ? 'Your home page is always included.' : 'Turn this off to keep working privately.'}</small>
						</span>
					</label>
					<label className="check-row">
						<input
							type="checkbox"
							checked={!page.noindex}
							onChange={(event) => editor.setPageNoindex(pageKey, !event.target.checked)}
						/>
						<span>
							<strong>List in search engines</strong>
							<small>The page still works by direct link when this is off.</small>
						</span>
					</label>
				</section>

				{!isHome && (
					<section className="page-settings-group">
						<h3>Address</h3>
						<label className="field">
							<span className="field-label">Page address</span>
							<div className="page-settings-address-row">
								<span aria-hidden="true">/</span>
								<input
									className="text-input"
									value={addressDraft}
									onChange={(event) => setAddressDraft(event.target.value)}
									aria-label={`Page address for ${label}`}
								/>
								<button
									type="button"
									className="btn-secondary"
									disabled={!trimmedAddress || trimmedAddress === pageKey}
									onClick={applyAddress}
								>
									Change
								</button>
							</div>
							<span className="field-hint">
								Links inside this site update automatically; links you already shared elsewhere will
								stop working.
							</span>
						</label>
					</section>
				)}

				<section className="page-settings-group page-settings-actions">
					<h3>Actions</h3>
					{onAddSubpage && (
						<button type="button" className="btn-secondary" onClick={onAddSubpage}>
							Add a sub-page…
						</button>
					)}
					<button
						type="button"
						className="btn-secondary"
						onClick={() => {
							onClose();
							editor.duplicatePage(pageKey);
						}}
					>
						Make a draft copy
					</button>
					{!isHome && (
						<button type="button" className="btn-ghost danger" onClick={deletePage}>
							Delete page…
						</button>
					)}
				</section>
			</div>
		</Modal>
	);
}
