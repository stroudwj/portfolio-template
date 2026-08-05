// Dev-server-only half of the template studio: an Astro integration that mounts
// the save API and stops template-JSON writes from hot-reloading the editor.
// This file is intentionally outside src/ (unhashed by the runtime manifest) and
// is imported by astro.config.mjs behind a try/catch, so runtime installs that
// don't ship dev tooling still load the config cleanly.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Mirrored in src/editor/lib/template-studio.ts (TEMPLATE_STUDIO_API).
const API_MOUNT = '/__template-studio';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const startersDir = path.join(repoRoot, 'src', 'editor', 'lib', 'starters');
const presetsDir = path.join(repoRoot, 'src', 'editor', 'lib', 'theme-presets');
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function isTemplateDataFile(file) {
	return (file.startsWith(startersDir) || file.startsWith(presetsDir)) && file.endsWith('.json');
}

export function templateStudio() {
	return {
		name: 'hangwork-template-studio',
		hooks: {
			'astro:config:setup': ({ command, updateConfig }) => {
				if (command !== 'dev') return;
				updateConfig({
					vite: {
						plugins: [
							{
								name: 'hangwork-template-studio-hmr',
								// A studio save writes JSON that sits in the editor SPA's import
								// graph; without this the save would full-reload the page and
								// clear undo history. Fresh page loads still read the new file —
								// hand edits to template JSON need a manual browser reload.
								handleHotUpdate(ctx) {
									if (isTemplateDataFile(ctx.file)) return [];
								},
							},
						],
					},
				});
			},
			'astro:server:setup': ({ server }) => {
				server.middlewares.use(API_MOUNT, (req, res) => {
					void handle(server, req, res).catch((error) => {
						respond(res, 500, {
							issues: [error instanceof Error ? error.message : 'Unexpected template studio error.'],
						});
					});
				});
			},
		},
	};
}

function respond(res, status, body) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(body));
}

async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new Error('Save payload is too large.');
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

async function handle(server, req, res) {
	if (req.url === '/health') {
		res.statusCode = 204;
		res.end();
		return;
	}
	if (req.url !== '/save' || req.method !== 'POST') {
		respond(res, 404, { issues: ['Unknown template studio endpoint.'] });
		return;
	}
	let body;
	try {
		body = JSON.parse(await readBody(req));
	} catch {
		respond(res, 400, { issues: ['The save payload was not valid JSON.'] });
		return;
	}
	const { kind, id, payload } = body ?? {};
	if (
		(kind !== 'starter-content' && kind !== 'preset-tokens') ||
		typeof id !== 'string' ||
		payload === undefined
	) {
		respond(res, 400, { issues: ['The save request was missing kind, id, or payload.'] });
		return;
	}

	// Vite transforms the repo's real TS on demand — the same schema and catalog
	// rules the editor and the test suite use, never a parallel implementation.
	// File targets are derived from the registered catalog, never from client paths.
	const schema = await server.ssrLoadModule('/src/lib/content-schema.ts');
	const templates = await server.ssrLoadModule('/src/editor/lib/templates.ts');

	if (kind === 'starter-content') {
		const recipe = templates.STARTER_RECIPES.find(
			(candidate) => candidate.id === id && candidate.content,
		);
		if (!recipe) {
			respond(res, 404, { issues: [`No editable starter is registered as “${id}”.`] });
			return;
		}
		let parsed;
		try {
			parsed = schema.parseAndMigrateContent(payload);
		} catch (error) {
			const issues =
				error instanceof schema.ContentValidationError
					? error.issues.map((issue) => `${issue.path}: ${issue.message}`)
					: [error instanceof Error ? error.message : 'The template content failed validation.'];
			respond(res, 400, { issues });
			return;
		}
		const candidates = templates.STARTER_RECIPES.map((candidate) =>
			candidate.id === id ? { ...candidate, content: parsed } : candidate,
		);
		const issues = templates.validateStarterCatalog(candidates);
		if (issues.length) {
			respond(res, 400, { issues });
			return;
		}
		await writeFile(
			path.join(startersDir, `${id}.content.json`),
			JSON.stringify(parsed, null, 2) + '\n',
		);
		respond(res, 200, { ok: true });
		return;
	}

	const preset = templates.THEME_PRESETS.find((candidate) => candidate.id === id);
	if (!preset) {
		respond(res, 404, { issues: [`No theme preset is registered as “${id}”.`] });
		return;
	}
	const tokens = schema.themeSchema.safeParse(payload);
	if (!tokens.success) {
		respond(res, 400, {
			issues: tokens.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
		});
		return;
	}
	await writeFile(path.join(presetsDir, `${id}.json`), JSON.stringify(tokens.data, null, 2) + '\n');
	respond(res, 200, { ok: true });
}
