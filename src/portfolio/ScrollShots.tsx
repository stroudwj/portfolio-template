import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './ScrollShots.css';

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
const smoothstep = (value: number): number => {
	const x = clamp01(value);
	return x * x * (3 - 2 * x);
};

export default function ScrollShots({
	src,
	scrollLength = 260,
	fadeIntoPage = true,
	fadeStart = 70,
	fadeDuration = 30,
	fit = 'cover',
	phone = false,
	editorPreview = false,
}: {
	src?: string;
	scrollLength?: number;
	fadeIntoPage?: boolean;
	fadeStart?: number;
	fadeDuration?: number;
	fit?: 'cover' | 'contain';
	phone?: boolean;
	editorPreview?: boolean;
}) {
	const sceneRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [motionDisabled, setMotionDisabled] = useState(false);
	const length = Math.min(Math.max(scrollLength, 140), 500);
	const fadeAt = Math.min(Math.max(fadeStart, 0), 95);
	const fadeFor = Math.min(Math.max(fadeDuration, 5), 100 - fadeAt);

	useEffect(() => {
		const scene = sceneRef.current;
		const video = videoRef.current;
		const win = scene?.ownerDocument.defaultView;
		if (!scene || !video || !win || !src) return;
		const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
		const phoneQuery = win.matchMedia('(max-width: 639px)');
		let frame = 0;

		const disabled = () => reduced.matches || (phoneQuery.matches && !phone);
		const update = () => {
			frame = 0;
			const off = disabled();
			setMotionDisabled(off);
			if (off || !Number.isFinite(video.duration) || video.duration <= 0) return;
			const rect = scene.getBoundingClientRect();
			const travel = Math.max(rect.height - win.innerHeight, 1);
			const progress = clamp01(-rect.top / travel);
			const target = Math.min(progress * video.duration, Math.max(video.duration - 0.04, 0));
			if (Math.abs(video.currentTime - target) > 0.025) {
				try {
					video.currentTime = target;
				} catch {
					// Metadata/range support can arrive a beat after the duration.
				}
			}
			video.pause();
			const opacity = fadeIntoPage
				? 1 - smoothstep((progress - fadeAt / 100) / (fadeFor / 100))
				: 1;
			scene.style.setProperty('--shots-opacity', opacity.toFixed(3));
			scene.style.setProperty('--shots-progress', progress.toFixed(4));
		};
		const schedule = () => {
			if (!frame) frame = win.requestAnimationFrame(update);
		};
		const reset = () => {
			scene.style.removeProperty('--shots-opacity');
			schedule();
		};

		video.addEventListener('loadedmetadata', schedule);
		win.addEventListener('scroll', schedule, { passive: true });
		win.addEventListener('resize', schedule, { passive: true });
		reduced.addEventListener('change', reset);
		phoneQuery.addEventListener('change', reset);
		schedule();
		return () => {
			if (frame) win.cancelAnimationFrame(frame);
			video.removeEventListener('loadedmetadata', schedule);
			win.removeEventListener('scroll', schedule);
			win.removeEventListener('resize', schedule);
			reduced.removeEventListener('change', reset);
			phoneQuery.removeEventListener('change', reset);
		};
	}, [fadeAt, fadeFor, fadeIntoPage, phone, src]);

	const style = {
		'--shots-scroll': String(length),
		'--shots-overlap': `${Math.max((length - 100) * (1 - fadeAt / 100), 0)}vh`,
	} as CSSProperties;

	if (!src && !editorPreview) return null;
	return (
		<div
			ref={sceneRef}
			className={`shots-scene ${fadeIntoPage ? 'shots-fade-into-page' : ''} ${
				phone ? 'shots-phone-enabled' : ''
			} ${
				motionDisabled ? 'motion-disabled' : ''
			}`}
			style={style}
		>
			<div className="shots-sticky">
				{src ? (
					<video
						ref={videoRef}
						className={`shots-video fit-${fit}`}
						src={src}
						muted
						playsInline
						preload="auto"
						controls={motionDisabled}
						aria-label="Scroll-controlled short video"
					/>
				) : (
					<div className="shots-placeholder">
						<strong>Shots / scroll video</strong>
						<span>Upload a short MP4 or WebM, or paste a direct video link.</span>
					</div>
				)}
				{src && !motionDisabled && editorPreview && (
					<div className="shots-editor-badge" aria-hidden="true">
						Scroll to scrub
					</div>
				)}
			</div>
		</div>
	);
}
