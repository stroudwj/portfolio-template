import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { TextFlowLayout } from '../lib/content';
import { clampTextFlowLayout } from './canvasLayout';
import { embedKindForInput, embedSpec, type EmbedKind } from './mediaEmbed';
import { stripePaymentLink } from './paymentEmbed';
import { safeHref } from './safeHref';
import './Embed.css';

/**
 * An embed page block. Supported video/audio/map links render an inline player; a Stripe
 * Payment Link renders a buy button that opens the artist's own Stripe checkout
 * (client-side link only — no script, no iframe, nobody but Stripe in the payment
 * path); any other valid web link renders as a provider-appropriate plain link.
 */
export function defaultEmbedFlowLayout(kind: EmbedKind): TextFlowLayout {
	return kind === 'audio' ? { x: 15, w: 70 } : { x: 10, w: 80 };
}

export default function Embed({
	url,
	kind,
	flowLayout,
	editable = false,
	onFlowLayout,
}: {
	url: string;
	kind?: EmbedKind;
	flowLayout?: TextFlowLayout;
	editable?: boolean;
	onFlowLayout?: (layout: TextFlowLayout) => void;
}) {
	const spec = embedSpec(url);
	const resolvedKind = spec?.kind ?? embedKindForInput(url) ?? kind ?? 'video';
	const savedLayout = clampTextFlowLayout(flowLayout ?? defaultEmbedFlowLayout(resolvedKind));
	const [draftLayout, setDraftLayout] = useState<TextFlowLayout | null>(null);
	const regionRef = useRef<HTMLDivElement>(null);
	const layout = draftLayout ?? savedLayout;
	const layoutStyle = {
		'--embed-flow-x': String(layout.x),
		'--embed-flow-w': String(layout.w),
		...(spec ? { '--embed-ar': String(spec.aspectRatio) } : {}),
	} as CSSProperties;
	if (!url.trim()) return null;

	const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
		if (event.button !== 0 || !onFlowLayout) return;
		const region = regionRef.current;
		if (!region) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget;
		const pointerId = event.pointerId;
		try {
			handle.setPointerCapture(pointerId);
		} catch {
			// Window listeners and the resize shield are the cross-browser fallback.
		}
		const win = region.ownerDocument.defaultView ?? window;
		const rect = region.getBoundingClientRect();
		const computed = win.getComputedStyle(region);
		const usableWidth = Math.max(
			rect.width - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight),
			1,
		);
		const startX = event.clientX;
		const from = layout;
		let final = from;
		setDraftLayout(from);
		const move = (moveEvent: PointerEvent) => {
			const delta = ((moveEvent.clientX - startX) / usableWidth) * 100;
			final = clampTextFlowLayout({
				x: from.x,
				w: Math.min(Math.max(from.w + delta, 20), 100 - from.x),
			});
			setDraftLayout(final);
		};
		const up = () => {
			win.removeEventListener('pointermove', move);
			win.removeEventListener('pointerup', up);
			win.removeEventListener('pointercancel', up);
			try {
				if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
			} catch {
				// Pointer capture can already be released by the browser.
			}
			setDraftLayout(null);
			if (final.x !== savedLayout.x || final.w !== savedLayout.w) onFlowLayout(final);
		};
		win.addEventListener('pointermove', move);
		win.addEventListener('pointerup', up);
		win.addEventListener('pointercancel', up);
	};

	let content;
	const buyHref = stripePaymentLink(url);
	if (buyHref) {
		content = (
			<div className="embed-content embed-buy">
				<a className="embed-buy-button" href={buyHref} target="_blank" rel="noopener noreferrer">
					Buy ↗
				</a>
			</div>
		);
	} else if (!spec) {
		const href = safeHref(url);
		if (!href || !/^https?:/.test(href)) return null;
		const label =
			resolvedKind === 'audio' ? 'Listen' : resolvedKind === 'map' ? 'Open map' : 'Watch video';
		content = (
			<div className="embed-content">
				<a className="embed-fallback" href={href} target="_blank" rel="noopener noreferrer">
					{label} ↗
				</a>
			</div>
		);
	} else {
		content = (
			<div
				className={`embed-content embed-${spec.kind} embed-${spec.provider.toLowerCase().replace(/\s+/g, '-')}`}
			>
				<iframe
					src={spec.src}
					title={spec.title}
					loading="lazy"
					allow={spec.allow}
					referrerPolicy="strict-origin-when-cross-origin"
					allowFullScreen={spec.allowFullScreen}
				/>
			</div>
		);
	}

	return (
		<div
			ref={regionRef}
			className={`embed-flow-region${editable && onFlowLayout ? ' is-editable' : ''}${
				draftLayout ? ' is-resizing' : ''
			}`}
		>
			<div className="embed-block" style={layoutStyle}>
				{content}
				{editable && onFlowLayout && (
					<button
						type="button"
						className="embed-flow-resize"
						aria-label={`Resize ${resolvedKind === 'map' ? 'map' : resolvedKind === 'audio' ? 'music player' : 'embed'}`}
						title="Drag to resize"
						onPointerDown={startResize}
					/>
				)}
			</div>
			{draftLayout && <div className="embed-flow-resize-shield" aria-hidden="true" />}
		</div>
	);
}
