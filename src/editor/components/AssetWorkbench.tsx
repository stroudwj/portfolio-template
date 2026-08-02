import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import { useEditor } from '../store';
import { getAssetPreviewUrl } from '../lib/assets';
import {
	imageGroupTargets,
	WORKBENCH_FOLDER,
	writeImageTransfer,
} from '../lib/image-transfer';
import { ImageDrop } from './ui/ImageDrop';
import { Section } from './ui/controls';
import {
	selectWorkbenchItem,
	workbenchMarqueeBase,
} from '../lib/workbench-selection';

type WorkbenchView = 'grid' | 'list';
type Marquee = {
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
};

/** A private, browser-saved image bucket with Finder-like folders and selection. */
export default function AssetWorkbench() {
	const {
		doc,
		addGalleryImages,
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
	const gridRef = useRef<HTMLDivElement>(null);
	const marqueeBase = useRef<Set<string>>(new Set());
	const marqueeRef = useRef<Marquee | null>(null);
	const entries = doc?.galleries[WORKBENCH_FOLDER] ?? [];
	const folders = useMemo(
		() =>
			[
				...new Set(
					entries
						.map((entry) => entry.meta.workbenchFolder?.trim())
						.filter((value): value is string => !!value),
				),
			].sort((a, b) => a.localeCompare(b)),
		[entries],
	);
	const visible =
		folder === null
			? entries
			: entries.filter((entry) => (entry.meta.workbenchFolder?.trim() ?? '') === folder);

	useEffect(() => {
		const available = new Set(entries.map((entry) => entry.id));
		setSelected((current) => {
			const next = new Set([...current].filter((id) => available.has(id)));
			return next.size === current.size ? current : next;
		});
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
		if (sectionCollapsed || windowClosed || entries.length === 0) return;
		document.body.classList.add('workbench-window-open');
		return () => document.body.classList.remove('workbench-window-open');
	}, [entries.length, sectionCollapsed, windowClosed]);
	if (!doc) return null;
	const targets = imageGroupTargets(doc);

	const allVisibleSelected =
		visible.length > 0 && visible.every((entry) => selected.has(entry.id));
	const selectedEntries = entries.filter((entry) => selected.has(entry.id));
	const assignFolder = (nextFolder: string | undefined) => {
		for (const entry of selectedEntries)
			updateGalleryMeta(WORKBENCH_FOLDER, entry.id, { workbenchFolder: nextFolder });
		setFolder(nextFolder ?? '');
	};
	const createFolder = () => {
		if (!selectedEntries.length) return;
		const name = window.prompt('Name this folder');
		const clean = name?.trim().slice(0, 80);
		if (!clean) return;
		assignFolder(clean);
	};
	const copySelected = (targetFolder: string) => {
		for (const entry of selectedEntries)
			transferGalleryImage(WORKBENCH_FOLDER, entry.id, targetFolder, false);
		setSelected(new Set());
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
			defaultCollapsed={entries.length > 0}
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
			{entries.length === 0 ? (
				<>
					<ImageDrop
						multiple
						ariaLabel="Upload images to the workbench"
						onFiles={(files) =>
							addGalleryImages(
								WORKBENCH_FOLDER,
								files.map((file) => ({ file, alt: '' })),
							)
						}
					>
						<span>＋ Upload photos to workbench</span>
					</ImageDrop>
					<p className="muted">
						Your reusable photo folder is empty. Anything uploaded here stays private
						until you copy it to a page.
					</p>
				</>
			) : windowClosed ? (
				<button
					type="button"
					className="workbench-reopen"
					onClick={() => setWindowClosed(false)}
				>
					<span aria-hidden="true">▰</span>
					Open Finder
				</button>
			) : (
				<div
					className={`workbench-window${expanded ? ' workbench-fullscreen' : ''}${minimized ? ' workbench-minimized' : ''}`}
					role={expanded ? 'dialog' : undefined}
					aria-modal={expanded || undefined}
					aria-label={expanded ? 'Full-screen image workbench' : undefined}
				>
					<div className="workbench-window-bar">
						<div className="workbench-window-dots" role="group" aria-label="Finder window controls">
							<button
								type="button"
								className="workbench-dot workbench-dot-close"
								onClick={() => {
									setExpanded(false);
									setWindowClosed(true);
								}}
								aria-label="Close Finder"
								title="Close Finder"
							/>
							<button
								type="button"
								className="workbench-dot workbench-dot-minimize"
								onClick={() => {
									setExpanded(false);
									setMinimized((value) => !value);
								}}
								aria-label={minimized ? 'Restore Finder' : 'Minimize Finder'}
								title={minimized ? 'Restore Finder' : 'Minimize Finder'}
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
									onFiles={(files) =>
										addGalleryImages(
											WORKBENCH_FOLDER,
											files.map((file) => ({ file, alt: '' })),
										)
									}
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
								className={folder === null ? 'active' : ''}
								onClick={() => setFolder(null)}
							>
								<span>▣</span> All photos <small>{entries.length}</small>
							</button>
							<button
								type="button"
								className={folder === '' ? 'active' : ''}
								onClick={() => setFolder('')}
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
									className={folder === name ? 'active' : ''}
									onClick={() => setFolder(name)}
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
								Shift-click or Shift-drag to add to your selection.
							</small>
							<div
								ref={gridRef}
								className={`workbench-grid workbench-${view}`}
								aria-label="Workbench images"
								onPointerDown={beginMarquee}
								onPointerMove={moveMarquee}
								onPointerUp={endMarquee}
								onPointerCancel={endMarquee}
								onMouseDown={beginMouseMarquee}
								onMouseMove={moveMouseMarquee}
								onMouseUp={endMouseMarquee}
							>
								{visible.map((entry, index) => {
									const name =
										entry.meta.title || entry.filename || `Image ${index + 1}`;
									return (
										<label
											className={`workbench-card ${selected.has(entry.id) ? 'selected' : ''}`}
											key={entry.id}
											data-workbench-id={entry.id}
											onClick={(event) => {
												event.preventDefault();
												setSelected((current) =>
													selectWorkbenchItem(current, entry.id, event),
												);
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
												draggable
												title="Drag into an image group"
												onDragStart={(event) =>
													writeImageTransfer(event.dataTransfer, {
														sourceFolder: WORKBENCH_FOLDER,
														entryId: entry.id,
														move: false,
													})
												}
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
							disabled={!selected.size}
							onClick={createFolder}
							title="Group the selected photos in a new folder"
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
							className="btn-ghost danger"
							disabled={!selected.size}
							onClick={() => {
								if (
									!window.confirm(
										`Remove ${selected.size} selected photo${selected.size === 1 ? '' : 's'} from the workbench?`,
									)
								)
									return;
								for (const entry of selectedEntries)
									removeGalleryImage(WORKBENCH_FOLDER, entry.id);
								setSelected(new Set());
							}}
						>
							Trash
						</button>
					</div>}
				</div>
			)}
		</Section>
	);
}
