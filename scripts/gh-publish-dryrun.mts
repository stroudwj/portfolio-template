// Live end-to-end check of the GitHub publishing pipeline, outside the browser.
//
// It exercises the SAME GitHubTarget the editor uses: it creates a repo from the
// template in your account, commits a tiny portfolio, enables Pages, prints the live
// URL, then publishes a second time (adding an image) to prove that re-publishing
// UPDATES the existing repo instead of recreating it.
//
// Usage:
//   GH_TOKEN=<fine-grained token>  npx tsx scripts/gh-publish-dryrun.mts [repo-name]
//
// The token needs (fine-grained, All repositories): Administration, Contents, Pages =
// Read and write. The repo it creates is public; delete it from GitHub when done.
import { GitHubClient } from '../src/editor/lib/github/client.ts';
import { GitHubTarget } from '../src/editor/lib/github/target.ts';
import type { RepoInfo, RepoStore } from '../src/editor/lib/github/store.ts';
import { validateToken } from '../src/editor/lib/github/session.ts';
import type { PortfolioBundle } from '../src/editor/lib/exporter.ts';
import { blankContent } from '../src/editor/lib/content-init.ts';
import { ASTRO_CONFIG_PATH, PRODUCT_SITE_FLAG_PATH } from '../src/editor/lib/github/config.ts';
import { base64ToUtf8 } from '../src/editor/lib/github/base64.ts';

const token = process.env.GH_TOKEN;
if (!token) {
	console.error('Set GH_TOKEN to a fine-grained token (Administration, Contents, Pages = write).');
	process.exit(1);
}
const repoName = process.argv[2] || `portfolio-dryrun-${Date.now().toString(36)}`;

// A trivial 1x1 PNG so we commit a real binary blob.
const PNG_1x1 = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
	(c) => c.charCodeAt(0),
);

function memStore(initial: RepoInfo | null): RepoStore {
	let saved = initial;
	return { load: () => saved, save: (i) => (saved = i) };
}

function bundle(withSecondImage: boolean): PortfolioBundle {
	const files = [{ path: 'src/assets/art/01-hello.png', bytes: PNG_1x1 }];
	if (withSecondImage) files.push({ path: 'src/assets/art/02-world.png', bytes: PNG_1x1 });
	return { contentJson: { ...blankContent, site: { ...blankContent.site, name: 'Dry Run' } }, files };
}

const log = (p: { step: string; detail?: string }) => console.log(`   • ${p.step}${p.detail ? ` (${p.detail})` : ''}`);

async function main() {
	const user = await validateToken(token);
	console.log(`Connected as @${user.login}. Repo: ${user.login}/${repoName}\n`);
	const store = memStore(null);
	const mk = () => new GitHubTarget({ client: new GitHubClient(token!), login: user.login, store, desiredRepoName: repoName });

	console.log('First publish (creates repo):');
	const first = await mk().publish(bundle(false), log);
	console.log(`\n✅ Live at: ${first.url}\n   Repo:    ${first.repoUrl}\n`);

	console.log('Second publish (adds an image; should UPDATE, not recreate):');
	const second = await mk().publish(bundle(true), log);
	console.log(`\n✅ Updated: ${second.url}`);

	// The published repo must NOT be a product site: flag flipped off, config rewritten.
	const client = new GitHubClient(token!);
	const read = async (path: string) => {
		const { data } = await client.request<{ content: string }>(
			`/repos/${user.login}/${repoName}/contents/${path}`,
		);
		return base64ToUtf8(data.content);
	};
	const flag = await read(PRODUCT_SITE_FLAG_PATH);
	if (!flag.includes('IS_PRODUCT_SITE = false')) throw new Error(`${PRODUCT_SITE_FLAG_PATH} was not flipped to false`);
	const config = await read(ASTRO_CONFIG_PATH);
	if (!config.includes(`site: 'https://${user.login}.github.io'`) || !config.includes(`base: '/${repoName}'`))
		throw new Error('astro.config.mjs site/base were not rewritten for the published repo');
	console.log('✅ Published repo checks: product-site flag off, site/base rewritten.');
	console.log('\nDone. Verify the site loads, then delete the repo from GitHub if this was a test.');
}
main().catch((e) => {
	console.error('\n✕ Dry run failed:', e?.friendly || e?.message || e);
	process.exit(1);
});
