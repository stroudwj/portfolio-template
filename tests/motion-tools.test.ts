import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { blankDoc } from '../src/editor/lib/content-init';
import { accessibilityAudit, performanceAudit } from '../src/editor/lib/site-audit';
import { buildBundle } from '../src/editor/lib/exporter';
import { parseAndMigrateContent } from '../src/lib/content';
import { KineticMarquee, kineticStyle } from '../src/portfolio/KineticText';

describe('motion and reusable project tools', () => {
	it('treats a higher tempo as faster, not slower', () => {
		const slow = kineticStyle({ effect: 'words', speed: 50 }) as Record<string, string>;
		const fast = kineticStyle({ effect: 'words', speed: 200 }) as Record<string, string>;
		expect(Number.parseInt(slow['--kinetic-duration'])).toBeGreaterThan(
			Number.parseInt(fast['--kinetic-duration']),
		);
		expect(Number.parseFloat(slow['--kinetic-marquee-duration'])).toBeGreaterThan(
			Number.parseFloat(fast['--kinetic-marquee-duration']),
		);
	});

	it('renders a continuous marquee track with a hidden duplicate', () => {
		const html = renderToStaticMarkup(
			createElement(KineticMarquee, {
				duplicateText: 'Loop forever',
				children: 'Loop forever',
			}),
		);
		expect(html).toContain('kinetic-marquee-track');
		expect(html.match(/Loop forever/g)).toHaveLength(2);
		expect(html).toContain('aria-hidden="true"');
	});

	it('validates project fields, phone controls, artwork effects, and saved sections', () => {
		const doc = blankDoc();
		doc.content.site.creative = {
			pageTransition: 'gallery',
			looseHang: true,
			hangStrength: 2.25,
			phone: { pageTransition: false, film: false },
		};
		doc.content.theme.backgroundTexture = 'concrete';
		doc.content.pages.art.hanging = false;
		doc.content.pages.art.project = {
			template: 'exhibition',
			year: '2026',
			medium: 'Oil on linen',
			dimensions: '120 × 90 cm',
			collaborators: 'Studio Example',
			exhibitionHistory: 'North Gallery, 2026',
		};
		doc.content.pages.art.headingKinetic = { effect: 'marquee', speed: 125, phone: false };
		doc.content.galleries.art.items['work.jpg'] = {
			id: 'work-1',
			alt: 'Blue abstract painting',
			effects: {
				hover: 'lift',
				reveal: 'wipe',
				hang: true,
				skew: -2.5,
				mount: 'tape',
				phone: false,
			},
		};
		doc.content.sectionLibrary = [{
			id: 'section-1',
			name: 'Project statement',
			block: { id: 'copy', type: 'text', text: 'A reusable statement.' },
			motion: { effect: 'reveal', intensity: 35, phone: true },
		}];

		expect(parseAndMigrateContent(doc.content)).toEqual(doc.content);
	});

	it('keeps saved sections private when creating a public bundle', async () => {
		const doc = blankDoc();
		doc.content.sectionLibrary = [{
			id: 'section-private',
			name: 'Unpublished notes',
			block: { id: 'private-copy', type: 'text', text: 'Do not publish this draft.' },
		}];
		const bundle = await buildBundle(doc);
		expect(bundle.contentJson.sectionLibrary).toBeUndefined();
		expect(JSON.stringify(bundle.contentJson)).not.toContain('Do not publish this draft.');
	});

	it('scores performance and checks structure beyond alt text', () => {
		const doc = blankDoc();
		doc.content.pages.home.blocks?.push({
			id: 'vague',
			type: 'button',
			label: 'Click here',
			url: '/art',
		});
		doc.content.pages.home.blocks?.push({
			id: 'form',
			type: 'form',
			action: '',
			fields: [
				{ id: 'a', type: 'text', label: 'Question' },
				{ id: 'b', type: 'text', label: 'Question' },
			],
		});
		expect(performanceAudit(doc).score).toBeGreaterThanOrEqual(85);
		const messages = accessibilityAudit(doc).map((finding) => finding.message);
		expect(messages.some((message) => message.includes('vague'))).toBe(true);
		expect(messages.some((message) => message.includes('repeats a question label'))).toBe(true);
	});
});
