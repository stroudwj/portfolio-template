export type PhoneCanvasItemKind = 'image' | 'text' | 'video';

export interface PhoneCanvasPosition {
	key: string;
	y: number;
	kind: PhoneCanvasItemKind;
	index: number;
}

const KIND_ORDER: Record<PhoneCanvasItemKind, number> = { image: 0, text: 1, video: 2 };

/** Deterministic automatic phone order shared by the editor and renderer. */
export function automaticPhoneOrder(items: readonly PhoneCanvasPosition[]): string[] {
	return [...items]
		.sort((a, b) => a.y - b.y || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.index - b.index)
		.map((item) => item.key);
}
