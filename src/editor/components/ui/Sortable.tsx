// Thin wrappers over @dnd-kit for accessible drag-reorder. Each row also gets
// up/down buttons (rendered by the caller) as a keyboard/no-drag fallback.
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

export function SortableList({
	ids,
	onReorder,
	children,
}: {
	ids: string[];
	onReorder: (from: number, to: number) => void;
	children: ReactNode;
}) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const onDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from !== -1 && to !== -1) onReorder(from, to);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				{children}
			</SortableContext>
		</DndContext>
	);
}

export interface DragHandleProps {
	setActivatorNodeRef: (el: HTMLElement | null) => void;
	attributes: Record<string, unknown>;
	listeners: Record<string, unknown> | undefined;
}

export function SortableItem({ id, children }: { id: string; children: (handle: DragHandleProps) => ReactNode }) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
		id,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.6 : 1,
		zIndex: isDragging ? 2 : undefined,
	};
	return (
		<div ref={setNodeRef} style={style}>
			{children({ setActivatorNodeRef, attributes, listeners })}
		</div>
	);
}
