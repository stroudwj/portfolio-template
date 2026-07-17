import { Fragment } from 'react';
import './TextBlock.css';

/** A free-text page block. "\n" is a line break, "\n\n" a blank line (like the bio). */
export default function TextBlock({ text }: { text: string }) {
	if (!text.trim()) return null;
	const lines = text.split('\n');
	return (
		<div className="text-block">
			<p>
				{lines.flatMap((line, i) =>
					i === 0
						? [<Fragment key={`l${i}`}>{line}</Fragment>]
						: [<br key={`b${i}`} />, <Fragment key={`l${i}`}>{line}</Fragment>],
				)}
			</p>
		</div>
	);
}
