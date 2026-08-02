import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const portfolioDir = new URL('../src/portfolio/', import.meta.url);

function cssImports(source: string, syntax: 'typescript' | 'css'): string[] {
	const pattern = syntax === 'typescript'
		? /import\s+['"]\.\/([^'"]+\.css)['"]/g
		: /@import\s+['"]\.\/([^'"]+\.css)['"]/g;
	return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe('editor portfolio preview styles', () => {
	it('aggregates every component stylesheet used by the published portfolio', () => {
		const componentStyles = new Set(
			readdirSync(portfolioDir)
				.filter((file) => file.endsWith('.tsx'))
				.flatMap((file) =>
					cssImports(readFileSync(new URL(file, portfolioDir), 'utf8'), 'typescript'),
				),
		);
		const previewStyles = new Set(
			cssImports(readFileSync(new URL('preview.css', portfolioDir), 'utf8'), 'css'),
		);

		expect([...componentStyles].filter((file) => !previewStyles.has(file)).sort()).toEqual([]);
	});
});
