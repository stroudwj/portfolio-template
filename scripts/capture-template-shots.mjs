// Template shots: one real screenshot of every catalog template's rendered home
// page, written to public/assets/starters/shots/<id>.webp for the intake tiles,
// the template picker, the start-screen grid, the /templates page, and the
// template-studio dashboard (BACKLOG spec 37B).
//
// Regenerate them all with:
//
//     node scripts/capture-template-shots.mjs
//
// or a subset with `node scripts/capture-template-shots.mjs conservatory signal`.
// Batch 3's starters need nothing new: add the starter to the registry, run this
// command, commit the .webp beside it.
//
// How it works. The script starts its own Astro dev server (the shots must come
// from the real renderer, and the dev-only template studio is what opens a
// starter without touching anyone's draft), opens
// `/editor?template-studio=starter:<id>` per template, enters the fullscreen
// preview — the view the editor itself labels "shown exactly as your published
// site" — and screenshots the preview iframe. The PNG is then downscaled and
// re-encoded to webp inside the same browser (canvas.convertToBlob), so the
// repo carries card-sized images and no image dependency is added to
// package.json.
//
// Playwright is not a repo dependency; it lives in the npx cache (see the
// `verify` skill). This resolves it from node_modules first, then that cache.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/assets/starters/shots');
const startersDir = join(root, 'src/editor/lib/starters');

/** Card geometry. Captured wide at 2x, written at the picker's card size. */
const VIEWPORT = { width: 1440, height: 900 };
const SHOT = { width: 720, height: 450, quality: 0.82 };
const PORT = Number(process.env.SHOT_PORT ?? 4459);
/** Astro bumps the port when one is taken, so the URL comes from its output. */
let origin = `http://localhost:${PORT}`;

function starterIds() {
	return readdirSync(startersDir)
		.filter((file) => file.endsWith('.content.json'))
		.map((file) => file.replace('.content.json', ''))
		.sort();
}

async function loadPlaywright() {
	const require = createRequire(import.meta.url);
	try {
		return await import(require.resolve('playwright', { paths: [root] }));
	} catch {
		// npx cache: ~/.npm/_npx/<hash>/node_modules/playwright
		const cache = join(homedir(), '.npm/_npx');
		for (const entry of readdirSync(cache)) {
			const candidate = join(cache, entry, 'node_modules/playwright/index.mjs');
			try {
				return await import(candidate);
			} catch {
				/* keep looking */
			}
		}
	}
	throw new Error(
		'Playwright was not found. Install it (npm i -D playwright) or run `npx playwright@1.61 --version` once to populate the npx cache.',
	);
}

function startDevServer() {
	// Detached so the whole npx → astro → vite group can be killed at the end;
	// otherwise the script's own exit waits on a server nobody is watching.
	const child = spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	});
	const ready = new Promise((resolveReady, rejectReady) => {
		let output = '';
		const onData = (chunk) => {
			output += chunk.toString();
			const found = output.match(/http:\/\/localhost:(\d+)/);
			if (found) {
				origin = `http://localhost:${found[1]}`;
				resolveReady();
			}
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.on('exit', (code) =>
			rejectReady(new Error(`astro dev exited with ${code}:\n${output}`)),
		);
		setTimeout(() => rejectReady(new Error(`astro dev did not start:\n${output}`)), 90_000);
	});
	return { child, ready };
}

/** Reject rather than hang: the editor is a long-lived SPA and a wedged preview
 * would otherwise stall the whole run. */
function withDeadline(promise, ms, what) {
	let timer;
	return Promise.race([
		promise.finally(() => clearTimeout(timer)),
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
		}),
	]);
}

async function captureOne(browser, id) {
	// One page per template: editor state (and its beforeunload guard) never
	// leaks from one capture into the next.
	const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	page.setDefaultTimeout(45_000);
	page.setDefaultNavigationTimeout(45_000);
	try {
		return await withDeadline(capturePage(page, id), 90_000, `${id} capture`);
	} finally {
		await page.close({ runBeforeUnload: false }).catch(() => {});
	}
}

async function capturePage(page, id) {
	const url = `${origin}/portfolio-template/editor?template-studio=starter:${id}`;
	await page.goto(url, { waitUntil: 'networkidle' });
	// The dev toolbar is a dev-server artifact, never part of a published site.
	await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
	await page.locator('[aria-label="Preview your published site fullscreen"]').click();
	const frame = page.frameLocator('.device-frame, iframe').first();
	await frame.locator('body').waitFor();
	// Fonts, sample images, and the once-per-mount entrance motion all settle.
	// A fixed settle beats polling the iframe's images: walking the preview
	// document from the parent frame crashes the tab on templates with a
	// marquee (still-room), and the screenshot itself waits for stability.
	await page.waitForTimeout(5000);
	return page.locator('iframe').first().screenshot({ type: 'png' });
}

/** Downscale + re-encode in the browser: no image library in package.json. */
async function toWebp(page, png) {
	const base64 = png.toString('base64');
	const encoded = await page.evaluate(
		async ({ source, width, height, quality }) => {
			const blob = await (await fetch(`data:image/png;base64,${source}`)).blob();
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d');
			// Cover-crop from the top: a card shows the first screen of the page.
			const scale = Math.max(width / bitmap.width, height / bitmap.height);
			context.drawImage(bitmap, 0, 0, bitmap.width * scale, bitmap.height * scale);
			const out = await canvas.convertToBlob({ type: 'image/webp', quality });
			const buffer = new Uint8Array(await out.arrayBuffer());
			let binary = '';
			for (const byte of buffer) binary += String.fromCharCode(byte);
			return btoa(binary);
		},
		{ source: base64, ...SHOT },
	);
	return Buffer.from(encoded, 'base64');
}

const requested = process.argv.slice(2);
const ids = requested.length ? requested : starterIds();
const unknown = ids.filter((id) => !starterIds().includes(id));
if (unknown.length) throw new Error(`Unknown starter(s): ${unknown.join(', ')}`);

const log = (message) => process.stderr.write(`${message}\n`);

const { chromium } = await loadPlaywright();
log('playwright loaded');
const server = startDevServer();
let browser;
try {
	await server.ready;
	log(`dev server ${origin}`);
	mkdirSync(outDir, { recursive: true });
	browser = await chromium.launch();
	const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	const encoder = await browser.newPage();
	await encoder.goto('about:blank');
	for (const id of ids) {
		let png;
		try {
			png = await captureOne(browser, id);
		} catch (error) {
			log(`  (${id}: retrying after ${String(error).split('\n')[0]})`);
			png = await captureOne(browser, id);
		}
		const webp = await toWebp(encoder, png);
		writeFileSync(join(outDir, `${id}.webp`), webp);
		log(`${id}.webp  ${(webp.length / 1024).toFixed(0)} KB`);
	}
} finally {
	// The editor guards an unsaved draft with beforeunload, which can stall a
	// polite close; the run is done either way, so it gets five seconds.
	await Promise.race([
		browser?.close().catch(() => {}) ?? Promise.resolve(),
		new Promise((done) => setTimeout(done, 5000)),
	]);
	try {
		process.kill(-server.child.pid, 'SIGTERM');
	} catch {
		server.child.kill('SIGTERM');
	}
	process.exit(0);
}
