// Floating edit chrome rendered INSIDE the live preview document, beside the
// portfolio tree. The page itself is the editing surface: hovering a block
// outlines it with a type chip, selecting one raises a floating icon toolbar,
// each section ends in an "Add block" bar, and a Layers card lists the page's
// structure. Deep settings stay in the editing column — the pencil takes you
// there — so this layer holds only the controls that belong next to the work.
//
// It renders in the preview iframe's own React root, so the editor store
// context is NOT available here: the document, actions, and page data all
// arrive as props from PreviewPanel.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
	DndContext,
	closestCenter,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS as DndCss } from '@dnd-kit/utilities';
import type { EditorContextValue } from '../store';
import type { EditorDoc } from '../lib/types';
import type { ImageLayout, PageBlock } from '../../lib/content';
import { NEW_SECTION_ID, pageSections, sectionEditorColor } from '../../lib/pageSections';
import { embedKindForInput, embedSpec, type EmbedKind } from '../../portfolio/mediaEmbed';
import { DEFAULT_AR, flowMissing } from '../../portfolio/canvasLayout';
import { getAssetPreviewUrl } from '../lib/assets';
import { sampleArtworkUrl } from '../lib/sample-artwork';
import { BlockIcon, type BlockIconType } from './ui/block-icons';
import { PanelIcon } from './ui/panel-icons';
import {
	expandSection,
	onSelectPreviewBlock,
	revealEditorSection,
	showEditorTab,
} from './ui/controls';
import { RichTextToolbar } from './RichTextEditor';
import { richTextFromElement, richTextPlainText } from '../../lib/richText';

interface DocRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

interface PickerState {
	/** Section receiving the new block; the dock picker lets you switch it. */
	sectionId: string;
	/** Doc-coordinate anchor for section pickers; null = fixed under the dock. */
	anchor: DocRect | null;
	/** The "Image" choice asks where the picture comes from before adding. */
	imageSource?: boolean;
}

const EMBED_ICONS: Record<EmbedKind, BlockIconType> = {
	video: 'video',
	audio: 'audio',
	map: 'map',
};

const EMBED_LABELS: Record<EmbedKind, string> = {
	video: 'Video',
	audio: 'Music player',
	map: 'Map',
};

function embedKindOf(block: Extract<PageBlock, { type: 'embed' }>): EmbedKind {
	return embedSpec(block.url)?.kind ?? embedKindForInput(block.url) ?? block.kind ?? 'video';
}

function blockIconType(block: PageBlock): BlockIconType {
	switch (block.type) {
		case 'embed':
			return EMBED_ICONS[embedKindOf(block)];
		case 'gallery':
			return 'gallery';
		default:
			return block.type;
	}
}

function blockLabel(block: PageBlock): string {
	switch (block.type) {
		case 'text': {
			const words = block.text.trim().replace(/\s+/g, ' ');
			return words ? words.slice(0, 26) : 'Text';
		}
		case 'images':
			return block.name || 'Image group';
		case 'gallery':
			return 'Main gallery';
		case 'embed':
			return embedSpec(block.url)?.provider ?? EMBED_LABELS[embedKindOf(block)];
		case 'shots':
			return 'Scroll video';
		case 'button':
			return block.label?.trim() || 'Button';
		case 'divider':
			return 'Divider';
		case 'children':
			return 'Sub-pages';
		case 'about':
			return 'About';
		case 'contact':
			return 'Email button';
		case 'form':
			return 'Contact form';
		case 'products':
			return 'Products';
		case 'project':
			return 'Project details';
	}
}

/** The gallery folder an images/main-gallery block draws from, if any. */
function blockFolder(doc: EditorDoc, pageKey: string, block: PageBlock): string | undefined {
	return block.type === 'images'
		? block.gallery.folder
		: block.type === 'gallery'
			? doc.content.pages[pageKey]?.gallery?.folder
			: undefined;
}

type GalleryEntry = NonNullable<EditorDoc['galleries'][string]>[number];

const entryThumb = (entry: GalleryEntry): string | undefined =>
	getAssetPreviewUrl(entry.assetId) ?? sampleArtworkUrl(entry.sampleAssetId) ?? undefined;

const entryLabel = (entry: GalleryEntry, index: number): string =>
	entry.meta.title?.trim() || entry.filename || `Image ${index + 1}`;

/** First image of the gallery an images/main-gallery block shows, for Layers rows. */
function blockThumb(doc: EditorDoc, pageKey: string, block: PageBlock): string | undefined {
	const folder = blockFolder(doc, pageKey, block);
	if (!folder) return undefined;
	const first = doc.galleries[folder]?.[0];
	return first ? entryThumb(first) : undefined;
}

const boxStyle = (rect: DocRect): CSSProperties => ({
	top: rect.top,
	left: rect.left,
	width: rect.width,
	height: rect.height,
});

/** Layer-panel drag ids: `blk|<sectionId>|<blockId>` or `img|<folder>|<entryId>`. */
const parseLayerId = (raw: unknown) => {
	const [kind, scope, id] = String(raw).split('|');
	return { kind, scope, id };
};

/** One draggable row in the Layers card. The 5px activation distance keeps
 * plain clicks working; a real drag lifts the row. */
function SortableLayerRow({
	id,
	className,
	children,
}: {
	id: string;
	className?: string;
	children: ReactNode;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
	});
	return (
		<div
			ref={setNodeRef}
			className={`${className ?? ''}${isDragging ? ' pv-layer-dragging' : ''}`.trim()}
			style={{ transform: DndCss.Transform.toString(transform), transition }}
			{...attributes}
			{...listeners}
		>
			{children}
		</div>
	);
}

export default function PreviewEditLayer({
	doc,
	pageKey,
	editor,
	onEditBlock,
	inlineTextId,
	onInlineTextEdit,
	onInlineTextDone,
	onPickFromWorkbench,
}: {
	doc: EditorDoc;
	pageKey: string;
	editor: EditorContextValue;
	/** Open a block's full settings card in the editing column. */
	onEditBlock: (blockId: string) => void;
	/** The text block currently being edited in place, if any. */
	inlineTextId: string | null;
	/** Start editing a text block's words right on the page. */
	onInlineTextEdit: (blockId: string) => void;
	onInlineTextDone: () => void;
	/** Open the floating workbench picker aimed at a new block's folder. */
	onPickFromWorkbench: (folder: string) => void;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [frameDoc, setFrameDoc] = useState<Document | null>(null);
	const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
	const [hoverSectionId, setHoverSectionId] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [layersOpen, setLayersOpen] = useState(false);
	const [picker, setPicker] = useState<PickerState | null>(null);
	const [dragging, setDragging] = useState(false);
	const [, setMeasureTick] = useState(0);
	const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
	const [hoverEntry, setHoverEntry] = useState<{ blockId: string; entryId: string } | null>(null);
	const [flashSelector, setFlashSelector] = useState<string | null>(null);
	/** Hovering the site's own header or footer offers a way into their editors. */
	const [hoverChrome, setHoverChrome] = useState<'header' | 'footer' | null>(null);
	const [inlineToolbarHeight, setInlineToolbarHeight] = useState(132);
	const dndSensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);
	const pendingAddRef = useRef<ReadonlySet<string> | null>(null);
	/** Files picked for a solo "Image" add; they land in the block the add creates. */
	const pendingSoloFilesRef = useRef<File[] | null>(null);
	/** A solo "Image" add sourcing from the workbench opens the picker after. */
	const pendingWorkbenchRef = useRef(false);
	const soloFileInputRef = useRef<HTMLInputElement>(null);
	const flashTimerRef = useRef<number | null>(null);
	/** Stable handle for document-level listeners bound once per frame. */
	const onInlineTextDoneRef = useRef(onInlineTextDone);
	onInlineTextDoneRef.current = onInlineTextDone;

	const page = doc.content.pages[pageKey];
	const blocks = page?.blocks ?? [];
	const sections = page ? pageSections(page) : [];
	const blockById = new Map(blocks.map((block) => [block.id, block]));
	const hasAboutBlock = blocks.some((block) => block.type === 'about');

	// The layer renders into the preview iframe, where the editor's theme classes
	// and custom-appearance overrides don't reach. Copy the resolved chrome
	// tokens from the real editing column so every card matches the editor.
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		setFrameDoc(root.ownerDocument);
		const editorShell = document.querySelector('.editor');
		if (!editorShell) return;
		const styles = getComputedStyle(editorShell);
		for (const token of [
			'--paper',
			'--ink',
			'--ink-soft',
			'--klein',
			'--klein-dark',
			'--wall-1',
			'--wall-2',
			'--wall-3',
			'--error',
			'--focus-ring',
		]) {
			const value = styles.getPropertyValue(token);
			if (value) root.style.setProperty(token, value);
		}
		root.style.fontFamily = styles.fontFamily;
	}, []);

	// Hover follows the pointer through the portfolio tree; moving onto this
	// layer's own cards keeps the current target so toolbars stay reachable.
	useEffect(() => {
		if (!frameDoc) return;
		const over = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target || target.closest('.pv-layer')) return;
			const blockEl = target.closest('.preview-block-boundary[data-preview-block]');
			setHoverBlockId(blockEl?.getAttribute('data-preview-block')?.split('::', 1)[0] ?? null);
			const part = target.closest('[data-preview-part]')?.getAttribute('data-preview-part');
			setHoverSectionId(part?.startsWith('section:') ? part.slice('section:'.length) : null);
			setHoverChrome(
				target.closest('.navigation-shell, .header-logo-container')
					? 'header'
					: target.closest('footer.site-footer')
						? 'footer'
						: null,
			);
		};
		const clear = () => {
			setHoverBlockId(null);
			setHoverSectionId(null);
			setHoverChrome(null);
		};
		const down = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target) return;
			if (target.closest('.pv-layer')) return;
			setPicker(null);
			// A press anywhere off the words finishes in-place text editing.
			if (!target.closest('[data-inline-text-editor]')) onInlineTextDoneRef.current();
			if (!target.closest('[data-preview-block]')) setSelectedId(null);
			setDragging(true);
		};
		const up = () => setDragging(false);
		frameDoc.addEventListener('pointerover', over, true);
		frameDoc.addEventListener('pointerdown', down, true);
		frameDoc.addEventListener('pointerup', up, true);
		frameDoc.documentElement.addEventListener('pointerleave', clear);
		return () => {
			frameDoc.removeEventListener('pointerover', over, true);
			frameDoc.removeEventListener('pointerdown', down, true);
			frameDoc.removeEventListener('pointerup', up, true);
			frameDoc.documentElement.removeEventListener('pointerleave', clear);
		};
	}, [frameDoc]);

	// Double-clicking any text — in the page flow or pinned to a canvas — puts
	// the caret right there and starts editing in place.
	useEffect(() => {
		if (!frameDoc) return;
		const onDouble = (event: MouseEvent) => {
			const target = event.target as Element | null;
			if (!target || target.closest('.pv-layer')) return;
			if (target.closest('[data-inline-text-editor]')) return;
			const blockId = target
				.closest('[data-preview-block]')
				?.getAttribute('data-preview-block')
				?.split('::', 1)[0];
			if (!blockId) return;
			const block = doc.content.pages[pageKey]?.blocks?.find(
				(candidate) => candidate.id === blockId,
			);
			if (block?.type !== 'text') return;
			event.preventDefault();
			setSelectedId(blockId);
			onInlineTextEdit(blockId);
		};
		frameDoc.addEventListener('dblclick', onDouble, true);
		return () => frameDoc.removeEventListener('dblclick', onDouble, true);
	}, [frameDoc, doc, pageKey, onInlineTextEdit]);

	// Escape peels the layer back one step at a time: picker, layers, in-place
	// text editing (when focus already left the words), then the selection.
	useEffect(() => {
		if (!frameDoc) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			if (picker) setPicker(null);
			else if (layersOpen) setLayersOpen(false);
			else if (inlineTextId) onInlineTextDoneRef.current();
			else setSelectedId(null);
		};
		frameDoc.addEventListener('keydown', onKey);
		return () => frameDoc.removeEventListener('keydown', onKey);
	}, [frameDoc, picker, layersOpen, inlineTextId]);

	// Clicking a block in the preview (DeviceFrame broadcasts it) selects here too.
	useEffect(
		() =>
			onSelectPreviewBlock((selection) => {
				if (selection.pageKey !== pageKey) return;
				setSelectedId(selection.blockId);
			}),
		[pageKey],
	);

	// Layout shifts (images loading, drags, section resizes) move the anchors;
	// watching the document's size re-measures without polling. Scrolling keeps
	// doc-anchored pieces glued for free, but re-render lets the section card
	// clamp itself into the visible viewport.
	useEffect(() => {
		if (!frameDoc) return;
		const bump = () => setMeasureTick((tick) => tick + 1);
		const observer = new ResizeObserver(bump);
		observer.observe(frameDoc.documentElement);
		if (frameDoc.body) observer.observe(frameDoc.body);
		frameDoc.defaultView?.addEventListener('resize', bump);
		frameDoc.addEventListener('scroll', bump, { passive: true });
		return () => {
			observer.disconnect();
			frameDoc.defaultView?.removeEventListener('resize', bump);
			frameDoc.removeEventListener('scroll', bump);
		};
	}, [frameDoc]);

	// A block added from the picker gets selected once the store delivers it;
	// a solo "Image" add then drops the picked files straight into its gallery.
	useEffect(() => {
		const before = pendingAddRef.current;
		if (!before) return;
		const added = blocks.find((block) => !before.has(block.id));
		if (!added) return;
		pendingAddRef.current = null;
		const soloFiles = pendingSoloFilesRef.current;
		pendingSoloFilesRef.current = null;
		if (soloFiles?.length && added.type === 'images')
			editor.addGalleryImages(
				added.gallery.folder,
				soloFiles.map((file) => ({ file, alt: '' })),
			);
		if (pendingWorkbenchRef.current && added.type === 'images') {
			pendingWorkbenchRef.current = false;
			onPickFromWorkbench(added.gallery.folder);
		}
		setSelectedId(added.id);
		// A fresh text block goes straight into typing, Squarespace-style.
		if (added.type === 'text') onInlineTextEdit(added.id);
		requestAnimationFrame(() => {
			frameDoc
				?.querySelector(`.preview-block-boundary[data-preview-block="${CSS.escape(added.id)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	});

	useEffect(
		() => () => {
			if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
		},
		[],
	);

	// Closing the card mid-hover would otherwise leave the spotlight stranded.
	useEffect(() => {
		if (!layersOpen) setHoverEntry(null);
	}, [layersOpen]);

	if (!page) return null;

	const rectFor = (selector: string): DocRect | null => {
		const element = frameDoc?.querySelector(selector);
		const win = frameDoc?.defaultView;
		if (!element || !win) return null;
		const rect = element.getBoundingClientRect();
		if (!rect.width && !rect.height) return null;
		return {
			top: rect.top + win.scrollY,
			left: rect.left + win.scrollX,
			width: rect.width,
			height: rect.height,
		};
	};
	const blockRect = (blockId: string) =>
		rectFor(`.preview-block-boundary[data-preview-block="${CSS.escape(blockId)}"]`);
	/** Canvas-pinned blocks have no flow boundary; fall back to their canvas item. */
	const anyBlockRect = (blockId: string) =>
		blockRect(blockId) ?? rectFor(`[data-preview-block="${CSS.escape(blockId)}"]`);
	const sectionRect = (sectionId: string) =>
		rectFor(`[data-preview-part="${CSS.escape(`section:${sectionId}`)}"]`);
	const docWidth = frameDoc?.documentElement.clientWidth ?? 1100;
	const viewTop = frameDoc?.defaultView?.scrollY ?? 0;

	const scrollBlockIntoView = (blockId: string) => {
		frameDoc
			?.querySelector(
				`.preview-block-boundary[data-preview-block="${CSS.escape(blockId)}"], [data-preview-block="${CSS.escape(blockId)}"]`,
			)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	};

	const selectBlock = (blockId: string) => {
		setSelectedId(blockId);
		onEditBlock(blockId);
	};

	const removeBlock = (block: PageBlock) => {
		const label = blockLabel(block);
		if (!confirm(`Remove this ${label} block from ${page.label || pageKey}?`)) return;
		if (selectedId === block.id) setSelectedId(null);
		if (inlineTextId === block.id) onInlineTextDone();
		editor.removeBlock(pageKey, block.id);
	};

	const duplicateBlock = (block: PageBlock) => {
		pendingAddRef.current = new Set(blocks.map((candidate) => candidate.id));
		editor.duplicateBlock(pageKey, block.id);
	};

	const canDuplicate = (block: PageBlock) =>
		block.type !== 'about' && block.type !== 'children' && block.type !== 'gallery';

	const openPicker = (sectionId: string, anchor: DocRect | null) => {
		setPicker({ sectionId, anchor });
		setLayersOpen(false);
	};

	const addToSection = (add: (sectionId: string) => void) => {
		if (!picker) return;
		pendingAddRef.current = new Set(blocks.map((block) => block.id));
		add(picker.sectionId);
		setPicker(null);
	};

	/** A one-image group with no name reads as just "Image" — the group chrome
	 * only appears once a second image makes it a real group. */
	const displayLabel = (block: PageBlock): string => {
		if (block.type === 'images' && !block.name) {
			const folder = blockFolder(doc, pageKey, block);
			if ((folder ? doc.galleries[folder]?.length : 0) === 1) return 'Image';
		}
		return blockLabel(block);
	};

	const galleryEntries = (block: PageBlock): GalleryEntry[] => {
		const folder = blockFolder(doc, pageKey, block);
		return folder ? (doc.galleries[folder] ?? []) : [];
	};

	/** Preview element for one image inside a freeform canvas (grid galleries
	 * have no per-image markers; those fall back to the whole block). */
	const entrySelector = (entryId: string) =>
		`[data-canvas-selection-key="${CSS.escape(`image:${entryId}`)}"]`;
	const entryRect = (entryId: string) => rectFor(entrySelector(entryId));

	const locateEntry = (block: PageBlock, entryId: string) => {
		const target =
			frameDoc?.querySelector(entrySelector(entryId)) ??
			frameDoc?.querySelector(
				`.preview-block-boundary[data-preview-block="${CSS.escape(block.id)}"]`,
			);
		target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		const selector = frameDoc?.querySelector(entrySelector(entryId))
			? entrySelector(entryId)
			: `.preview-block-boundary[data-preview-block="${CSS.escape(block.id)}"]`;
		setFlashSelector(selector);
		if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
		flashTimerRef.current = window.setTimeout(() => setFlashSelector(null), 1300);
	};

	const toggleGroup = (blockId: string) =>
		setExpandedGroups((current) => {
			const next = new Set(current);
			if (next.has(blockId)) next.delete(blockId);
			else next.add(blockId);
			return next;
		});

	/** Freeform canvases stack by z (ties: earlier in the list sits in front), so
	 * the Layers rows list front-most first, like Photoshop. Grid and carousel
	 * groups read in display order. */
	const isFreeformBlock = (block: PageBlock): boolean =>
		block.type === 'images'
			? block.gallery.carousel !== true && block.gallery.layout !== 'grid'
			: block.type === 'gallery'
				? page.gallery?.layout !== 'grid'
				: false;
	const orderedEntries = (block: PageBlock): Array<{ entry: GalleryEntry; index: number }> => {
		const entries = galleryEntries(block);
		if (!isFreeformBlock(block)) return entries.map((entry, index) => ({ entry, index }));
		return entries
			.map((entry, index) => ({
				entry,
				index,
				z: entry.meta.layout?.z ?? entries.length - index,
			}))
			.sort((a, b) => b.z - a.z || a.index - b.index);
	};

	/** Rewrite every image's z so the given front-first order becomes real.
	 * Unplaced images get their automatic flow position baked in the same step. */
	const applyEntryOrder = (block: PageBlock, frontFirst: GalleryEntry[]) => {
		const folder = blockFolder(doc, pageKey, block);
		if (!folder) return;
		const entries = doc.galleries[folder] ?? [];
		const flowed = flowMissing(
			entries.map((entry) => ({
				layout: entry.meta.layout,
				ar: entry.meta.layout?.ar ?? DEFAULT_AR,
			})),
		);
		const layoutByEntry = new Map(
			entries.map((entry, index) => [entry.id, entry.meta.layout ?? flowed.get(index)]),
		);
		const layouts: Record<string, ImageLayout> = {};
		frontFirst.forEach((entry, position) => {
			const layout = layoutByEntry.get(entry.id);
			if (layout) layouts[entry.id] = { ...layout, z: frontFirst.length - position };
		});
		editor.setGalleryLayouts(folder, layouts);
	};

	const folderOfBlock = (blockId: string): string | undefined => {
		const block = blockById.get(blockId);
		return block ? blockFolder(doc, pageKey, block) : undefined;
	};

	/** One drag surface for the whole Layers card: blocks reorder within (or
	 * move between) sections; images reorder inside their group or transfer
	 * into another group when dropped on it. */
	const onLayersDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const from = parseLayerId(active.id);
		const to = parseLayerId(over.id);
		if (from.kind === 'blk') {
			if (to.kind === 'blk' && to.scope === from.scope) {
				const section = sections.find((candidate) => candidate.id === from.scope);
				if (!section) return;
				const fromIndex = section.blockIds.indexOf(from.id);
				const toIndex = section.blockIds.indexOf(to.id);
				if (fromIndex >= 0 && toIndex >= 0)
					editor.moveBlockInSection(pageKey, section.id, fromIndex, toIndex);
			} else if (to.kind === 'blk' && to.scope !== from.scope) {
				editor.moveBlockToSection(pageKey, from.id, to.scope);
			}
			return;
		}
		if (from.kind !== 'img') return;
		if (to.kind === 'img' && to.scope === from.scope) {
			const block = blocks.find((candidate) => blockFolder(doc, pageKey, candidate) === from.scope);
			if (!block) return;
			const ordered = orderedEntries(block).map(({ entry }) => entry);
			const fromIndex = ordered.findIndex((entry) => entry.id === from.id);
			const toIndex = ordered.findIndex((entry) => entry.id === to.id);
			if (fromIndex < 0 || toIndex < 0) return;
			if (isFreeformBlock(block)) {
				const next = [...ordered];
				const [moved] = next.splice(fromIndex, 1);
				next.splice(toIndex, 0, moved);
				applyEntryOrder(block, next);
			} else {
				editor.moveGalleryImage(from.scope, fromIndex, toIndex);
			}
			return;
		}
		// Dropped on another group (its row or one of its images): move it there.
		const targetFolder =
			to.kind === 'img' ? to.scope : to.kind === 'blk' ? folderOfBlock(to.id) : undefined;
		if (targetFolder && targetFolder !== from.scope)
			editor.transferGalleryImage(from.scope, from.id, targetFolder, true);
	};

	const selectedBlock =
		selectedId && selectedId !== inlineTextId ? blockById.get(selectedId) : undefined;
	const selectedRect = selectedBlock ? blockRect(selectedBlock.id) : null;
	const hoverBlock =
		!dragging && hoverBlockId && hoverBlockId !== selectedId && hoverBlockId !== inlineTextId
			? blockById.get(hoverBlockId)
			: undefined;
	const hoverRect = hoverBlock ? blockRect(hoverBlock.id) : null;
	const hoverSection = sections.find((section) => section.id === hoverSectionId);
	const hoverSectionRect = !dragging && hoverSection ? sectionRect(hoverSection.id) : null;
	const hoverSectionIndex = hoverSection
		? sections.findIndex((section) => section.id === hoverSection.id)
		: -1;
	const selectedSection = selectedBlock
		? sections.find((section) => section.blockIds.includes(selectedBlock.id))
		: undefined;
	const selectedPosition =
		selectedBlock && selectedSection ? selectedSection.blockIds.indexOf(selectedBlock.id) : -1;
	const inlineTextBlock =
		inlineTextId && blockById.get(inlineTextId)?.type === 'text'
			? (blockById.get(inlineTextId) as Extract<PageBlock, { type: 'text' }>)
			: undefined;
	const inlineTextRect = inlineTextBlock ? anyBlockRect(inlineTextBlock.id) : null;
	const inlineEditorElement = () =>
		(frameDoc?.querySelector('[data-inline-text-editor]') as HTMLElement | null) ?? null;

	/** Jump the editing column to a Site card (header/footer) and reveal it. */
	const revealSiteSection = (sectionKey: string) => {
		expandSection(sectionKey);
		requestAnimationFrame(() => {
			document
				.querySelector(`[data-section="${CSS.escape(sectionKey)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	};
	/** Toolbar commands mutate the live editable; reparse and store the result.
	 * (The editable's own input event does the same — the writes are identical.) */
	const emitInlineText = () => {
		const element = inlineEditorElement();
		if (!element || !inlineTextBlock) return;
		const next = richTextFromElement(element);
		editor.updateRichTextBlock(pageKey, inlineTextBlock.id, richTextPlainText(next), next);
	};

	/** "Image" opens the file dialog first (needs the click's user activation),
	 * then creates the block once files are actually chosen — cancelling adds
	 * nothing. The picked files ride pendingSoloFilesRef into the add effect. */
	const beginSoloImageAdd = () => {
		const input = soloFileInputRef.current;
		if (!input || !picker) return;
		const sectionId = picker.sectionId;
		// The block is only created after files are chosen; until then no add is
		// pending (addToSection optimistically marked one for the plain choices).
		pendingAddRef.current = null;
		input.onchange = () => {
			const files = Array.from(input.files ?? []);
			input.value = '';
			if (!files.length) return;
			pendingSoloFilesRef.current = files;
			pendingAddRef.current = new Set(blocks.map((block) => block.id));
			editor.addImagesBlock(pageKey, sectionId);
		};
		input.click();
		setPicker(null);
	};

	const pickerBlockChoices: Array<{
		icon: BlockIconType;
		label: string;
		add: (sectionId: string) => void;
		group: 'Essentials' | 'Portfolio';
		/** Opens the image-source question instead of adding right away. */
		sourceStep?: true;
	}> = [
		{
			icon: 'text',
			label: 'Text',
			group: 'Essentials',
			add: (s) => editor.addTextBlock(pageKey, s),
		},
		{
			icon: 'images',
			label: 'Image',
			group: 'Essentials',
			// Ask where the picture comes from before anything is created.
			sourceStep: true,
			add: () => {},
		},
		{ icon: 'gallery', label: 'Image group', group: 'Essentials', add: (s) => editor.addImagesBlock(pageKey, s) },
		{ icon: 'video', label: 'Video', group: 'Essentials', add: (s) => editor.addEmbedBlock(pageKey, 'video', s) },
		{ icon: 'shots', label: 'Scroll video', group: 'Essentials', add: (s) => editor.addShotsBlock(pageKey, s) },
		{ icon: 'audio', label: 'Music player', group: 'Essentials', add: (s) => editor.addEmbedBlock(pageKey, 'audio', s) },
		{ icon: 'map', label: 'Google Map', group: 'Essentials', add: (s) => editor.addEmbedBlock(pageKey, 'map', s) },
		{ icon: 'button', label: 'Button', group: 'Essentials', add: (s) => editor.addButtonBlock(pageKey, s) },
		{ icon: 'divider', label: 'Divider', group: 'Essentials', add: (s) => editor.addDividerBlock(pageKey, s) },
		...(hasAboutBlock
			? []
			: [{
					icon: 'about' as const,
					label: 'About content',
					group: 'Portfolio' as const,
					add: (s: string) => editor.addAboutBlock(pageKey, s),
				}]),
		{ icon: 'contact', label: 'Email button', group: 'Portfolio', add: (s) => editor.addContactBlock(pageKey, s) },
		{ icon: 'form', label: 'Contact form', group: 'Portfolio', add: (s) => editor.addFormBlock(pageKey, s) },
		{ icon: 'project', label: 'Project fields', group: 'Portfolio', add: (s) => editor.addProjectBlock(pageKey, s) },
		{
			icon: 'products',
			label: doc.content.store ? 'Products' : 'Set up products…',
			group: 'Portfolio',
			add: (s) => {
				if (doc.content.store) editor.addProductsBlock(pageKey, s);
				else showEditorTab('store');
			},
		},
	];

	const pickerCard = picker && (
		<div
			className={`pv-ui pv-picker${picker.anchor ? '' : ' pv-picker-docked'}`}
			role="dialog"
			aria-label="Add a block"
			style={
				picker.anchor
					? {
							top: picker.anchor.top + picker.anchor.height + 10,
							left: Math.max(12, Math.min(picker.anchor.left + picker.anchor.width / 2 - 150, docWidth - 312)),
						}
					: undefined
			}
		>
			<header className="pv-card-head">
				<strong>{picker.sectionId === NEW_SECTION_ID ? 'Add a section' : 'Add a block'}</strong>
				<button
					type="button"
					className="pv-icon-button"
					aria-label="Close the block menu"
					title="Close"
					onClick={() => setPicker(null)}
				>
					<PanelIcon type="close" />
				</button>
			</header>
			{picker.sectionId === NEW_SECTION_ID ? (
				<p className="pv-picker-note">A new section starts with the block you pick.</p>
			) : (
				sections.length > 1 && (
					<label className="pv-picker-target">
						<span>Into</span>
						<select
							className="select-input"
							value={picker.sectionId}
							onChange={(event) => setPicker({ ...picker, sectionId: event.target.value })}
						>
							{sections.map((section, index) => (
								<option key={section.id} value={section.id}>
									Section {index + 1} — {section.name}
								</option>
							))}
						</select>
					</label>
				)
			)}
			{picker.imageSource ? (
				<div className="pv-picker-source" role="group" aria-label="Where does the image come from?">
					<button type="button" onClick={() => beginSoloImageAdd()}>
						<PanelIcon type="publish" />
						<span>
							<strong>Upload</strong>
							<small>Pick a file from this computer</small>
						</span>
					</button>
					<button
						type="button"
						onClick={() => {
							if (!picker) return;
							pendingWorkbenchRef.current = true;
							pendingAddRef.current = new Set(blocks.map((block) => block.id));
							editor.addImagesBlock(pageKey, picker.sectionId);
							setPicker(null);
						}}
					>
						<PanelIcon type="layers" />
						<span>
							<strong>From the workbench</strong>
							<small>Reuse a photo you already organized</small>
						</span>
					</button>
				</div>
			) : (
				(['Essentials', 'Portfolio'] as const).map((group) => (
					<div key={group}>
						<span className="pv-picker-group">{group}</span>
						<div className="pv-picker-grid">
							{pickerBlockChoices
								.filter((choice) => choice.group === group)
								.map((choice) => (
									<button
										key={choice.label}
										type="button"
										onClick={() =>
											choice.sourceStep
												? setPicker((current) =>
														current ? { ...current, imageSource: true } : current,
													)
												: addToSection(choice.add)
										}
									>
										<BlockIcon type={choice.icon} />
										{choice.label}
									</button>
								))}
						</div>
					</div>
				))
			)}
		</div>
	);

	return (
		<div className="pv-layer" ref={rootRef}>
			{/* Hovered block: quiet outline + a type chip, Squarespace-style. */}
			{hoverRect && hoverBlock && (
				<div className="pv-outline pv-outline-hover" style={boxStyle(hoverRect)}>
					<span className="pv-chip">{displayLabel(hoverBlock)}</span>
				</div>
			)}

			{/* Hovering an image row in Layers spotlights that image on the page. */}
			{hoverEntry &&
				(() => {
					const rect = entryRect(hoverEntry.entryId);
					return rect ? (
						<div className="pv-outline pv-outline-selected" style={boxStyle(rect)} />
					) : null;
				})()}

			{/* Click-to-locate pulse from the Layers card. */}
			{flashSelector &&
				(() => {
					const rect = rectFor(flashSelector);
					return rect ? (
						<div className="pv-outline pv-outline-flash" style={boxStyle(rect)} />
					) : null;
				})()}

			{/* Hovered section: boundary line, floating section card, add bar. */}
			{hoverSectionRect && hoverSection && (
				<>
					<div
						className="pv-outline pv-outline-section"
						style={{
							...boxStyle(hoverSectionRect),
							'--pv-section-accent': sectionEditorColor(hoverSection, hoverSectionIndex),
						} as CSSProperties}
					/>
					<div
						className="pv-ui pv-section-card"
						style={{
							// Tall sections scroll their top edge away; the card stays in view,
							// pinned below the dock, for as long as the section is hovered.
							top: Math.min(
								Math.max(hoverSectionRect.top + 12, viewTop + 56),
								hoverSectionRect.top + hoverSectionRect.height - 76,
							),
							left: Math.max(12, hoverSectionRect.left + hoverSectionRect.width - 172),
						}}
					>
						<button
							type="button"
							className="pv-card-row"
							title="Open this section's settings in the editing column"
							onClick={() => revealEditorSection(pageKey, hoverSection.id)}
						>
							<PanelIcon type="pencil" />
							Edit section
						</button>
						<div className="pv-card-row pv-card-row-icons" role="group" aria-label={`Reorder ${hoverSection.name}`}>
							<button
								type="button"
								className="pv-icon-button"
								disabled={hoverSectionIndex <= 0}
								title="Move this section earlier"
								aria-label={`Move ${hoverSection.name} earlier`}
								onClick={() => editor.moveSection(pageKey, hoverSectionIndex, hoverSectionIndex - 1)}
							>
								<PanelIcon type="up" />
							</button>
							<button
								type="button"
								className="pv-icon-button"
								disabled={hoverSectionIndex === sections.length - 1}
								title="Move this section later"
								aria-label={`Move ${hoverSection.name} later`}
								onClick={() => editor.moveSection(pageKey, hoverSectionIndex, hoverSectionIndex + 1)}
							>
								<PanelIcon type="down" />
							</button>
							<span className="pv-section-name">{hoverSection.name}</span>
						</div>
						{sections.length > 1 && (
							<button
								type="button"
								className="pv-card-row pv-card-row-danger"
								title="Remove this section and everything in it"
								onClick={() => {
									const count = hoverSection.blockIds.length;
									if (
										confirm(
											`Remove ${hoverSection.name} and the ${count} block${count === 1 ? '' : 's'} inside it? Images used nowhere else come off the site too.`,
										)
									)
										editor.removeSection(pageKey, hoverSection.id);
								}}
							>
								<PanelIcon type="trash" />
								Remove section
							</button>
						)}
					</div>
					<button
						type="button"
						className="pv-ui pv-add-bar"
						style={{
							top: hoverSectionRect.top + hoverSectionRect.height - 14,
							left: hoverSectionRect.left + hoverSectionRect.width / 2,
						}}
						title="Start a new section — pick its first block"
						onClick={() => openPicker(NEW_SECTION_ID, hoverSectionRect)}
					>
						<PanelIcon type="plus" />
						Add section
					</button>
				</>
			)}

			{/* The site's own header and footer open their editors on a click —
			    hovering either outlines it like any other editable region. */}
			{hoverChrome &&
				(() => {
					const rect =
						hoverChrome === 'header'
							? (rectFor('.header-logo-container') ?? rectFor('.navigation-shell'))
							: rectFor('footer.site-footer');
					if (!rect) return null;
					const open = () => {
						showEditorTab('site');
						revealSiteSection(hoverChrome === 'header' ? '_identity' : '_footer');
					};
					return (
						<>
							<div className="pv-outline pv-outline-hover" style={boxStyle(rect)} />
							<button
								type="button"
								className="pv-ui pv-chrome-button"
								style={{
									// Straddling the region's edge leaves no dead gap for the
									// pointer to cross, so the button stays reachable.
									top:
										hoverChrome === 'header'
											? rect.top + rect.height - 14
											: rect.top - 14,
									left: rect.left + rect.width / 2,
								}}
								title={
									hoverChrome === 'header'
										? 'Your name, logo and navigation'
										: 'The footer shown on every page'
								}
								onClick={open}
							>
								<PanelIcon type="pencil" />
								{hoverChrome === 'header' ? 'Edit header' : 'Edit footer'}
							</button>
						</>
					);
				})()}

			{/* Selected block: strong outline + floating icon toolbar. */}
			{selectedRect && selectedBlock && (
				<>
					<div className="pv-outline pv-outline-selected" style={boxStyle(selectedRect)} />
					<div
						className="pv-ui pv-block-toolbar"
						role="toolbar"
						aria-label={`Actions for the selected ${blockLabel(selectedBlock)} block`}
						style={{
							top: Math.max(selectedRect.top - 44, 8),
							left: Math.max(12, Math.min(selectedRect.left, docWidth - 260)),
						}}
					>
						<span className="pv-toolbar-label">
							<BlockIcon type={blockIconType(selectedBlock)} />
							{displayLabel(selectedBlock)}
						</span>
						{selectedBlock.type === 'text' && (
							<button
								type="button"
								className="pv-icon-button"
								title="Edit this text right on the page"
								aria-label="Edit this text in place"
								onClick={() => onInlineTextEdit(selectedBlock.id)}
							>
								<PanelIcon type="pencil" />
							</button>
						)}
						<button
							type="button"
							className="pv-icon-button"
							title={selectedBlock.type === 'text' ? 'All settings for this block' : 'Edit this block’s settings'}
							aria-label={`Open settings for this ${blockLabel(selectedBlock)} block`}
							onClick={() => {
								showEditorTab('pages');
								onEditBlock(selectedBlock.id);
							}}
						>
							<PanelIcon type={selectedBlock.type === 'text' ? 'settings' : 'pencil'} />
						</button>
						{canDuplicate(selectedBlock) && (
							<button
								type="button"
								className="pv-icon-button"
								title="Duplicate this block"
								aria-label={`Duplicate this ${blockLabel(selectedBlock)} block`}
								onClick={() => duplicateBlock(selectedBlock)}
							>
								<PanelIcon type="duplicate" />
							</button>
						)}
						<button
							type="button"
							className="pv-icon-button"
							disabled={!selectedSection || selectedPosition <= 0}
							title="Move this block earlier in its section"
							aria-label="Move this block earlier"
							onClick={() =>
								selectedSection &&
								editor.moveBlockInSection(pageKey, selectedSection.id, selectedPosition, selectedPosition - 1)
							}
						>
							<PanelIcon type="up" />
						</button>
						<button
							type="button"
							className="pv-icon-button"
							disabled={
								!selectedSection ||
								selectedPosition < 0 ||
								selectedPosition === selectedSection.blockIds.length - 1
							}
							title="Move this block later in its section"
							aria-label="Move this block later"
							onClick={() =>
								selectedSection &&
								editor.moveBlockInSection(pageKey, selectedSection.id, selectedPosition, selectedPosition + 1)
							}
						>
							<PanelIcon type="down" />
						</button>
						<button
							type="button"
							className="pv-icon-button pv-icon-danger"
							title="Remove this block"
							aria-label={`Remove this ${blockLabel(selectedBlock)} block`}
							onClick={() => removeBlock(selectedBlock)}
						>
							<PanelIcon type="trash" />
						</button>
					</div>
				</>
			)}

			{/* In-place text editing: the words live on the page; only the format
			    toolbar floats, pinned above the block (or just below it near the
			    top of the page). */}
			{inlineTextBlock && inlineTextRect && (
				<div
					className="pv-ui pv-text-card pv-inline-toolbar"
					role="dialog"
					aria-label="Text formatting"
					ref={(element) => {
						// Real measured height keeps the toolbar clear of the words —
						// above when there's room, otherwise fully below the block.
						if (element && Math.abs(element.offsetHeight - inlineToolbarHeight) > 2)
							setInlineToolbarHeight(element.offsetHeight);
					}}
					style={{
						top:
							inlineTextRect.top - inlineToolbarHeight - 12 >= viewTop + 8
								? inlineTextRect.top - inlineToolbarHeight - 12
								: inlineTextRect.top + inlineTextRect.height + 12,
						left: Math.max(12, Math.min(inlineTextRect.left, docWidth - 432)),
					}}
				>
					<header className="pv-card-head">
						<strong>
							<BlockIcon type="text" />
							Text
						</strong>
						<button
							type="button"
							className="btn-link"
							onClick={() => {
								showEditorTab('pages');
								onEditBlock(inlineTextBlock.id);
							}}
						>
							All settings
						</button>
						<button
							type="button"
							className="pv-icon-button"
							aria-label="Done editing text"
							title="Done (Esc)"
							onClick={() => onInlineTextDone()}
						>
							<PanelIcon type="close" />
						</button>
					</header>
					<RichTextToolbar
						getEditor={inlineEditorElement}
						targetDocument={frameDoc}
						onEmit={emitInlineText}
						label={`text block on ${page.label || pageKey}`}
					/>
				</div>
			)}

			{/* The dock: Layers + Add block, always in reach. */}
			<div className="pv-dock pv-ui" role="group" aria-label="Page structure tools">
				<button
					type="button"
					className={`pv-dock-button${layersOpen ? ' active' : ''}`}
					aria-pressed={layersOpen}
					aria-label="Show the layers list for this page"
					title="Layers — every block on this page"
					onClick={() => {
						setLayersOpen((open) => !open);
						setPicker(null);
					}}
				>
					<PanelIcon type="layers" />
				</button>
				<button
					type="button"
					className="pv-dock-button pv-dock-add"
					aria-label="Add a block to this page"
					title="Add a block to this page"
					onClick={() =>
						picker
							? setPicker(null)
							: openPicker(
									(selectedSection ?? sections[sections.length - 1])?.id ?? sections[0]?.id ?? '',
									null,
								)
					}
				>
					<PanelIcon type="plus" />
					Add block
				</button>
			</div>

			{/* Layers: the page's structure as a floating card. Image groups behave
			    like Photoshop groups — a chevron opens the images inside; hovering
			    a row highlights that image on the page, clicking travels to it. */}
			{layersOpen && (
				<div className="pv-ui pv-layers" role="dialog" aria-label="Layers">
					<header className="pv-card-head">
						<strong>Layers</strong>
						<button
							type="button"
							className="pv-icon-button"
							aria-label="Close layers"
							title="Close"
							onClick={() => setLayersOpen(false)}
						>
							<PanelIcon type="close" />
						</button>
					</header>
					<DndContext
						sensors={dndSensors}
						collisionDetection={closestCenter}
						onDragEnd={onLayersDragEnd}
					>
						{sections.map((section, index) => (
							<div className="pv-layers-section" key={section.id}>
								{sections.length > 1 && (
									<button
										type="button"
										className="pv-layers-section-name"
										title="Open this section's settings in the editing column"
										onClick={() => revealEditorSection(pageKey, section.id)}
									>
										<span
											className="pv-section-dot"
											style={{ background: sectionEditorColor(section, index) }}
											aria-hidden="true"
										/>
										{section.name}
									</button>
								)}
								<SortableContext
									items={section.blockIds.map((blockId) => `blk|${section.id}|${blockId}`)}
									strategy={verticalListSortingStrategy}
								>
									{section.blockIds.map((blockId) => {
										const block = blockById.get(blockId);
										if (!block) return null;
										const ordered = orderedEntries(block);
										const isGroup = ordered.length > 1;
										const open = isGroup && expandedGroups.has(blockId);
										const folder = blockFolder(doc, pageKey, block);
										const thumb = blockThumb(doc, pageKey, block);
										return (
											<div key={blockId} className="pv-layers-item">
												<SortableLayerRow
													id={`blk|${section.id}|${blockId}`}
													className={`pv-layers-row${selectedId === blockId ? ' selected' : ''}`}
												>
													{isGroup && (
														<button
															type="button"
															className={`pv-layers-chevron${open ? ' open' : ''}`}
															aria-expanded={open}
															aria-label={`${open ? 'Collapse' : 'Expand'} the images in ${displayLabel(block)}`}
															title={open ? 'Collapse group' : 'Show the images inside'}
															onClick={() => toggleGroup(blockId)}
														>
															<PanelIcon type="chevron" />
														</button>
													)}
													<button
														type="button"
														className="pv-layers-open"
														title="Drag to reorder · click to select"
														onClick={() => {
															selectBlock(blockId);
															scrollBlockIntoView(blockId);
														}}
													>
														{thumb ? (
															<img src={thumb} alt="" aria-hidden="true" />
														) : (
															<BlockIcon type={blockIconType(block)} />
														)}
														<span>{displayLabel(block)}</span>
														{isGroup && <small>{ordered.length}</small>}
													</button>
												</SortableLayerRow>
												{open && folder && (
													<div
														className="pv-layers-children"
														role="group"
														aria-label={`Images in ${displayLabel(block)}, front to back`}
													>
														<SortableContext
															items={ordered.map(({ entry }) => `img|${folder}|${entry.id}`)}
															strategy={verticalListSortingStrategy}
														>
															{ordered.map(({ entry, index: entryIndex }) => (
																<SortableLayerRow
																	key={entry.id}
																	id={`img|${folder}|${entry.id}`}
																	className="pv-layers-row pv-layers-child"
																>
																	<button
																		type="button"
																		className="pv-layers-open"
																		title="Drag to restack or move to another group · click to show on the page"
																		onMouseEnter={() =>
																			setHoverEntry({ blockId, entryId: entry.id })
																		}
																		onMouseLeave={() =>
																			setHoverEntry((current) =>
																				current?.entryId === entry.id ? null : current,
																			)
																		}
																		onClick={() => locateEntry(block, entry.id)}
																	>
																		{entryThumb(entry) ? (
																			<img src={entryThumb(entry)} alt="" aria-hidden="true" />
																		) : (
																			<BlockIcon type="images" />
																		)}
																		<span>{entryLabel(entry, entryIndex)}</span>
																	</button>
																</SortableLayerRow>
															))}
														</SortableContext>
													</div>
												)}
											</div>
										);
									})}
								</SortableContext>
								{section.blockIds.length === 0 && (
									<span className="pv-layers-empty">No blocks yet</span>
								)}
							</div>
						))}
					</DndContext>
				</div>
			)}

			{/* Hidden file input backing the picker's solo "Image" choice. */}
			<input
				ref={soloFileInputRef}
				type="file"
				accept="image/*"
				multiple
				hidden
				aria-hidden="true"
				tabIndex={-1}
			/>

			{pickerCard}
		</div>
	);
}
