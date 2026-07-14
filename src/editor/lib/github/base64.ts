// Base64 <-> bytes helpers shared by the Git Data commit path (encode image blobs) and the
// load path (decode blobs the Blobs/Contents API returns base64-encoded).

/** Base64-encode bytes in chunks (avoids call-stack limits on large images). */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/** Decode base64 (tolerating the newlines GitHub inserts) into raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64.replace(/\s/g, ''));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Decode base64 to a UTF-8 string (e.g. a text file the Contents API returns). */
export function base64ToUtf8(base64: string): string {
	return new TextDecoder().decode(base64ToBytes(base64));
}
