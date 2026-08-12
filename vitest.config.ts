import { defineConfig, defaultExclude } from 'vitest/config';

// Parallel agent sessions get their own git worktrees under .claude/worktrees/,
// each a full checkout whose tests are mid-flight work. Without this exclude,
// `npm test` in the main checkout sweeps those files in too, so an agent's
// half-finished suite can fail the main merge gate (and test counts vary with
// how many worktrees happen to exist).
export default defineConfig({
	test: {
		exclude: [...defaultExclude, '.claude/worktrees/**', '.claude-worktrees/**'],
	},
});
