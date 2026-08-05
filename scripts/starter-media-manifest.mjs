// Prints width/height/sha256 and a fill-in SampleArtwork skeleton for every JPEG
// in a starter media folder, computed from the final on-disk bytes — the same
// hashing and dimension parsing tests/starter-catalog.test.ts verifies against.
//
//   node scripts/starter-media-manifest.mjs public/assets/starters/<starter>
//
// Paste the printed entries into src/editor/lib/sample-artwork.ts and fill in
// title/alt/creator/credit/objectUrl/accession/sourceImageUrl by hand — rights
// metadata is curated, never scraped blindly.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

function jpegDimensions(bytes) {
	let offset = 2;
	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1];
		const length = bytes.readUInt16BE(offset + 2);
		if (marker >= 0xc0 && marker <= 0xc3)
			return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
		offset += 2 + length;
	}
	throw new Error('JPEG dimensions were not found');
}

const folder = process.argv[2];
if (!folder) {
	console.error('Usage: node scripts/starter-media-manifest.mjs public/assets/starters/<starter>');
	process.exit(1);
}

const starter = path.basename(folder);
for (const file of readdirSync(folder).filter((name) => name.endsWith('.jpg')).sort()) {
	const bytes = readFileSync(path.join(folder, file));
	const { width, height } = jpegDimensions(bytes);
	const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
	console.log(`	{
		id: '${starter}-met-FILLME-v1',
		url: 'assets/starters/${starter}/${file}',
		width: ${width},
		height: ${height},
		aspectRatio: ${width} / ${height},
		title: 'FILLME',
		alt: 'FILLME',
		creator: 'FILLME',
		credit: 'FILLME. FILLME, FILLME. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'FILLME',
		rightsProof: MET_RIGHTS,
		accessionNumber: 'FILLME',
		sourceImageUrl: 'FILLME',
		downloadedAt: '${new Date().toISOString().slice(0, 10)}',
		checksum: '${checksum}',
		status: 'active',
	},`);
}
