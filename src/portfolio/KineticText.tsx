import type { CSSProperties, ReactNode } from 'react';
import type { KineticTextConfig } from '../lib/content';
import './KineticText.css';

export function kineticStyle(config: KineticTextConfig | undefined): CSSProperties | undefined {
	if (!config) return undefined;
	const speed = Math.min(Math.max(config.speed ?? 100, 50), 200);
	const tempo = 100 / speed;
	return {
		'--kinetic-duration': `${Math.round(560 * tempo)}ms`,
		'--kinetic-stagger-word': `${Math.round(38 * tempo)}ms`,
		'--kinetic-stagger-letter': `${Math.round(24 * tempo)}ms`,
		'--kinetic-stagger-line': `${Math.round(110 * tempo)}ms`,
		'--kinetic-marquee-duration': `${Math.max(4.5, 12 * tempo).toFixed(2)}s`,
	} as CSSProperties;
}

export function kineticClass(config: KineticTextConfig | undefined): string {
	return config
		? `kinetic-text kinetic-${config.effect}${config.phone === false ? ' kinetic-phone-off' : ''}`
		: '';
}

/** Two copies move as one track, so the marquee loops without leaving a blank
 * viewport after the first copy exits. Only the first copy remains semantic;
 * the duplicate must render the same formatting (minus links) or the loop
 * shows two different marquees. */
export function KineticMarquee({
	children,
	duplicate,
}: {
	children: ReactNode;
	duplicate: ReactNode;
}) {
	return (
		<span className="kinetic-marquee-track">
			<span className="kinetic-marquee-copy">{children}</span>
			<span className="kinetic-marquee-copy" aria-hidden="true">
				{duplicate}
			</span>
		</span>
	);
}

/**
 * Keeps the original words in the DOM while wrapping only the visual animation
 * units. Whitespace stays literal, so selection, copying, and screen-reader
 * pronunciation remain natural.
 */
export function KineticInline({
	text,
	config,
}: {
	text: string;
	config?: KineticTextConfig;
}) {
	if (!config || config.effect === 'marquee') return <>{text}</>;
	const pieces =
		config.effect === 'letters'
			? Array.from(text)
			: config.effect === 'lines'
				? text.split(/(\n)/)
				: text.split(/(\s+)/);
	let visibleIndex = 0;
	const rendered: ReactNode[] = pieces.map((piece, index) => {
		if (piece === '\n') return <br key={`break-${index}`} />;
		if (!piece || /^\s+$/.test(piece)) return piece;
		const unitIndex = visibleIndex++;
		return (
			<span
				className="kinetic-unit"
				key={`${index}-${piece}`}
				style={{ '--kinetic-index': unitIndex } as CSSProperties}
			>
				{piece}
			</span>
		);
	});
	return <>{rendered}</>;
}
