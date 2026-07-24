import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const releasePath = join(root, '.hangwork/runtime-release.json');
const projectPath = join(root, '.hangwork/project.json');

const fixedFiles = [
	'.github/workflows/deploy.yml',
	'astro.config.mjs',
	'package.json',
	'package-lock.json',
	'tsconfig.json',
	'public/editor-preview-frame.html',
];

async function walk(directory) {
	const entries = await readdir(join(root, directory), { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

function isRuntimeFile(path) {
	if (path.startsWith('src/data/') || path.startsWith('src/assets/')) return false;
	if (path.startsWith('public/assets/brand/')) return true;
	if (!path.startsWith('src/')) return fixedFiles.includes(path);
	return /\.(astro|css|d\.ts|ts|tsx)$/.test(path);
}

function digests(bytes) {
	const header = Buffer.from(`blob ${bytes.length}\0`);
	return {
		sha256: createHash('sha256').update(bytes).digest('hex'),
		gitBlobSha: createHash('sha1').update(header).update(bytes).digest('hex'),
	};
}

async function jsonFile(path) {
	return JSON.parse(await readFile(path, 'utf8'));
}

const discovered = [...fixedFiles, ...(await walk('src')), ...(await walk('public/assets/brand'))]
	.map((path) => relative(root, join(root, path)).replaceAll('\\', '/'))
	.filter(isRuntimeFile);
const paths = [...new Set(discovered)].sort();
const files = {};
for (const path of paths) files[path] = digests(await readFile(join(root, path)));

const previousRelease = await jsonFile(releasePath).catch(() => ({}));
const release = {
	formatVersion: 1,
	version: typeof previousRelease.version === 'string' ? previousRelease.version : '1.0.0',
	files,
};
const releaseText = `${JSON.stringify(release, null, 2)}\n`;
const project = await jsonFile(projectPath);
const nextProject = {
	...project,
	formatVersion: 1,
	runtimeVersion: release.version,
	managedFiles: {
		...files,
		'.hangwork/runtime-release.json': digests(Buffer.from(releaseText)),
	},
};
const projectText = `${JSON.stringify(nextProject, null, 2)}\n`;

if (checkOnly) {
	const [actualRelease, actualProject] = await Promise.all([
		readFile(releasePath, 'utf8'),
		readFile(projectPath, 'utf8'),
	]);
	if (actualRelease !== releaseText || actualProject !== projectText) {
		console.error('Runtime release metadata is stale. Run: npm run runtime:generate');
		process.exit(1);
	}
} else {
	await Promise.all([writeFile(releasePath, releaseText), writeFile(projectPath, projectText)]);
	console.log(`Generated runtime ${release.version} manifest for ${paths.length} files.`);
}
