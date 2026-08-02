import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Hero from '../src/portfolio/Hero';

describe('freeform page heading', () => {
	it('renders a movable heading box only when the editor supplies a position callback', () => {
		const editable = renderToStaticMarkup(
			<Hero
				heading="Selected Works"
				position="freeform"
				freeformX={28}
				freeformY={72}
				onPositionChange={vi.fn()}
			/>,
		);
		expect(editable).toContain('is-position-editable');
		expect(editable).toContain('tabindex="0"');
		expect(editable).toContain('--page-heading-x:28%');
		expect(editable).toContain('--page-heading-y:72px');

		const published = renderToStaticMarkup(
			<Hero heading="Selected Works" position="freeform" freeformX={28} freeformY={72} />,
		);
		expect(published).not.toContain('is-position-editable');
		expect(published).not.toContain('tabindex');
	});
});
