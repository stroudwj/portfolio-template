// Shared response helpers — the same fail-closed CORS shape the worker has always used,
// extracted so the auth/publish/site route modules can build responses without circular
// imports back into worker.js.

export function cors(origin) {
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}

export function json(body, status, origin) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...cors(origin) },
	});
}

/** Parse a JSON request body; null on failure (caller answers 400). */
export async function readJson(request) {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export function isEmailAddress(value) {
	return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
