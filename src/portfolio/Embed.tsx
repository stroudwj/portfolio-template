import { videoEmbedSrc } from './videoEmbed';
import { stripePaymentLink } from './paymentEmbed';
import { safeHref } from './safeHref';
import './Embed.css';

/**
 * An embed page block. YouTube/Vimeo links render an inline player; a Stripe
 * Payment Link renders a buy button that opens the artist's own Stripe checkout
 * (client-side link only — no script, no iframe, nobody but Stripe in the payment
 * path); any other valid web link renders as a plain "Watch video" link.
 */
export default function Embed({ url }: { url: string }) {
	if (!url.trim()) return null;
	const buyHref = stripePaymentLink(url);
	if (buyHref) {
		return (
			<div className="embed-block embed-buy">
				<a className="embed-buy-button" href={buyHref} target="_blank" rel="noopener noreferrer">
					Buy ↗
				</a>
			</div>
		);
	}
	const src = videoEmbedSrc(url);
	if (!src) {
		const href = safeHref(url);
		if (!href || !/^https?:/.test(href)) return null;
		return (
			<div className="embed-block">
				<a className="embed-fallback" href={href} target="_blank" rel="noopener noreferrer">
					Watch video ↗
				</a>
			</div>
		);
	}
	return (
		<div className="embed-block">
			<iframe
				src={src}
				title="Embedded video"
				loading="lazy"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				referrerPolicy="strict-origin-when-cross-origin"
				allowFullScreen
			/>
		</div>
	);
}
