// Remembers which repo a portfolio was published to, plus the set of files the last
// publish wrote. On the next publish we diff against `lastManifest` to delete whatever
// the user removed, and we skip repo creation because we already have one.
import { readJson, writeJson } from '../storage';

export interface RepoInfo {
	owner: string;
	repo: string;
	branch: string;
	pagesUrl?: string;
	/** Managed paths written by the last publish (content.json + image paths). */
	lastManifest: string[];
}

const REPO_KEY = 'portfolio-editor:gh-repo';

export function loadRepoInfo(): RepoInfo | null {
	return readJson<RepoInfo>(REPO_KEY);
}

export function saveRepoInfo(info: RepoInfo): void {
	writeJson(REPO_KEY, info);
}

// Injectable store so GitHubTarget can run outside the browser — the Node publish
// dry-run (scripts/gh-publish-dryrun.mts) has no localStorage and supplies an in-memory
// store so its "re-publish UPDATES the repo" check works across two publishes.
export interface RepoStore {
	load(): RepoInfo | null;
	save(info: RepoInfo): void;
}

export const localRepoStore: RepoStore = { load: loadRepoInfo, save: saveRepoInfo };
