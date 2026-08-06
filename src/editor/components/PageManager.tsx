import { useState } from 'react';
import { useEditor } from '../store';
import { HelpDisclosure } from './ui/controls';
import { SortableItem, SortableList, type DragHandleProps } from './ui/Sortable';
import { PanelIcon } from './ui/panel-icons';
import AddPageModal from './AddPageModal';
import PageSettingsModal from './PageSettingsModal';

interface SettingsRequest {
	pageKey: string;
	focusName?: boolean;
}

interface AddRequest {
	parentKey?: string;
	parentLabel?: string;
	hidden?: boolean;
}

/** One quiet page row: glyph + name, with reorder, settings, and delete
 * appearing on hover or keyboard focus. Click opens the page. */
function PageRow({
	pageKey,
	label,
	home,
	nested,
	draft,
	selected,
	handle,
	onOpen,
	onSettings,
	onDelete,
}: {
	pageKey: string;
	label: string;
	home: boolean;
	nested: boolean;
	draft: boolean;
	selected: boolean;
	handle: DragHandleProps;
	onOpen: (pageKey: string) => void;
	onSettings: (request: SettingsRequest) => void;
	onDelete: (pageKey: string, label: string) => void;
}) {
	const where = home ? 'the home page' : `${label} at /${pageKey}`;
	return (
		<div className={`pm-row ${selected ? 'selected' : ''} ${nested ? 'nested' : ''}`} role="listitem">
			<button
				type="button"
				className="pm-handle"
				ref={handle.setActivatorNodeRef}
				title="Drag to reorder"
				aria-label={`Reorder ${where}`}
				{...handle.attributes}
				{...handle.listeners}
			>
				<PanelIcon type="grip" />
			</button>
			<button
				type="button"
				className="pm-open"
				aria-label={`Edit ${where}`}
				aria-current={selected ? 'page' : undefined}
				onClick={() => onOpen(pageKey)}
			>
				<span className="pm-glyph" aria-hidden="true">
					<PanelIcon type={home ? 'home' : nested ? 'subpage' : 'page'} />
				</span>
				<span className="pm-name">{label}</span>
				{draft && (
					<span className="pm-chip" title="A private draft — left out when you publish">
						Draft
					</span>
				)}
			</button>
			<span className="pm-actions">
				<button
					type="button"
					className="pm-action"
					title="Page settings"
					aria-label={`Settings for ${where}`}
					onClick={() => onSettings({ pageKey })}
				>
					<PanelIcon type="settings" />
				</button>
				{!home && (
					<button
						type="button"
						className="pm-action pm-action-danger"
						title="Delete page"
						aria-label={`Delete ${where}`}
						onClick={() => onDelete(pageKey, label)}
					>
						<PanelIcon type="trash" />
					</button>
				)}
			</span>
		</div>
	);
}

/** The pages panel: a calm list first, everything else behind it. Pages in the
 * site menu and link-only pages sit in separate groups, sub-pages stay visibly
 * nested under their parent, and each row's affordances appear on hover. */
export default function PageManager({
	onEditPage,
	selectedPageKey,
}: {
	onEditPage: (pageKey: string) => void;
	selectedPageKey?: string | null;
}) {
	const editor = useEditor();
	const { doc, movePage } = editor;
	const [settings, setSettings] = useState<SettingsRequest | null>(null);
	const [adding, setAdding] = useState<AddRequest | null>(null);
	if (!doc) return null;

	const entries = doc.content.nav.map((item, navIndex) => ({ item, navIndex }));
	const linked = entries.filter(({ item }) => !item.hidden);
	const notLinked = entries.filter(({ item }) => !!item.hidden);

	const pageLabel = (pageKey: string): string => {
		const page = doc.content.pages[pageKey];
		const navItem = doc.content.nav.find((item) => (item.path || 'home') === pageKey);
		return page?.label || navItem?.label || (pageKey === 'home' ? 'Home' : 'Untitled page');
	};

	const deletePage = (pageKey: string, label: string) => {
		const extra = doc.content.pages[pageKey]?.children?.length ? ' and all of its sub-pages' : '';
		if (confirm(`Delete the “${label}” page${extra}? Its images will be removed too.`))
			editor.removePage(pageKey);
	};

	const settingsPage = settings ? doc.content.pages[settings.pageKey] : null;
	const settingsIsTopLevel =
		!!settings && doc.content.nav.some((item) => (item.path || 'home') === settings.pageKey);

	const renderGroup = (
		title: string,
		group: typeof entries,
		options: { hidden?: boolean; hint?: string },
	) => (
		<section className="page-group" aria-label={title}>
			<header className="page-group-head">
				<h3>
					{title}
					{options.hint && (
						<span className="page-group-info" title={options.hint}>
							<PanelIcon type="info" />
							<span className="sr-only">{options.hint}</span>
						</span>
					)}
				</h3>
				<button
					type="button"
					className="pm-action page-group-add"
					title="Add a page"
					aria-label={`Add a page to ${title}`}
					onClick={() => setAdding(options.hidden ? { hidden: true } : {})}
				>
					<PanelIcon type="plus" />
				</button>
			</header>
			<div className="page-group-list" role="list">
				<SortableList
					ids={group.map(({ item }) => item.path || 'home')}
					onReorder={(from, to) => movePage(group[from].navIndex, group[to].navIndex)}
				>
					{group.map(({ item }) => {
						const pageKey = item.path || 'home';
						const page = doc.content.pages[pageKey];
						if (!page) return null;
						const children = page.children ?? [];
						return (
							<SortableItem id={pageKey} key={pageKey}>
								{(handle) => (
									<>
										<PageRow
											pageKey={pageKey}
											label={pageLabel(pageKey)}
											home={pageKey === 'home'}
											nested={false}
											draft={!!page.draft}
											selected={selectedPageKey === pageKey}
											handle={handle}
											onOpen={onEditPage}
											onSettings={setSettings}
											onDelete={deletePage}
										/>
										{children.length > 0 && (
											<div
												className="pm-children"
												role="list"
												aria-label={`Sub-pages under ${pageLabel(pageKey)}`}
											>
												<SortableList
													ids={children}
													onReorder={(from, to) => editor.moveChildPage(pageKey, from, to)}
												>
													{children.map((childKey) => {
														const child = doc.content.pages[childKey];
														if (!child) return null;
														return (
															<SortableItem id={childKey} key={childKey}>
																{(childHandle) => (
																	<PageRow
																		pageKey={childKey}
																		label={child.label || childKey}
																		home={false}
																		nested
																		draft={!!child.draft}
																		selected={selectedPageKey === childKey}
																		handle={childHandle}
																		onOpen={onEditPage}
																		onSettings={setSettings}
																		onDelete={deletePage}
																	/>
																)}
															</SortableItem>
														);
													})}
												</SortableList>
											</div>
										)}
									</>
								)}
							</SortableItem>
						);
					})}
				</SortableList>
			</div>
		</section>
	);

	return (
		<div className="page-panel">
			<header className="page-panel-head">
				<h2>Pages</h2>
			</header>
			<HelpDisclosure label="How pages work">
				<p>
					Click a page to open it, and drag the dots to reorder. Each row’s settings hold its
					name, menu visibility, publishing, search, address, and sub-pages.
				</p>
			</HelpDisclosure>
			{renderGroup('Main menu', linked, {})}
			{notLinked.length > 0 &&
				renderGroup('Not linked', notLinked, {
					hidden: true,
					hint: 'These pages stay out of the site menu — visitors reach them only by their link.',
				})}
			{settings && settingsPage && (
				<PageSettingsModal
					pageKey={settings.pageKey}
					focusName={settings.focusName}
					onClose={() => setSettings(null)}
					onAddSubpage={
						settingsIsTopLevel
							? () => {
									const parentKey = settings.pageKey;
									setSettings(null);
									setAdding({ parentKey, parentLabel: pageLabel(parentKey) });
								}
							: undefined
					}
				/>
			)}
			{adding && (
				<AddPageModal
					parentKey={adding.parentKey}
					parentLabel={adding.parentLabel}
					hidden={adding.hidden}
					onClose={() => setAdding(null)}
				/>
			)}
		</div>
	);
}
