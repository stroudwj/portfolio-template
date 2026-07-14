// The license "session" is just the activated key + its instance id, kept in localStorage
// (same origin-scoped storage as the GitHub token). No server.
//
// SECURITY NOTE (accepted tradeoff): a client-side gate is inherently bypassable — a
// technical user can edit localStorage or the bundle. That's fine for this audience: it
// stops casual link-sharing, and Lemon Squeezy's per-key activation limits do the rest.
// Same pragmatic philosophy as keeping the GitHub token in localStorage.
import { readJson, writeJson, removeKey } from '../storage';

const LICENSE_KEY = 'portfolio-editor:license';

export interface StoredLicense {
	key: string;
	instanceId: string;
}

export function getLicense(): StoredLicense | null {
	return readJson<StoredLicense>(LICENSE_KEY);
}

export function setLicense(license: StoredLicense): void {
	writeJson(LICENSE_KEY, license);
}

export function clearLicense(): void {
	removeKey(LICENSE_KEY);
}
