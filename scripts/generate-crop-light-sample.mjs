// Generates the crop & light demo's deliberately unprofessional sample photo:
// a rights-cleared catalog artwork (Renoir, Two Sisters (On the Terrace) —
// sample id painter-aic-14655-v1, Art Institute of Chicago open access) staged
// as a dim, flat, slightly crooked phone shot with too much wall around it.
// The guided demo in the editor then walks a first-run artist through cropping
// and light-correcting it back to gallery-ready.
//
// sharp is not a project dependency. To regenerate:
//   npm install --no-save sharp && node scripts/generate-crop-light-sample.mjs
//
// Swapping in a real phone shot later: replace
// public/assets/demo/crop-light-sample.jpg with any ~3:4 portrait photo that
// genuinely needs a crop and a light lift, and keep this script's framing
// numbers as documentation of what the demo copy assumes (artwork roughly
// centered, generous margins, dim and low-contrast overall).
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? resolve(root, 'public/assets/starters/painter/01-two-sisters.jpg');
const dest = process.argv[3] ?? resolve(root, 'public/assets/demo/crop-light-sample.jpg');

// A portrait phone-camera frame: the painting fills ~70% of the width, hung a
// touch off-center and ~2° crooked, the rest is studio wall.
const CANVAS_W = 1200;
const CANVAS_H = 1600;

const painting = await sharp(src)
	.resize({ width: 820 })
	.rotate(2.2, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
	.png()
	.toBuffer();
const { width: paintingW = 0 } = await sharp(painting).metadata();

// Phone-camera corner falloff: a radial vignette multiplied over the shot.
const vignette = Buffer.from(
	`<svg width="${CANVAS_W}" height="${CANVAS_H}">
		<radialGradient id="v" cx="46%" cy="42%" r="78%">
			<stop offset="0%" stop-color="#ffffff"/>
			<stop offset="62%" stop-color="#e8e8e8"/>
			<stop offset="100%" stop-color="#8d8d8d"/>
		</radialGradient>
		<rect width="100%" height="100%" fill="url(#v)"/>
	</svg>`,
);

await mkdir(dirname(dest), { recursive: true });
const staged = await sharp({
	create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: '#a9a191' },
})
	.composite([
		{ input: painting, left: Math.round((CANVAS_W - paintingW) / 2 + 42), top: 208 },
		{ input: vignette, blend: 'multiply' },
	])
	.png()
	.toBuffer();

// The "bad light": dim, drab, flat, with the yellow cast of indoor bulbs —
// exactly what the demo's brightness/contrast step recovers.
await sharp(staged)
	.modulate({ brightness: 0.66, saturation: 0.72 })
	.linear(0.8, 24)
	.recomb([
		[1.07, 0, 0],
		[0, 1.0, 0],
		[0, 0, 0.86],
	])
	.jpeg({ quality: 72, mozjpeg: true })
	.toFile(dest);

console.log(`Wrote ${dest}`);
