import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type DragEvent as ReactDragEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import { useEditor } from '../store';
import { getAssetPreviewUrl } from '../lib/assets';
import {
	imageGroupTargets,
	readImageTransfer,
	WORKBENCH_FOLDER,
	writeImageTransfer,
} from '../lib/image-transfer';
import { ImageDrop, filesFromDrop } from './ui/ImageDrop';
import { Section } from './ui/controls';
import {
	selectWorkbenchItem,
	selectWorkbenchRange,
	workbenchMarqueeBase,
} from '../lib/workbench-selection';
import { compressImage } from '../lib/compressImage';
import { isImageFile, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from '../lib/validation';

type WorkbenchView = 'grid' | 'list';
type Marquee = {
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
};

function PhotoAddIcon() {
	return (
		<svg viewBox="0 0 32 32" aria-hidden="true">
			<path d="M4.5 7.5h15a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z" />
			<path d="m4 21 5-5 4 4 3-3 6 5M17.5 4.5h12M23.5 0v9" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 7h16M9 3h6l1 4H8l1-4Zm-3 4 1 14h10l1-14M10 11v6m4-6v6" />
		</svg>
	);
}

/** A private, browser-saved image bucket with Finder-like folders and selection. */
export default function AssetWorkbench() {
	const {
		doc,
		addGalleryImages,
		createWorkbenchFolder,
		removeGalleryImage,
		transferGalleryImage,
		updateGalleryMeta,
	} = useEditor();
	const [view, setView] = useState<WorkbenchView>('grid');
	const [folder, setFolder] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [expanded, setExpanded] = useState(false);
	const [minimized, setMinimized] = useState(false);
	const [windowClosed, setWindowClosed] = useState(false);
	const [sectionCollapsed, setSectionCollapsed] = useState(true);
	const [marquee, setMarquee] = useState<Marquee | null>(null);
	const [gridDropOver, setGridDropOver] = useState(false);
	const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);
	const [dropStatus, setDropStatus] = useState<string | null>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const marqueeBase = useRef<Set<string>>(new Set());
	const marqueeRef = useRef<Marquee | null>(null);
	const selectionAnchor = useRef<string | null>(null);
	const draggedIds = useRef<string[]>([]);
	const entries = doc?.galleries[WORKBENCH_FOLDER] ?? [];
	const folders = useMemo(
		() =>
			[
				...new Set(
					[
						...(doc?.workbenchFolders ?? []),
						...entries.map((entry) => entry.meta.workbenchFolder?.trim()),
					].filter((value): value is string => !!value),
				),
			].sort((a, b) => a.localeCompare(b)),
		[doc?.workbenchFolders, entries],
	);
	const visible =
		folder === null
			? entries
			: entries.filter((entry) => (entry.meta.workbenchFolder?.trim() ?? '') === folder);
	const visibleIds = useMemo(() => visible.map((entry) => entry.id), [visible]);

	useEffect(() => {
		const available = new Set(entries.map((entry) => entry.id));
		setSelected((current) => {
			const next = new Set([...current].filter((id) => available.has(id)));
			return next.size === current.size ? current : next;
		});
		if (selectionAnchor.current && !available.has(selectionAnchor.current))
			selectionAnchor.current = null;
		setFocusedId((current) => (current && available.has(current) ? current : null));
	}, [entries]);
	useEffect(() => {
		if (!expanded) return;
		document.body.classList.add('workbench-lightbox-open');
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setExpanded(false);
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => {
			document.body.classList.remove('workbench-lightbox-open');
			window.removeEventListener('keydown', closeOnEscape);
		};
	}, [expanded]);
	useEffect(() => {
		if (sectionCollapsed || windowClosed) return;
		document.body.classList.add('workbench-window-open');
		return () => document.body.classList.remove('workbench-window-open');
	}, [sectionCollapsed, windowClosed]);
	if (!doc) return null;
	const targets = imageGroupTargets(doc);

	const allVisibleSelected =
		visible.length > 0 && visible.every((entry) => selected.has(entry.id));
	const selectedEntries = entries.filter((entry) => selected.has(entry.id));
	const activeWorkbenchFolder = folder && folder.length ? folder : undefined;
	const addFilesToWorkbench = (files: File[], targetFolder = activeWorkbenchFolder) =>
		addGalleryImages(
			WORKBENCH_FOLDER,
			files.map((file) => ({ file, alt: '', workbenchFolder: targetFolder })),
		);
	const assignFolder = (nextFolder: string | undefined) => {
		for (const entry of selectedEntries)
			updateGalleryMeta(WORKBENCH_FOLDER, entry.id, { workbenchFolder: nextFolder });
		setFolder(nextFolder ?? '');
	};
	const createFolder = () => {
		const name = window.prompt('Name this folder');
		const clean = name?.trim().slice(0, 80);
		if (!clean) return;
		createWorkbenchFolder(clean);
		if (selectedEntries.length) assignFolder(clean);
		else setFolder(clean);
	};
	const copySelected = (targetFolder: string) => {
		for (const entry of selectedEntries)
			transferGalleryImage(WORKBENCH_FOLDER, entry.id, targetFolder, false);
		setSelected(new Set());
	};
	const deleteSelected = () => {
		if (!selectedEntries.length) return;
		if (
			!window.confirm(
				`Remove ${selectedEntries.length} selected photo${selectedEntries.length === 1 ? '' : 's'} from the workbench?`,
			)
		)
			return;
		for (const entry of selectedEntries)
			removeGalleryImage(WORKBENCH_FOLDER, entry.id);
		selectionAnchor.current = null;
		setFocusedId(null);
		setSelected(new Set());
	};
	const prepareDroppedFiles = async (
		dataTransfer: DataTransfer,
		targetFolder: string | undefined,
	) => {
		setDropStatus('Preparing photos…');
		try {
			const dropped = await filesFromDrop(dataTransfer);
			const valid = dropped.filter(
				(file) => isImageFile(file) && file.size <= MAX_IMAGE_BYTES,
			);
			const rejected = dropped.length - valid.length;
			if (!valid.length) {
				setDropStatus(
					`No supported images found. Images must be under ${MAX_IMAGE_MB} MB.`,
				);
				return;
			}
			const ready: File[] = [];
			for (const file of valid) ready.push(await compressImage(file));
			addFilesToWorkbench(ready, targetFolder);
			setDropStatus(
				rejected
					? `${ready.length} added; ${rejected} unsupported file${rejected === 1 ? '' : 's'} skipped.`
					: `${ready.length} photo${ready.length === 1 ? '' : 's'} added.`,
			);
		} catch {
			setDropStatus('Those photos could not be prepared. Try the Photos button instead.');
		}
	};
	const moveDraggedPhotos = (targetFolder: string | undefined, entryId: string) => {
		const ids = draggedIds.current.includes(entryId) ? draggedIds.current : [entryId];
		for (const id of ids)
			updateGalleryMeta(WORKBENCH_FOLDER, id, { workbenchFolder: targetFolder });
		setSelected(new Set(ids));
		setFolder(targetFolder ?? '');
	};
	const dropIntoFolder = (
		event: ReactDragEvent<HTMLButtonElement>,
		targetFolder: string | undefined,
		smartCollection = false,
	) => {
		event.preventDefault();
		setFolderDropTarget(null);
		const payload = readImageTransfer(event.dataTransfer);
		if (payload?.sourceFolder === WORKBENCH_FOLDER) {
			if (smartCollection) {
				setFolder(null);
				return;
			}
			moveDraggedPhotos(targetFolder, payload.entryId);
			return;
		}
		void prepareDroppedFiles(event.dataTransfer, targetFolder);
	};
	const selectCard = (
		entryId: string,
		modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
	) => {
		setFocusedId(entryId);
		setSelected((current) => {
			if (modifiers.shiftKey) {
				const anchor = selectionAnchor.current ?? entryId;
				return selectWorkbenchRange(
					current,
					visibleIds,
					anchor,
					entryId,
					!!(modifiers.metaKey || modifiers.ctrlKey),
				);
			}
			selectionAnchor.current = entryId;
			return selectWorkbenchItem(current, entryId, modifiers);
		});
	};
	const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			setSelected(new Set(visibleIds));
			if (visibleIds.length) {
				selectionAnchor.current = visibleIds[0];
				setFocusedId(visibleIds[visibleIds.length - 1]);
			}
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			setSelected(new Set());
			selectionAnchor.current = null;
			return;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			deleteSelected();
			return;
		}
		const navigationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
		if (!navigationKeys.includes(event.key) || !visibleIds.length) return;
		event.preventDefault();
		const currentIndex = Math.max(0, visibleIds.indexOf(focusedId ?? ''));
		let nextIndex = currentIndex;
		if (event.key === 'Home') nextIndex = 0;
		else if (event.key === 'End') nextIndex = visibleIds.length - 1;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
			nextIndex = Math.max(0, currentIndex - 1);
		else nextIndex = Math.min(visibleIds.length - 1, currentIndex + 1);
		const nextId = visibleIds[nextIndex];
		selectCard(nextId, { shiftKey: event.shiftKey });
		requestAnimationFrame(() =>
			gridRef.current
				?.querySelector<HTMLElement>(`[data-workbench-id="${CSS.escape(nextId)}"]`)
				?.focus(),
		);
	};
	const gridPoint = (clientX: number, clientY: number) => {
		const grid = gridRef.current;
		if (!grid) return { x: 0, y: 0 };
		const bounds = grid.getBoundingClientRect();
		return {
			x: clientX - bounds.left + grid.scrollLeft,
			y: clientY - bounds.top + grid.scrollTop,
		};
	};
	const selectInsideMarquee = (next: Marquee) => {
		const grid = gridRef.current;
		if (!grid) return;
		const left = Math.min(next.startX, next.currentX);
		const right = Math.max(next.startX, next.currentX);
		const top = Math.min(next.startY, next.currentY);
		const bottom = Math.max(next.startY, next.currentY);
		const selection = new Set(marqueeBase.current);
		grid.querySelectorAll<HTMLElement>('[data-workbench-id]').forEach((card) => {
			const cardLeft = card.offsetLeft;
			const cardTop = card.offsetTop;
			const intersects =
				cardLeft + card.offsetWidth >= left &&
				cardLeft <= right &&
				cardTop + card.offsetHeight >= top &&
				cardTop <= bottom;
			if (intersects) selection.add(card.dataset.workbenchId ?? '');
		});
		selection.delete('');
		setSelected(selection);
	};
	const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || event.target !== event.currentTarget) return;
		event.preventDefault();
		const point = gridPoint(event.clientX, event.clientY);
		marqueeBase.current = workbenchMarqueeBase(selected, event);
		const next = {
			startX: point.x,
			startY: point.y,
			currentX: point.x,
			currentY: point.y,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		marqueeRef.current = next;
		setMarquee(next);
		selectInsideMarquee(next);
	};
	const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = marqueeRef.current;
		if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
		const point = gridPoint(event.clientX, event.clientY);
		const next = { ...current, currentX: point.x, currentY: point.y };
		marqueeRef.current = next;
		setMarquee(next);
		selectInsideMarquee(next);
	};
	const endMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
		marqueeRef.current = null;
		setMarquee(null);
	};
	const beginMouseMarquee = (event: ReactMouseEvent<HTMLDivElement>) => {
		if (
			marqueeRef.current ||
			event.button !== 0 ||
			event.target !== event.currentTarget
		)
			return;
		event.preventDefault();
		const point = gridPoint(event.clientX, event.clientY);
		marqueeBase.current = workbenchMarqueeBase(selected, event);
		const next = {
			startX: point.x,
			startY: point.y,
			currentX: point.x,
			currentY: point.y,
		};
		marqueeRef.current = next;
		setMarquee(next);
		selectInsideMarquee(next);
	};
	const moveMouseMarquee = (event: ReactMouseEvent<HTMLDivElement>) => {
		const current = marqueeRef.current;
		if (!current || (event.buttons & 1) !== 1) return;
		const point = gridPoint(event.clientX, event.clientY);
		const next = { ...current, currentX: point.x, currentY: point.y };
		marqueeRef.current = next;
		setMarquee(next);
		selectInsideMarquee(next);
	};
	const endMouseMarquee = () => {
		if (!marqueeRef.current) return;
		marqueeRef.current = null;
		setMarquee(null);
	};

	return (
		<Section
			title="Image workbench"
			sectionKey="_image-workbench"
			action={<span className="count">{entries.length}</span>}
			// Collapsed by default even when empty: the workbench sits above the page
			// list, and an expanded empty Finder window pushes the actual page editing
			// below the fold on every visit to Pages.
			defaultCollapsed
			onCollapsedChange={setSectionCollapsed}
		>
			{expanded && (
				<button
					type="button"
					className="workbench-lightbox-backdrop"
					aria-label="Close full-screen image workbench"
					onClick={() => setExpanded(false)}
				/>
			)}
			<p className="workbench-intro">
				Your private photo folder. Upload once, organize here, then copy or drag photos
				into any image group without finding the files again.
			</p>
			{windowClosed ? (
				<button
					type="button"
					className="workbench-reopen"
					onClick={() => setWindowClosed(false)}
				>
					<span aria-hidden="true">▰</span>
					Open the photo window
				</button>
			) : (
				<div
					className={`workbench-window${expanded ? ' workbench-fullscreen' : ''}${minimized ? ' workbench-minimized' : ''}`}
					role={expanded ? 'dialog' : undefined}
					aria-modal={expanded || undefined}
					aria-label={expanded ? 'Full-screen image workbench' : undefined}
				>
					<div className="workbench-window-bar">
						<div className="workbench-window-dots" role="group" aria-label="Photo window controls">
							<button
								type="button"
								className="workbench-dot workbench-dot-close"
								onClick={() => {
									setExpanded(false);
									setWindowClosed(true);
								}}
								aria-label="Close the photo window"
								title="Close the photo window"
							/>
							<button
								type="button"
								className="workbench-dot workbench-dot-minimize"
								onClick={() => {
									setExpanded(false);
									setMinimized((value) => !value);
								}}
								aria-label={minimized ? 'Restore the photo window' : 'Minimize the photo window'}
								title={minimized ? 'Restore the photo window' : 'Minimize the photo window'}
							/>
							<button
								type="button"
								className="workbench-dot workbench-dot-fullscreen"
								onClick={() => {
									setMinimized(false);
									setExpanded((value) => !value);
								}}
								aria-label={expanded ? 'Exit full screen' : 'Enter full screen'}
								title={expanded ? 'Exit full screen' : 'Enter full screen'}
							/>
						</div>
						<strong>{folder === null ? 'All photos' : folder || 'Unfiled'}</strong>
						<div className="workbench-window-tools">
							<div className="workbench-upload-control">
								<ImageDrop
									multiple
									ariaLabel="Upload more images to the workbench"
									onFiles={(files) => addFilesToWorkbench(files)}
								>
									<span>＋ Photos</span>
								</ImageDrop>
							</div>
							<div className="workbench-view-toggle" role="group" aria-label="Workbench appearance">
								<button
									type="button"
									className={view === 'grid' ? 'active' : ''}
									aria-pressed={view === 'grid'}
									onClick={() => setView('grid')}
									title="Icon view"
								>
									▦
								</button>
								<button
									type="button"
									className={view === 'list' ? 'active' : ''}
									aria-pressed={view === 'list'}
									onClick={() => setView('list')}
									title="List view"
								>
									☷
								</button>
							</div>
						</div>
					</div>
					{!minimized && <div className="workbench-browser">
						<nav className="workbench-folders" aria-label="Workbench folders">
							<button
								type="button"
								className={`${folder === null ? 'active' : ''}${folderDropTarget === '__all__' ? ' drop-target' : ''}`}
								onClick={() => setFolder(null)}
								onDragOver={(event) => {
									event.preventDefault();
									setFolderDropTarget('__all__');
								}}
								onDragLeave={() => setFolderDropTarget(null)}
								onDrop={(event) => dropIntoFolder(event, undefined, true)}
							>
								<span>▣</span> All photos <small>{entries.length}</small>
							</button>
							<button
								type="button"
								className={`${folder === '' ? 'active' : ''}${folderDropTarget === '__unfiled__' ? ' drop-target' : ''}`}
								onClick={() => setFolder('')}
								onDragOver={(event) => {
									event.preventDefault();
									setFolderDropTarget('__unfiled__');
								}}
								onDragLeave={() => setFolderDropTarget(null)}
								onDrop={(event) => dropIntoFolder(event, undefined)}
							>
								<span>▱</span> Unfiled{' '}
								<small>
									{entries.filter((entry) => !entry.meta.workbenchFolder?.trim()).length}
								</small>
							</button>
							{folders.map((name) => (
								<button
									type="button"
									key={name}
									className={`${folder === name ? 'active' : ''}${folderDropTarget === name ? ' drop-target' : ''}`}
									onClick={() => setFolder(name)}
									onDragOver={(event) => {
										event.preventDefault();
										setFolderDropTarget(name);
									}}
									onDragLeave={() => setFolderDropTarget(null)}
									onDrop={(event) => dropIntoFolder(event, name)}
								>
									<span>▰</span> {name}{' '}
									<small>
										{entries.filter((entry) => entry.meta.workbenchFolder === name).length}
									</small>
								</button>
							))}
						</nav>
						<div className="workbench-contents">
							<div className="workbench-select-row">
								<label>
									<input
										type="checkbox"
										checked={allVisibleSelected}
										onChange={() =>
											setSelected((current) => {
												const next = new Set(current);
												for (const entry of visible) {
													if (allVisibleSelected) next.delete(entry.id);
													else next.add(entry.id);
												}
												return next;
											})
										}
									/>
									Select all
								</label>
								<span>{selected.size ? `${selected.size} selected` : `${visible.length} items`}</span>
							</div>
							<small className="workbench-selection-hint">
								Shift selects a range. Command/Ctrl adds one item. Drag selected photos onto a folder.
							</small>
							<div
								ref={gridRef}
								className={`workbench-grid workbench-${view}${gridDropOver ? ' drop-over' : ''}${!visible.length ? ' is-empty' : ''}`}
								aria-label="Workbench images"
								role="listbox"
								aria-multiselectable="true"
								tabIndex={0}
								onKeyDown={handleGridKeyDown}
								onPointerDown={beginMarquee}
								onPointerMove={moveMarquee}
								onPointerUp={endMarquee}
								onPointerCancel={endMarquee}
								onMouseDown={beginMouseMarquee}
								onMouseMove={moveMouseMarquee}
								onMouseUp={endMouseMarquee}
								onDragOver={(event) => {
									event.preventDefault();
									setGridDropOver(true);
								}}
								onDragLeave={(event) => {
									if (!event.currentTarget.contains(event.relatedTarget as Node | null))
										setGridDropOver(false);
								}}
								onDrop={(event) => {
									setGridDropOver(false);
									if (event.defaultPrevented) return;
									event.preventDefault();
									const payload = readImageTransfer(event.dataTransfer);
									if (payload?.sourceFolder === WORKBENCH_FOLDER && folder !== null) {
										moveDraggedPhotos(activeWorkbenchFolder, payload.entryId);
										return;
									}
									if (!payload) void prepareDroppedFiles(event.dataTransfer, activeWorkbenchFolder);
								}}
							>
								{!visible.length && (
									<div className="workbench-empty">
										<PhotoAddIcon />
										<strong>{entries.length ? 'This folder is empty' : 'Empty workbench'}</strong>
										<span>Drop images here, or choose photos to add.</span>
										<ImageDrop
											multiple
											ariaLabel="Add images to this workbench folder"
											onFiles={(files) => addFilesToWorkbench(files)}
										>
											<span>＋ Choose photos</span>
										</ImageDrop>
									</div>
								)}
								{visible.map((entry, index) => {
									const name =
										entry.meta.title || entry.filename || `Image ${index + 1}`;
									return (
										<label
											className={`workbench-card ${selected.has(entry.id) ? 'selected' : ''}`}
											key={entry.id}
											data-workbench-id={entry.id}
											role="option"
											aria-selected={selected.has(entry.id)}
											tabIndex={focusedId === entry.id || (!focusedId && index === 0) ? 0 : -1}
											draggable
											onClick={(event) => {
												event.preventDefault();
												selectCard(entry.id, event);
											}}
											onFocus={() => setFocusedId(entry.id)}
											onKeyDown={(event) => {
												if (event.key !== ' ' && event.key !== 'Enter') return;
												event.preventDefault();
												event.stopPropagation();
												selectCard(entry.id, {
													shiftKey: event.shiftKey,
													metaKey: event.metaKey,
													ctrlKey: event.ctrlKey,
												});
											}}
											onDragStart={(event) => {
												const ids = selected.has(entry.id)
													? selectedEntries.map((item) => item.id)
													: [entry.id];
												draggedIds.current = ids;
												if (!selected.has(entry.id)) selectCard(entry.id, {});
												writeImageTransfer(event.dataTransfer, {
													sourceFolder: WORKBENCH_FOLDER,
													entryId: entry.id,
													move: false,
												});
											}}
											onDragEnd={() => {
												draggedIds.current = [];
												setFolderDropTarget(null);
												setGridDropOver(false);
											}}
										>
											<input
												type="checkbox"
												checked={selected.has(entry.id)}
												readOnly
												aria-label={`Select ${name}`}
											/>
											<img
												src={getAssetPreviewUrl(entry.assetId) ?? ''}
												alt=""
												draggable={false}
												title="Drag into a folder or image group"
											/>
											<span title={name}>{name}</span>
											{entry.meta.workbenchFolder && (
												<small>{entry.meta.workbenchFolder}</small>
											)}
										</label>
									);
								})}
								{marquee && (
									<div
										className="workbench-marquee"
										aria-hidden="true"
										style={{
											left: Math.min(marquee.startX, marquee.currentX),
											top: Math.min(marquee.startY, marquee.currentY),
											width: Math.abs(marquee.currentX - marquee.startX),
											height: Math.abs(marquee.currentY - marquee.startY),
										}}
									/>
								)}
							</div>
							{dropStatus && <small className="workbench-drop-status" role="status">{dropStatus}</small>}
						</div>
					</div>}
					{!minimized && <div className="workbench-actions">
						<span className="workbench-action-status">
							{selected.size
								? `${selected.size} selected`
								: `${visible.length} item${visible.length === 1 ? '' : 's'}`}
						</span>
						<button
							type="button"
							className="btn-secondary"
							onClick={createFolder}
							title={selected.size ? 'Put the selected photos in a new folder' : 'Create an empty folder'}
						>
							＋ Folder
						</button>
						<select
							className="select-input"
							aria-label="Move selected workbench images to a folder"
							value=""
							disabled={!selected.size}
							onChange={(event) => {
								const value = event.target.value;
								if (value === '__unfiled__') assignFolder(undefined);
								else if (value) assignFolder(value);
							}}
						>
							<option value="">Move…</option>
							<option value="__unfiled__">Unfiled</option>
							{folders.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
						<select
							className="select-input"
							aria-label="Copy selected workbench images to an image group"
							value=""
							disabled={!selected.size || !targets.length}
							onChange={(event) => {
								if (event.target.value) copySelected(event.target.value);
							}}
						>
							<option value="">Copy to group…</option>
							{targets.map((target) => (
								<option key={target.folder} value={target.folder}>
									{target.label}
								</option>
							))}
						</select>
						<button
							type="button"
							className="btn-ghost btn-icon danger workbench-trash"
							disabled={!selected.size}
							onClick={deleteSelected}
							aria-label="Move selected photos to trash"
							title="Move selected photos to trash"
						>
							<TrashIcon />
						</button>
					</div>}
				</div>
			)}
		</Section>
	);
}
