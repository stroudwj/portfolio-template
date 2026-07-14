// Tiny localStorage helpers: JSON in/out with the "storage may be unavailable or corrupt,
// never throw" guarantee every caller wants. Reads return null on any failure; writes and
// removes swallow quota/unavailable errors (non-fatal — autosave/session, not source of truth).

export function readJson<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function writeJson(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* quota/unavailable — non-fatal */
	}
}

export function removeKey(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		/* non-fatal */
	}
}

export function hasKey(key: string): boolean {
	try {
		return localStorage.getItem(key) != null;
	} catch {
		return false;
	}
}
