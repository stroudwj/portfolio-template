// Owner-provided sample masters for the starter catalog (BACKLOG spec 19).
//
// These are William Stroud's own photographs; he granted sample-use rights for
// Hangwork starters in-session on 2026-08-09 (recorded in
// src/editor/lib/starters/SOURCES.md). They are not museum works: there is no
// external accession number, object page, or source image URL, so those fields
// stay empty and validateStarterCatalog exempts artist-provided entries from
// the museum-provenance requirement. vj02.png (a double exposure containing
// Earth-from-space imagery of uncertain origin) was deliberately left
// uncataloged — see SOURCES.md.
import type { SampleArtwork } from './sample-artwork';

const STROUD_RIGHTS =
	'Owner-provided: William Stroud granted sample-use rights for Hangwork starters in-session, 2026-08-09; see src/editor/lib/starters/SOURCES.md.';

const FILM_SERIES = 'assets/starters/new-starters-aug-8/photography/film-series';
const PHOTO_SERIES = 'assets/starters/new-starters-aug-8/photography/photo-series';

function stroudArtwork(
	entry: Pick<SampleArtwork, 'id' | 'url' | 'width' | 'height' | 'title' | 'alt' | 'checksum'>,
): SampleArtwork {
	return {
		...entry,
		aspectRatio: entry.width / entry.height,
		creator: 'William Stroud',
		credit: `William Stroud. ${entry.title}. Courtesy of the artist.`,
		source: 'Artist provided',
		objectUrl: '',
		rightsProof: STROUD_RIGHTS,
		accessionNumber: '',
		sourceImageUrl: '',
		downloadedAt: '2026-08-09',
		status: 'active',
	};
}

export const STROUD_ARTWORKS: SampleArtwork[] = [
	// Film series — black-and-white 35mm scans, borders kept (part of the work).
	stroudArtwork({
		id: 'photography-stroud-film-01-v1',
		url: `${FILM_SERIES}/01-portrait-by-the-pond.jpg`,
		width: 848,
		height: 635,
		title: 'Portrait by the Pond',
		alt: 'A young woman faces the camera in front of a park pond, her long hair lifted upward by the wind.',
		checksum: 'sha256:1f191821d3b236fe723bdda3594d4bc7e2f68acc4684efa9c17f3c6bff4d5503',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-02-v1',
		url: `${FILM_SERIES}/02-birds-over-the-valley.jpg`,
		width: 848,
		height: 635,
		title: 'Birds over the Valley',
		alt: 'Large birds circle under heavy clouds above a scrubby hillside and a mountain valley.',
		checksum: 'sha256:f984f96a4820b97e27d70e20b37ae9777cc03b130691cb7f465a8ef8c090feb8',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-03-v1',
		url: `${FILM_SERIES}/03-city-through-the-trees.jpg`,
		width: 848,
		height: 635,
		title: 'City through the Trees',
		alt: 'A hazy city with twin high-rise towers seen from a hillside between two bare trees.',
		checksum: 'sha256:96b0ea3fe0541b1a0fa03f318b21cb391a34a6c789f3c981d4d027f37597ec7e',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-04-v1',
		url: `${FILM_SERIES}/04-steam-in-the-valley.jpg`,
		width: 848,
		height: 635,
		title: 'Steam in the Valley',
		alt: 'A column of steam rises from a dark valley floor beside a river, with an animal grazing in the foreground.',
		checksum: 'sha256:4a0defad8ceded62a1f4f00377f8b34e846059cab8987c9b8a323eec37e120d8',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-05-v1',
		url: `${FILM_SERIES}/05-figure-among-pines.jpg`,
		width: 848,
		height: 635,
		title: 'Figure among Pines',
		alt: 'A figure dressed in black stands between tall bare pine trunks in a dense plantation forest.',
		checksum: 'sha256:e7dc03b00046d905d9c6a9ece3ec01a75b4c0a5bc59d76f910d341a6700a546d',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-06-v1',
		url: `${FILM_SERIES}/06-under-the-overpass.jpg`,
		width: 848,
		height: 635,
		title: 'Under the Overpass',
		alt: 'Curved glass towers and a sweeping overpass rise over pedestrians and parked cars in deep shadow.',
		checksum: 'sha256:fc8fd2c571a1189b51bac1280140664a9f4e8265986e8aa83c405960e8b3289a',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-07-v1',
		url: `${FILM_SERIES}/07-bend-above-the-town.jpg`,
		width: 848,
		height: 635,
		title: 'Bend above the Town',
		alt: 'A wet road curves around a stone retaining wall past a bare tree, with a town in the mist below.',
		checksum: 'sha256:a0aa31aa5222ed29439214de2163f6e34875c2d585ba709689e7730f510e818c',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-08-v1',
		url: `${FILM_SERIES}/08-house-in-the-thicket.jpg`,
		width: 821,
		height: 619,
		title: 'House in the Thicket',
		alt: 'An old two-story house with a long balcony stands behind overgrown trees and a stone wall.',
		checksum: 'sha256:a5788585b2cd02c72dbe2e533284fbb62a74e3cb95afc0d7bc10e2c53a155f63',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-09-v1',
		url: `${FILM_SERIES}/09-palms-and-towers.jpg`,
		width: 848,
		height: 635,
		title: 'Palms and Towers',
		alt: 'Two palm trees and two silhouetted figures framed by glass office towers and low clouds.',
		checksum: 'sha256:a8a3fa25dc35c1a671b31f050dced6e12f03b6e681a9b60da7c2a8da0857581a',
	}),
	stroudArtwork({
		id: 'photography-stroud-film-10-v1',
		url: `${FILM_SERIES}/10-grazing-horse.jpg`,
		width: 411,
		height: 310,
		title: 'Grazing Horse',
		alt: 'A dark horse grazes on a grassy hillside beside a small pine, above a valley town.',
		checksum: 'sha256:9104ed07cb606dfd42aca2df4189a9ae777b2d4661c76ccc6ecfafbb9297ea23',
	}),
	// Photo series — color night and dusk photographs with expressive grading.
	// Frame numbers keep the mapping to the original vj masters; 02 is the
	// deliberately skipped double exposure.
	stroudArtwork({
		id: 'photography-stroud-photo-01-v1',
		url: `${PHOTO_SERIES}/01-deer-at-dusk.jpg`,
		width: 896,
		height: 598,
		title: 'Deer at Dusk',
		alt: 'Deer graze in mist beneath dark trees at dusk, with a band of sunset light behind them.',
		checksum: 'sha256:e53e50537e66c66c5b867628425a7472bb334028a4c34c522babcc43bff616da',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-03-v1',
		url: `${PHOTO_SERIES}/03-fog-in-the-park.jpg`,
		width: 896,
		height: 598,
		title: 'Fog in the Park',
		alt: 'Orange-lit fog drifts through dark park trees under a violet sky at dusk.',
		checksum: 'sha256:9cbe10f2edb45f6ff35901d9b40563ff8cecb86adb4d5ad43b73347721e578aa',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-04-v1',
		url: `${PHOTO_SERIES}/04-under-the-cypress.jpg`,
		width: 896,
		height: 598,
		title: 'Under the Cypress',
		alt: 'A blurred vehicle with lit windows passes beneath a broad cypress tree against a violet evening sky.',
		checksum: 'sha256:2e3fc36d3d9fdc5b5b6f62e362457aac44ee66e921f4f62cea29bb0a45bb05d4',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-05-v1',
		url: `${PHOTO_SERIES}/05-farmhouse-and-storm.jpg`,
		width: 896,
		height: 598,
		title: 'Farmhouse and Storm',
		alt: 'A plain farmhouse and outbuildings on a prairie sit under a towering storm cloud at nightfall.',
		checksum: 'sha256:5033f796d4640d1a3e24653f22d2c05d51358446e57a4b19474e77bebabd472d',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-06-v1',
		url: `${PHOTO_SERIES}/06-two-deer.jpg`,
		width: 896,
		height: 598,
		title: 'Two Deer',
		alt: 'Two deer stand in tall grass at twilight while a streak of light crosses the trees behind them.',
		checksum: 'sha256:3b778117dc690149228a0ef42b980956ba49e554b404cb32b5cda76a8f0bb2f9',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-07-v1',
		url: `${PHOTO_SERIES}/07-cupola-at-dusk.jpg`,
		width: 896,
		height: 598,
		title: 'Cupola at Dusk',
		alt: 'A brick building with a glowing cupola and lit arched windows stands silhouetted between bare trees at dusk.',
		checksum: 'sha256:c716bfd02dc5b9ad256da06c2f16bcc32d8450cb70b33bd9ed8f4aa69b7ffadc',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-08-v1',
		url: `${PHOTO_SERIES}/08-fog-in-the-hollow.jpg`,
		width: 896,
		height: 598,
		title: 'Fog in the Hollow',
		alt: 'A wire fence line crosses a hillside above a hollow filled with glowing orange fog at night.',
		checksum: 'sha256:774d0510b1ebab69f28e46260fa5bc1640be65200a50c1e4b92b760309d297f4',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-09-v1',
		url: `${PHOTO_SERIES}/09-cloud-over-the-trees.jpg`,
		width: 896,
		height: 598,
		title: 'Cloud over the Trees',
		alt: 'A sunset-lit cloud hangs in a darkening sky above the silhouettes of full treetops.',
		checksum: 'sha256:98c69b8be919b360e855085f5cc6f2ac651be50a1f5c185d3cedba3757b1572a',
	}),
	stroudArtwork({
		id: 'photography-stroud-photo-10-v1',
		url: `${PHOTO_SERIES}/10-light-over-the-tracks.jpg`,
		width: 896,
		height: 598,
		title: 'Light over the Tracks',
		alt: 'A bright flare of light glows above a house beside rail tracks shining in the dark.',
		checksum: 'sha256:0e196879819aa9069e2cab0f6f7ac0063965c4302025645113311cef99a50f3c',
	}),
];
