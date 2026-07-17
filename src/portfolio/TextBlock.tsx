import { Fragment } from 'react';
import type { TextAlign } from '../lib/content';
import './TextBlock.css';

/** Free text as React nodes: "\n" is a line break, "\n\n" a blank line (like the bio). */
export function TextLines({ text }: { text: string }) {
	const lines = text.split('\n');
	return (
		<>
			{lines.flatMap((line, i) =>
				i === 0
					? [<Fragment key={`l${i}`}>{line}</Fragment>]
					: [<br key={`b${i}`} />, <Fragment key={`l${i}`}>{line}</Fragment>],
			)}
		</>
	);
}

/** A free-text page block. */
export default function TextBlock({ text, align }: { text: string; align?: TextAlign }) {
	if (!text.trim()) return null;
	return (
		<div className={`text-block align-${align ?? 'left'}`}>
			<p>
				<TextLines text={text} />
			</p>
		</div>
	);
}
