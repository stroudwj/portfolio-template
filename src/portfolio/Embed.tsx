import { videoEmbedSrc } from './videoEmbed';
import { safeHref } from './safeHref';
import './Embed.css';

/**
 * A video page block. YouTube/Vimeo links render an inline player; any other
 * valid web link renders as a plain "Watch video" link instead of an iframe.
 */
export default function Embed({ url }: { url: string }) {
	if (!url.trim()) return null;
	const src = videoEmbedSrc(url);
	if (!src) {
		const href = safeHref(url);
		if (!href || !/^https?:/.test(href)) return null;
		return (
			<div className="embed-block">
				<a className="embed-fallback" href={href} target="_blank" rel="noopener">
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
				allowFullScreen
			/>
		</div>
	);
}
