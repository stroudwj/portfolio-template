import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ImageCropDialog from '../src/editor/components/ImageCropDialog';

describe('image crop dialog', () => {
	it('shrinks the frame width when the height cap would distort its aspect ratio', () => {
		const markup = renderToStaticMarkup(
			createElement(ImageCropDialog, {
				src: '/portrait.jpg',
				name: 'Portrait',
				initial: { naturalAspect: 3 / 4 },
				onClose: () => undefined,
				onSave: () => undefined,
			}),
		);

		expect(markup).toContain('width:min(100%, 560px, 39vh);aspect-ratio:0.75');
	});
});
