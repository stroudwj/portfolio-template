// Configuration for GitHub publishing. The template repo below is the source that
// `POST /repos/{owner}/{repo}/generate` clones into each user's own account, so it
// MUST be marked as a "Template repository" in its GitHub settings for publishing to
// work. If you fork this template under a different account, change these two values.
export const TEMPLATE_REPO = { owner: 'stroudwj', repo: 'portfolio-template' } as const;

export const GITHUB_API = 'https://api.github.com';

/** The gallery/profile folders the editor owns and is allowed to add/replace/remove. */
export const CONTENT_JSON_PATH = 'src/data/content.json';
export const ASTRO_CONFIG_PATH = 'astro.config.mjs';

/**
 * Pre-filled fine-grained token page. We can't pre-select permissions/repos via URL for
 * fine-grained tokens (GitHub only supports scope pre-fill for classic tokens), so the
 * modal spells out exactly what to grant; this link just opens the right page with a name.
 */
export const NEW_TOKEN_URL =
	'https://github.com/settings/personal-access-tokens/new?name=Portfolio%20Publisher';

/** Human-readable list of the fine-grained permissions the publish flow needs. */
export const REQUIRED_PERMISSIONS = [
	{ name: 'Administration', access: 'Read and write', why: 'create your website repository' },
	{ name: 'Contents', access: 'Read and write', why: 'upload your text and images' },
	{ name: 'Pages', access: 'Read and write', why: 'turn your website on' },
] as const;
