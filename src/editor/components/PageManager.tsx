import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { HelpDisclosure, Section } from './ui/controls';
import { SortableItem, SortableList, type DragHandleProps } from './ui/Sortable';
import AddPageButton from './AddPageButton';

function PageActionsMenu({
	pageKey,
	label,
	menuVisibilityAvailable,
	hidden = false,
}: {
	pageKey: string;
	label: string;
	menuVisibilityAvailable: boolean;
	hidden?: boolean;
}) {
	const editor = useEditor();
	const menuRef = useRef<HTMLDetailsElement>(null);
	const [menuPosition, setMenuPosition] = useState<{
		top?: number;
		bottom?: number;
		right: number;
		maxHeight: number;
		maxWidth: number;
	} | null>(null);
	const page = editor.doc?.content.pages[pageKey];

	const isHome = pageKey === 'home';
	const addressLabel = isHome ? 'the home page' : `${label} at /${pageKey}`;
	const closeMenu = () => menuRef.current?.removeAttribute('open');
	useEffect(() => {
		if (!menuPosition) return;
		const close = (event?: Event) => {
			if (
				event?.target instanceof Node &&
				menuRef.current?.contains(event.target) &&
				(event instanceof MouseEvent || event.type === 'scroll')
			) return;
			menuRef.current?.removeAttribute('open');
			setMenuPosition(null);
		};
		window.addEventListener('resize', close);
		window.addEventListener('scroll', close, true);
		window.addEventListener('mousedown', close);
		return () => {
			window.removeEventListener('resize', close);
			window.removeEventListener('scroll', close, true);
			window.removeEventListener('mousedown', close);
		};
	}, [menuPosition]);
	if (!page) return null;

	const positionMenu = () => {
		const menu = menuRef.current;
		if (!menu?.open) {
			setMenuPosition(null);
			return;
		}
		const toggle = menu.querySelector(':scope > summary');
		if (!(toggle instanceof HTMLElement)) return;
		const rect = toggle.getBoundingClientRect();
		const controlsRect = toggle.closest('.editor-controls')?.getBoundingClientRect();
		const gap = 6;
		const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
		const spaceAbove = rect.top - gap - 8;
		const openAbove = spaceBelow < 420 && spaceAbove > spaceBelow;
		const menuRightEdge = controlsRect ? controlsRect.right - 8 : rect.right;
		setMenuPosition({
			...(openAbove
				? { bottom: window.innerHeight - rect.top + gap }
				: { top: rect.bottom + gap }),
			right: Math.max(8, window.innerWidth - menuRightEdge),
			maxHeight: Math.max(220, openAbove ? spaceAbove : spaceBelow),
			maxWidth: Math.max(220, Math.min(300, (controlsRect?.width ?? window.innerWidth) - 16)),
		});
	};
	const deletePage = () => {
		const extra = page.children?.length ? ' and all of its sub-pages' : '';
		if (confirm(`Delete the “${label}” page${extra}? Its images will be removed too.`)) {
			closeMenu();
			editor.removePage(pageKey);
		}
	};
	const changeAddress = () => {
		const next = prompt(
			'Choose a short page address. Letters, numbers and dashes work best. Links inside this site will be updated, but any old link you already shared will stop working.',
			pageKey,
		);
		if (
			next?.trim() &&
			next.trim() !== pageKey &&
			confirm(`Change /${pageKey} to /${next.trim()}? Old links shared elsewhere will no longer work.`)
		) {
			closeMenu();
			editor.changePagePath(pageKey, next);
		}
	};

	return (
		<details className="page-actions-menu" ref={menuRef} onToggle={positionMenu}>
			<summary className="btn-icon page-actions-toggle" aria-label={`More options for ${addressLabel}`}>
				•••
			</summary>
			<div
				className="page-actions-popover"
				style={
					menuPosition
						? {
								top: menuPosition.top,
								bottom: menuPosition.bottom,
								right: menuPosition.right,
								maxHeight: menuPosition.maxHeight,
								maxWidth: menuPosition.maxWidth,
							}
						: undefined
				}
			>
				<div className="page-actions-heading">
					<strong>Page options</strong>
					<span>/{isHome ? '' : pageKey}</span>
				</div>
				<label className="check-row page-action-check">
					<input
						type="checkbox"
						aria-label={`Include ${addressLabel} when publishing`}
						checked={!page.draft}
						disabled={isHome}
						onChange={(event) => editor.setPageDraft(pageKey, !event.target.checked)}
					/>
					<span>
						<strong>Include when publishing</strong>
						<small>{isHome ? 'Your home page is always live.' : 'Turn this off to keep working privately.'}</small>
					</span>
				</label>
				{menuVisibilityAvailable && (
					<label className="check-row page-action-check">
						<input
							type="checkbox"
							aria-label={`Show ${addressLabel} in the site menu`}
							checked={!hidden}
							onChange={(event) => editor.setPageMenuVisibility(pageKey, event.target.checked)}
						/>
						<span>
							<strong>Show in site menu</strong>
							<small>Turn this off for a page shared only by its link.</small>
						</span>
					</label>
				)}
				<label className="check-row page-action-check">
					<input
						type="checkbox"
						aria-label={`Let search engines list ${addressLabel}`}
						checked={!page.noindex}
						onChange={(event) => editor.setPageNoindex(pageKey, !event.target.checked)}
					/>
					<span>
						<strong>List in search engines</strong>
						<small>The page still works by direct link when this is off.</small>
					</span>
				</label>
				<label className="field page-action-title">
					<span className="field-label">Browser and search title</span>
					<input
						className="text-input"
						aria-label={`Browser tab and search title for ${addressLabel}`}
						value={page.title}
						onChange={(event) => editor.setPageTitle(pageKey, event.target.value)}
					/>
					<span className="field-hint">Use {'{name}'} for your profile name.</span>
				</label>
				<div className="page-action-buttons">
					{!isHome && (
						<button type="button" className="btn-secondary" onClick={changeAddress}>
							Change address…
						</button>
					)}
					<button
						type="button"
						className="btn-secondary"
						onClick={() => {
							closeMenu();
							editor.duplicatePage(pageKey);
						}}
					>
						Make a draft copy
					</button>
					{!isHome && (
						<button type="button" className="btn-ghost danger" onClick={deletePage}>
							Delete page
						</button>
					)}
				</div>
			</div>
		</details>
	);
}

function PageRow({
	pageKey,
	label,
	selected,
	nested,
	menuVisibilityAvailable,
	hidden,
	handle,
	onEditPage,
}: {
	pageKey: string;
	label: string;
	selected: boolean;
	nested: boolean;
	menuVisibilityAvailable: boolean;
	hidden?: boolean;
	handle: DragHandleProps;
	onEditPage: (pageKey: string) => void;
}) {
	const editor = useEditor();
	const page = editor.doc?.content.pages[pageKey];
	if (!page) return null;
	const addressLabel = pageKey === 'home' ? 'the home page' : `${label} at /${pageKey}`;

	return (
		<article
			className={`page-manager-item ${selected ? 'selected' : ''} ${nested ? 'nested' : ''}`}
			role="listitem"
			aria-label={addressLabel}
			aria-current={selected ? 'page' : undefined}
		>
			<div className="page-manager-row">
				<button
					type="button"
					className="page-drag-handle"
					ref={handle.setActivatorNodeRef}
					title={`Drag ${label} to reorder`}
					aria-label={`Reorder ${addressLabel}`}
					{...handle.attributes}
					{...handle.listeners}
				>
					⠿
				</button>
				<button
					type="button"
					className="page-manager-edit"
					aria-label={`Edit ${addressLabel}`}
					onClick={() => onEditPage(pageKey)}
				>
					<strong>{label}</strong>
					<span>/{pageKey === 'home' ? '' : pageKey}</span>
				</button>
				<span className={`page-primary-status ${page.draft ? 'draft' : 'live'}`}>
					{page.draft ? 'Draft' : 'Live'}
				</span>
				<PageActionsMenu
					pageKey={pageKey}
					label={label}
					menuVisibilityAvailable={menuVisibilityAvailable}
					hidden={hidden}
				/>
			</div>
		</article>
	);
}

/** A compact, sortable overview of the pages in the site's main menu. */
export default function PageManager({
	onEditPage,
	selectedPageKey,
}: {
	onEditPage: (pageKey: string) => void;
	selectedPageKey?: string | null;
}) {
	const editor = useEditor();
	const { doc, movePage } = editor;
	const [addingChildTo, setAddingChildTo] = useState<string | null>(null);
	const [newChildName, setNewChildName] = useState('');
	if (!doc) return null;
	const finishAddingChild = () => {
		const name = newChildName.trim();
		if (!addingChildTo || !name) return;
		editor.addChildPage(addingChildTo, name);
		setAddingChildTo(null);
		setNewChildName('');
	};
	const cancelAddingChild = () => {
		setAddingChildTo(null);
		setNewChildName('');
	};

	const pages = doc.content.nav;
	const pageIds = pages.map((item) => item.path || 'home');

	return (
		<Section title="Pages">
			<HelpDisclosure label="How pages are organized">
				<p>Select a page to edit. Drag ⠿ to reorder it; use ••• for publishing, visibility, search, address, and delete. Sub-pages stay attached to their parent.</p>
			</HelpDisclosure>
			<div className="page-manager-list" role="list" aria-label="Pages in your site menu">
				<SortableList ids={pageIds} onReorder={movePage}>
					{pages.map((item) => {
						const pageKey = item.path || 'home';
						const page = doc.content.pages[pageKey];
						if (!page) return null;
						const label = page.label || item.label || (pageKey === 'home' ? 'Home' : 'Untitled page');
						const hasChildren = (page.children ?? []).length > 0;
						const childControl = addingChildTo === pageKey ? (
							<form
								className="page-subpage-create"
								onSubmit={(event) => {
									event.preventDefault();
									finishAddingChild();
								}}
							>
								<label htmlFor={`new-subpage-${pageKey}`}>New sub-page under {label}</label>
								<input
									id={`new-subpage-${pageKey}`}
									className="text-input"
									value={newChildName}
									onChange={(event) => setNewChildName(event.target.value)}
									placeholder="Sub-page name"
									autoFocus
								/>
								<div>
									<button type="submit" className="btn-primary" disabled={!newChildName.trim()}>
										Add to {label}
									</button>
									<button type="button" className="btn-ghost" onClick={cancelAddingChild}>Cancel</button>
								</div>
							</form>
						) : (
							<button
								type="button"
								className="btn-link page-add-subpage"
								onClick={() => {
									setAddingChildTo(pageKey);
									setNewChildName('');
								}}
							>
								＋ {hasChildren ? 'Add another sub-page' : `Add sub-page under ${label}`}
							</button>
						);

						return (
							<SortableItem id={pageKey} key={pageKey}>
								{(handle) => (
									<>
										<PageRow
											pageKey={pageKey}
											label={label}
											selected={selectedPageKey === pageKey}
											nested={false}
											menuVisibilityAvailable
											hidden={item.hidden}
											handle={handle}
											onEditPage={onEditPage}
										/>
										{hasChildren && (
											<details className="page-children-disclosure">
												<summary>
													<span>
														<strong>
															{page.children!.length} sub-page{page.children!.length === 1 ? '' : 's'}
														</strong>
														<small>Under {label}</small>
													</span>
													<span className="page-children-chevron" aria-hidden="true">⌄</span>
												</summary>
												<div
													className="page-children-list"
													role="list"
													aria-label={`Sub-pages under ${label}`}
												>
													<SortableList
														ids={page.children!}
														onReorder={(from, to) => editor.moveChildPage(pageKey, from, to)}
												>
													{page.children!.map((childKey) => {
														const child = doc.content.pages[childKey];
														if (!child) return null;
														return (
															<SortableItem id={childKey} key={childKey}>
																{(childHandle) => (
																	<PageRow
																		pageKey={childKey}
																		label={child.label || childKey}
																		selected={selectedPageKey === childKey}
																		nested
																		menuVisibilityAvailable={false}
																		handle={childHandle}
																		onEditPage={onEditPage}
																	/>
																)}
															</SortableItem>
														);
													})}
													</SortableList>
													{childControl}
												</div>
											</details>
										)}
										{!hasChildren && childControl}
									</>
								)}
							</SortableItem>
						);
					})}
				</SortableList>
			</div>
			<div className="page-manager-add"><AddPageButton /></div>
		</Section>
	);
}
