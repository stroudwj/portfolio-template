// Minimal HS256 JWT for the Worker — signs session tokens AND short-lived upload
// tickets with the same SESSION_SECRET, so there is exactly one signing mechanism
// to reason about. No dependencies; WebCrypto only.

const encoder = new TextEncoder();

function b64url(bytes) {
	let s = '';
	for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
	const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const raw = atob(padded);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

async function hmacKey(secret) {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);
}

/** Sign `claims` (an object) into a compact JWT. Caller supplies `exp` (unix seconds). */
export async function signJwt(claims, secret) {
	const header = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
	const payload = b64url(encoder.encode(JSON.stringify(claims)));
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`${header}.${payload}`));
	return `${header}.${payload}.${b64url(signature)}`;
}

/** Verify signature + expiry; return the claims object, or null on ANY failure. */
export async function verifyJwt(token, secret) {
	if (typeof token !== 'string') return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		const ok = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(secret),
			b64urlDecode(parts[2]),
			encoder.encode(`${parts[0]}.${parts[1]}`),
		);
		if (!ok) return null;
		const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
		if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
		return claims;
	} catch {
		return null;
	}
}

/** Decode a JWT payload WITHOUT verifying — only for tokens received directly from a
 *  trusted issuer over TLS (Google's token endpoint response), never for user input. */
export function decodeJwtPayload(token) {
	try {
		return JSON.parse(new TextDecoder().decode(b64urlDecode(token.split('.')[1])));
	} catch {
		return null;
	}
}

/** Read the Bearer token from an Authorization header, or null. */
export function bearerToken(request) {
	const header = request.headers.get('Authorization') || '';
	return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}
