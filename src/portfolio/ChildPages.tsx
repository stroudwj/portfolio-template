import type { CSSProperties } from 'react';
import type { ChildrenStyle, PageTransition } from '../lib/content';
import { sharedPageTransitionName } from './pageTransitions';
import './ChildPages.css';

export interface ChildPageItem {
	/** Page key / path, e.g. "work/project-a". */
	key: string;
	label: string;
	href: string;
	/** Resolved thumbnail URL (explicit thumbnail, else the sub-page's first image). */
	thumbSrc?: string;
	/** Editor: the card's stable id inside its children block (for renames). */
	id?: string;
}

/**
 * A page's sub-pages linking into each one, in one of four presentations:
 * 'cards' (default) — a grid of thumbnail cards; 'large' — big two-column
 * covers; 'list' — compact rows with a small square thumb; 'index' — a pure
 * typographic list, no images.
 */
export default function ChildPages({
	items,
	style = 'cards',
	onNavigate,
	pageTransition,
	onEditLabel,
}: {
	items: ChildPageItem[];
	style?: ChildrenStyle;
	/** Editor preview: switch pages in place instead of following the link. */
	onNavigate?: (path: string) => void;
	pageTransition?: PageTransition;
	/** Editor preview: card labels become editable in place. */
	onEditLabel?: (itemId: string, label: string) => void;
}) {
	if (!items.length) return null;
	return (
		<div className={`child-pages child-style-${style}`}>
			{items.map((item) => (
				<a
					key={item.key}
					className="child-card"
					href={item.href}
					onClick={
						onNavigate
							? (e) => {
									e.preventDefault();
									onNavigate(item.key);
								}
							: undefined
					}
				>
					{style !== 'index' &&
						(item.thumbSrc ? (
							<img
								src={item.thumbSrc}
								alt={item.label}
								style={
									pageTransition === 'gallery'
										? ({ viewTransitionName: sharedPageTransitionName(item.key) } as CSSProperties)
										: undefined
								}
							/>
						) : <div className="child-thumb-empty" />)}
					{onEditLabel ? (
						<span
							className="child-card-label-editable"
							contentEditable
							suppressContentEditableWarning
							spellCheck={false}
							role="textbox"
							aria-label={`Card text for ${item.label}`}
							title="Click to edit this card’s text"
							// Editing must not follow the link or start a widget drag.
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onPointerDown={(e) => e.stopPropagation()}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									(e.currentTarget as HTMLElement).blur();
								} else if (e.key === 'Escape') {
									e.preventDefault();
									e.currentTarget.textContent = item.label;
									(e.currentTarget as HTMLElement).blur();
								}
							}}
							onBlur={(e) => {
								// An empty value is a real edit: spec 36 (audit row E6b) — a card
								// label the artist clears must stay cleared, not snap back to the
								// template's words. Only an unchanged value is reverted.
								const next = (e.currentTarget.textContent ?? '').trim();
								if (next !== item.label) onEditLabel(item.id ?? item.key, next);
								else e.currentTarget.textContent = item.label;
							}}
						>
							{item.label}
						</span>
					) : (
						<span>{item.label}</span>
					)}
				</a>
			))}
		</div>
	);
}
