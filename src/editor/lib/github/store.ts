// Remembers which repo a portfolio was published to, plus the set of files the last
// publish wrote. On the next publish we diff against `lastManifest` to delete whatever
// the user removed, and we skip repo creation because we already have one.
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
	try {
		const raw = localStorage.getItem(REPO_KEY);
		return raw ? (JSON.parse(raw) as RepoInfo) : null;
	} catch {
		return null;
	}
}

export function saveRepoInfo(info: RepoInfo): void {
	try {
		localStorage.setItem(REPO_KEY, JSON.stringify(info));
	} catch {
		/* non-fatal */
	}
}

export function clearRepoInfo(): void {
	try {
		localStorage.removeItem(REPO_KEY);
	} catch {
		/* non-fatal */
	}
}

/** Injectable so the target can be unit-tested without touching localStorage. */
export interface RepoStore {
	load(): RepoInfo | null;
	save(info: RepoInfo): void;
}

export const localRepoStore: RepoStore = { load: loadRepoInfo, save: saveRepoInfo };
