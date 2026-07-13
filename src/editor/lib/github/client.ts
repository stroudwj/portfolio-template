// A thin wrapper over the GitHub REST API for the browser. `api.github.com` sends CORS
// headers for token-authenticated requests, so the editor talks to GitHub directly with
// no proxy. `fetch` is injectable so the whole publish flow can be unit-tested offline.
import { GITHUB_API } from './config';

export type FetchFn = typeof fetch;

/** A GitHub API error carrying the HTTP status and a friendly, user-facing message. */
export class GitHubError extends Error {
	constructor(
		public status: number,
		public friendly: string,
		public raw?: unknown,
	) {
		super(friendly);
		this.name = 'GitHubError';
	}
}

export interface RequestOptions {
	method?: string;
	body?: unknown;
	/** Treat these statuses as success (return the response, don't throw). */
	allow?: number[];
}

export class GitHubClient {
	constructor(
		private token: string,
		private fetchImpl: FetchFn = fetch,
	) {}

	/** Perform a request; parse JSON; throw a friendly GitHubError on failure. */
	async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<{ status: number; data: T }> {
		const url = path.startsWith('http') ? path : GITHUB_API + path;
		let res: Response;
		try {
			res = await this.fetchImpl(url, {
				method: opts.method ?? 'GET',
				headers: {
					Authorization: `Bearer ${this.token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
					...(opts.body ? { 'Content-Type': 'application/json' } : {}),
				},
				body: opts.body ? JSON.stringify(opts.body) : undefined,
			});
		} catch {
			throw new GitHubError(0, "Couldn't reach GitHub. Check your internet connection and try again.");
		}

		const text = await res.text();
		const data = text ? safeJson(text) : undefined;

		if (res.ok || opts.allow?.includes(res.status)) {
			return { status: res.status, data: data as T };
		}
		throw new GitHubError(res.status, friendlyMessage(res.status, data), data);
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/** Map raw GitHub failures to plain-language, actionable messages for non-technical users. */
export function friendlyMessage(status: number, data: unknown): string {
	const apiMsg = typeof data === 'object' && data && 'message' in data ? String((data as { message: unknown }).message) : '';
	switch (status) {
		case 401:
			return 'Your GitHub connection has expired or the token was revoked. Please reconnect GitHub.';
		case 403:
			if (/rate limit/i.test(apiMsg)) return 'GitHub is rate-limiting requests. Please wait a minute and try again.';
			if (/SSO|SAML/i.test(apiMsg)) return 'Your organization requires SSO for this token. Authorize it in GitHub, then retry.';
			return "GitHub refused the request — your token may be missing a permission. Reconnect with 'Administration', 'Contents', and 'Pages' set to Read and write.";
		case 404:
			return "GitHub couldn't find that repository. It may have been deleted or renamed.";
		case 422:
			if (/name already exists/i.test(apiMsg)) return 'A repository with that name already exists. Please choose a different name.';
			return apiMsg || 'GitHub rejected the request as invalid. Please check your inputs and try again.';
		default:
			return apiMsg ? `GitHub error: ${apiMsg}` : `Something went wrong talking to GitHub (status ${status}).`;
	}
}
