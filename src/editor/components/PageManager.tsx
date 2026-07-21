import { useEditor } from '../store';
import { expandSection, Section, showEditorTab, showPreviewPage } from './ui/controls';
import AddPageButton from './AddPageButton';

/** A simple overview of the pages shown in the site's main menu. */
export default function PageManager() {
	const editor = useEditor();
	const { doc, movePage } = editor;
	if (!doc) return null;

	const pages = doc.content.nav;

	const openPage = (pageKey: string) => {
		showEditorTab('content');
		showPreviewPage(pageKey);
		expandSection(pageKey);
		requestAnimationFrame(() => {
			document
				.querySelector(`.editor-controls [data-section="${CSS.escape(pageKey)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	};

	const deletePage = (pageKey: string, label: string, hasChildren = false) => {
		const extra = hasChildren ? ' and all of its sub-pages' : '';
		if (confirm(`Delete the “${label}” page${extra}? Its images will be removed too.`)) editor.removePage(pageKey);
	};

	return (
		<Section title="Pages" sectionKey="_pages">
			<p className="muted">See your whole site at a glance. Copies start as drafts, so they cannot go live by accident.</p>
			<div className="page-manager-list" role="list" aria-label="Pages in your site menu">
				{pages.map((item, index) => {
					const pageKey = item.path || 'home';
					const page = doc.content.pages[pageKey];
					const label = page?.label || item.label || (pageKey === 'home' ? 'Home' : 'Untitled page');
					if (!page) return null;
					const addressLabel = pageKey === 'home' ? 'the home page' : `${label} at /${pageKey}`;

					return (
						<article className="page-manager-item" role="listitem" key={pageKey} aria-label={addressLabel}>
							<div className="page-manager-row">
								<div className="page-manager-name">
									<strong>{label}</strong>
									<div className="page-statuses" aria-label={`Status of ${addressLabel}`}>
										<span>{page.draft ? 'Draft — will not publish' : 'Will publish'}</span>
										<span>{item.hidden ? 'Hidden from menu' : 'Shown in menu'}</span>
										<span>{page.noindex ? 'Hidden from search' : 'Can appear in search'}</span>
									</div>
								</div>
								<button type="button" className="btn-secondary" aria-label={`Edit ${addressLabel}`} onClick={() => openPage(pageKey)}>
									Edit page
								</button>
								{pageKey !== 'home' && (
									<button
										type="button"
										className="btn-icon danger"
										aria-label={`Delete ${addressLabel}`}
										onClick={() => deletePage(pageKey, label, Boolean(page.children?.length))}
									>
										✕
									</button>
								)}
								<div className="block-controls" role="group" aria-label={`Change where ${addressLabel} appears in the site menu`}>
									<button type="button" className="btn-icon" disabled={index === 0} aria-label={`Move ${addressLabel} earlier in the site menu`} onClick={() => movePage(index, index - 1)}>↑</button>
									<button type="button" className="btn-icon" disabled={index === pages.length - 1} aria-label={`Move ${addressLabel} later in the site menu`} onClick={() => movePage(index, index + 1)}>↓</button>
								</div>
							</div>

							<details className="page-settings">
								<summary aria-label={`Settings for ${addressLabel}`}>Page settings</summary>
								<label className="field">
									<span className="field-label">Name in your site menu</span>
									<input className="text-input" aria-label={`Menu name for ${addressLabel}`} value={label} onChange={(event) => editor.renamePage(pageKey, event.target.value)} />
								</label>
								<label className="field">
									<span className="field-label">Browser tab and search title</span>
									<input className="text-input" aria-label={`Browser tab and search title for ${addressLabel}`} value={page.title} onChange={(event) => editor.setPageTitle(pageKey, event.target.value)} />
									<span className="field-hint">Use {'{name}'} wherever your name should appear.</span>
								</label>
								<div className="page-address-row">
									<span><strong>Page address</strong><br /><span className="muted">/{pageKey === 'home' ? '' : pageKey}</span></span>
									{pageKey !== 'home' && (
										<button
											type="button"
											className="btn-secondary"
											aria-label={`Change the web address for ${addressLabel}`}
											onClick={() => {
												const next = prompt('Choose a short page address. Letters, numbers and dashes work best. Links inside this site will be updated, but any old link you already shared will stop working.', pageKey);
												if (next?.trim() && next.trim() !== pageKey && confirm(`Change /${pageKey} to /${next.trim()}? Old links shared elsewhere will no longer work.`)) editor.changePagePath(pageKey, next);
											}}
										>
											Change…
										</button>
									)}
								</div>
								<label className="check-row">
									<input type="checkbox" aria-label={`Show ${addressLabel} in the site menu`} checked={!item.hidden} onChange={(event) => editor.setPageMenuVisibility(pageKey, event.target.checked)} />
									<span><strong>Show in site menu</strong><small>Turn this off for a page you only want to share by its link.</small></span>
								</label>
								<label className="check-row">
									<input type="checkbox" aria-label={`Include ${addressLabel} when publishing`} checked={!page.draft} disabled={pageKey === 'home'} onChange={(event) => editor.setPageDraft(pageKey, !event.target.checked)} />
									<span><strong>Include when I publish</strong><small>{pageKey === 'home' ? 'Your home page is always included.' : 'Turn this off to keep working privately.'}</small></span>
								</label>
								<label className="check-row">
									<input type="checkbox" aria-label={`Let search engines list ${addressLabel}`} checked={!page.noindex} onChange={(event) => editor.setPageNoindex(pageKey, !event.target.checked)} />
									<span><strong>Let search engines list this page</strong><small>The page can still be visited from its link when this is off.</small></span>
								</label>
								<button type="button" className="btn-secondary" aria-label={`Make a draft copy of ${addressLabel}`} onClick={() => editor.duplicatePage(pageKey)}>Make a draft copy</button>
							</details>

							{(page.children ?? []).length > 0 && (
								<div className="page-children-list" aria-label={`Sub-pages under ${label}`}>
									{page.children!.map((childKey) => {
										const child = doc.content.pages[childKey];
										if (!child) return null;
										return (
											<div className="page-child-summary" key={childKey}>
												<span>↳ {child.label || childKey}{child.draft ? ' · Draft' : ''}</span>
												<div className="page-child-actions">
													<button type="button" className="btn-link" aria-label={`Edit sub-page ${child.label || childKey} under ${label}`} onClick={() => openPage(childKey)}>Edit sub-page</button>
													<button
														type="button"
														className="btn-icon danger"
														aria-label={`Delete sub-page ${child.label || childKey} under ${label}`}
														onClick={() => deletePage(childKey, child.label || childKey, Boolean(child.children?.length))}
													>
														✕
													</button>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</article>
					);
				})}
			</div>
			<div className="page-manager-add"><AddPageButton /></div>
		</Section>
	);
}
