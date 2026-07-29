export type SampleArtworkStatus = 'draft' | 'active' | 'retiring' | 'revoked';

/**
 * Product-owned artwork is addressed by an immutable id. Documents keep only
 * that id; pixels and rights metadata stay in this catalog so samples never
 * masquerade as browser uploads.
 */
export interface SampleArtwork {
	id: string;
	url: string;
	width: number;
	height: number;
	aspectRatio: number;
	title: string;
	alt: string;
	creator: string;
	credit: string;
	source:
		| 'Art Institute of Chicago'
		| 'The Metropolitan Museum of Art'
		| 'Wikimedia Commons'
		| 'Hangwork internal';
	objectUrl: string;
	rightsProof: string;
	accessionNumber: string;
	sourceImageUrl: string;
	downloadedAt: string;
	checksum: string;
	status: SampleArtworkStatus;
	retirementDate?: string;
	replacementId?: string;
}

const AIC_RIGHTS = 'https://www.artic.edu/open-access/open-access-images';
const MET_RIGHTS = 'https://www.metmuseum.org/policies/image-resources';
const WIKIMEDIA_RIGHTS =
	'https://commons.wikimedia.org/wiki/File:Autoportret_Claude_Monet.jpg#Licensing';

const artworks: SampleArtwork[] = [
	{
		id: 'painter-aic-14655-v1',
		url: 'assets/starters/painter/01-two-sisters.jpg',
		width: 1686,
		height: 2092,
		aspectRatio: 1686 / 2092,
		title: 'Two Sisters (On the Terrace)',
		alt: 'Two girls sit on a terrace above a river; one wears a bright red hat and holds a basket of yarn.',
		creator: 'Pierre-Auguste Renoir',
		credit: 'Pierre-Auguste Renoir. Two Sisters (On the Terrace), 1881. Art Institute of Chicago.',
		source: 'Art Institute of Chicago',
		objectUrl: 'https://www.artic.edu/artworks/14655',
		rightsProof: AIC_RIGHTS,
		accessionNumber: '1933.455',
		sourceImageUrl:
			'https://www.artic.edu/iiif/2/3a608f55-d76e-fa96-d0b1-0789fbc48f1e/full/1686,/0/default.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:a82cfe8c8a4fa4167463ecb16d2bdbb09dbe80c10a630db6197e4cce7a26a4f6',
		status: 'active',
	},
	{
		id: 'painter-aic-16571-v1',
		url: 'assets/starters/painter/02-arrival-at-saint-lazare.jpg',
		width: 1686,
		height: 1265,
		aspectRatio: 1686 / 1265,
		title: 'Arrival of the Normandy Train, Gare Saint-Lazare',
		alt: 'A steam train enters a glass-roofed station, filling the tracks and waiting crowd with pale smoke.',
		creator: 'Claude Monet',
		credit: 'Claude Monet. Arrival of the Normandy Train, Gare Saint-Lazare, 1877. Art Institute of Chicago.',
		source: 'Art Institute of Chicago',
		objectUrl: 'https://www.artic.edu/artworks/16571',
		rightsProof: AIC_RIGHTS,
		accessionNumber: '1933.1158',
		sourceImageUrl:
			'https://www.artic.edu/iiif/2/0f1cc0e0-e42e-be16-3f71-2022da38cb93/full/1686,/0/default.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:7e1adf4695cdb62c248973e65a608b4ec8114323cda944cf77599076fe0ee864',
		status: 'active',
	},
	{
		id: 'painter-aic-15468-v1',
		url: 'assets/starters/painter/03-saint-george-and-the-dragon.jpg',
		width: 1686,
		height: 2702,
		aspectRatio: 1686 / 2702,
		title: 'Saint George and the Dragon',
		alt: 'Saint George, in patterned armor on a white horse, drives a lance toward a green dragon.',
		creator: 'Bernat Martorell',
		credit: 'Bernat Martorell. Saint George and the Dragon, 1434–35. Art Institute of Chicago.',
		source: 'Art Institute of Chicago',
		objectUrl: 'https://www.artic.edu/artworks/15468',
		rightsProof: AIC_RIGHTS,
		accessionNumber: '1933.786',
		sourceImageUrl:
			'https://www.artic.edu/iiif/2/8a0e4ac9-43ea-bc3e-884b-ee27f8a10501/full/1686,/0/default.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:cf7cd83d66c5e96d3a5ecb4c7557dac7e694a40380dab3dc12dcbb07940c6698',
		status: 'active',
	},
	{
		id: 'painter-aic-100829-v1',
		url: 'assets/starters/painter/04-magnolias.jpg',
		width: 1686,
		height: 1036,
		aspectRatio: 1686 / 1036,
		title: 'Magnolias on Light Blue Velvet Cloth',
		alt: 'Four white magnolia blossoms and glossy leaves rest across folded blue velvet.',
		creator: 'Martin Johnson Heade',
		credit: 'Martin Johnson Heade. Magnolias on Light Blue Velvet Cloth, 1885–95. Art Institute of Chicago.',
		source: 'Art Institute of Chicago',
		objectUrl: 'https://www.artic.edu/artworks/100829',
		rightsProof: AIC_RIGHTS,
		accessionNumber: '1983.791',
		sourceImageUrl:
			'https://www.artic.edu/iiif/2/0729fbba-51e3-a2d7-6d4d-61c2be62af3f/full/1686,/0/default.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:559d865278abbe7691cdc5ff4aecaca0fe9ed16833baf8149c0ee0d47a839e7f',
		status: 'active',
	},
	{
		id: 'painter-aic-16551-v1',
		url: 'assets/starters/painter/05-beata-beatrix.jpg',
		width: 1686,
		height: 2468,
		aspectRatio: 1686 / 2468,
		title: 'Beata Beatrix',
		alt: 'A red-haired woman sits with closed eyes as a red bird approaches through a hazy golden light.',
		creator: 'Dante Gabriel Rossetti',
		credit: 'Dante Gabriel Rossetti. Beata Beatrix, 1871–72. Art Institute of Chicago.',
		source: 'Art Institute of Chicago',
		objectUrl: 'https://www.artic.edu/artworks/16551',
		rightsProof: AIC_RIGHTS,
		accessionNumber: '1925.722',
		sourceImageUrl:
			'https://www.artic.edu/iiif/2/194674a2-f451-65f7-ba46-6aac4d894f0b/full/1686,/0/default.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:fec0d4daa9ba95332d48e19d317b2fe1df5724d99630d6692a56127aaf08829e',
		status: 'active',
	},
	{
		id: 'painter-met-436533-v1',
		url: 'assets/starters/painter/06-shoes.jpg',
		width: 599,
		height: 501,
		aspectRatio: 599 / 501,
		title: 'Shoes',
		alt: 'A worn pair of brown leather shoes rests against a mottled blue-green ground.',
		creator: 'Vincent van Gogh',
		credit: 'Vincent van Gogh. Shoes, 1888. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/436533',
		rightsProof: MET_RIGHTS,
		accessionNumber: '1992.374',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ep/web-large/DT1947.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:670ede1be6b7dc145812b2ea1e8a36ead09b475a813be0442e0101a67b42ea02',
		status: 'active',
	},
	{
		id: 'painter-met-436528-v1',
		url: 'assets/starters/painter/07-irises.jpg',
		width: 599,
		height: 475,
		aspectRatio: 599 / 475,
		title: 'Irises',
		alt: 'White and violet irises spill from a green vase on a yellow tabletop.',
		creator: 'Vincent van Gogh',
		credit: 'Vincent van Gogh. Irises, 1890. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/436528',
		rightsProof: MET_RIGHTS,
		accessionNumber: '58.187',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP346474.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:2df23777df020586fddefd46891b24ae5eda2094b6b2e5d03a12c236eed4f248',
		status: 'active',
	},
	{
		id: 'painter-met-436532-v1',
		url: 'assets/starters/painter/08-self-portrait-straw-hat.jpg',
		width: 502,
		height: 625,
		aspectRatio: 502 / 625,
		title: 'Self-Portrait with a Straw Hat',
		alt: 'The artist, with a red beard and straw hat, faces the viewer against a stippled green background.',
		creator: 'Vincent van Gogh',
		credit: 'Vincent van Gogh. Self-Portrait with a Straw Hat, 1887. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/436532',
		rightsProof: MET_RIGHTS,
		accessionNumber: '67.187.70a',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ep/web-large/DT1502_cropped2.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:03e6bb58feb2e091dbd56adb601b3fccba17386402d5676c994b806058a797da',
		status: 'active',
	},
	{
		id: 'painter-met-438817-v1',
		url: 'assets/starters/painter/09-the-dance-class.jpg',
		width: 579,
		height: 624,
		aspectRatio: 579 / 624,
		title: 'The Dance Class',
		alt: 'Ballet dancers gather in a pale studio around a seated teacher holding a long staff.',
		creator: 'Edgar Degas',
		credit: 'Edgar Degas. The Dance Class, 1874. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/438817',
		rightsProof: MET_RIGHTS,
		accessionNumber: '1987.47.1',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP-20101-001.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:e06ff1c9490053cf3f9c8351d0f939febf9ef92b8059a809ba541d16ebfccde0',
		status: 'active',
	},
	{
		id: 'painter-met-436135-v1',
		url: 'assets/starters/painter/10-dancer-with-a-fan.jpg',
		width: 445,
		height: 625,
		aspectRatio: 445 / 625,
		title: 'Dancer with a Fan',
		alt: 'A dancer in an orange-yellow skirt raises a fan amid loose green and blue strokes.',
		creator: 'Edgar Degas',
		credit: 'Edgar Degas. Dancer with a Fan, ca. 1880. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/436135',
		rightsProof: MET_RIGHTS,
		accessionNumber: '29.100.188',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP-43276-001.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:adb02060305d07b4198423140bbd559117bc40e4d093718f36b6c824657b435b',
		status: 'active',
	},
	{
		id: 'painter-wikimedia-monet-self-portrait-v1',
		url: 'assets/starters/painter/11-claude-monet-self-portrait.jpg',
		width: 1920,
		height: 2423,
		aspectRatio: 1920 / 2423,
		title: 'Self-portrait in Beret',
		alt: 'Claude Monet faces the viewer wearing a dark beret and jacket against a pale painted background.',
		creator: 'Claude Monet',
		credit: 'Claude Monet. Self-portrait in Beret, 1886. Wikimedia Commons, public domain.',
		source: 'Wikimedia Commons',
		objectUrl: 'https://commons.wikimedia.org/wiki/File:Autoportret_Claude_Monet.jpg',
		rightsProof: WIKIMEDIA_RIGHTS,
		accessionNumber: 'Wikidata Q48977623',
		sourceImageUrl:
			'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Autoportret_Claude_Monet.jpg/1920px-Autoportret_Claude_Monet.jpg',
		downloadedAt: '2026-07-28',
		checksum: 'sha256:fb77d9404850756a3bf2d10ec8428fb7f9bdb32e453ae1a13b293c9b69fb0aab',
		status: 'active',
	},
	{
		id: 'photographer-met-285861-v1',
		url: 'assets/starters/photographer/01-river-view-down-valley.jpg',
		width: 1600,
		height: 1275,
		aspectRatio: 1600 / 1275,
		title: 'River View Down Valley, Cathedral Rock on Left',
		alt: 'Still water reflects tall pines while pale Yosemite cliffs recede into haze.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. River View Down Valley, Cathedral Rock on Left, 1861. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/285861',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1271',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP205165.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:6ce8caa5eecb2ac7b60a232eedc607527d4dd61a13cff75a90fd71662a440c26',
		status: 'active',
	},
	{
		id: 'photographer-met-286426-v1',
		url: 'assets/starters/photographer/02-yosemite-falls-river-view.jpg',
		width: 1600,
		height: 1294,
		aspectRatio: 1600 / 1294,
		title: 'Yosemite Falls, River View, 2637 Feet',
		alt: 'A broad granite ridge rises beyond a riverbank crowded with dark conifers.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Yosemite Falls, River View, 2637 Feet, 1861. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/286426',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1274',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP205170.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:39ca1b1494cc531557082f9ac11ba0d1b9a041398b9ebf0e629b6063c3cef578',
		status: 'active',
	},
	{
		id: 'photographer-met-286457-v1',
		url: 'assets/starters/photographer/03-el-capitan-4000-feet.jpg',
		width: 1600,
		height: 1296,
		aspectRatio: 1600 / 1296,
		title: 'Tutucanula, El Capitan, 4000 Feet',
		alt: 'El Capitan towers above a quiet river and a low band of pine trees.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Tutucanula, El Capitan, 4000 Feet, 1861. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/286457',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1276',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP205173.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:c74c52f190e412a119e02aa2d6466965ddf179dab135899bd6891cf90055bb20',
		status: 'active',
	},
	{
		id: 'photographer-met-286049-v1',
		url: 'assets/starters/photographer/04-domes-sentinel-dome.jpg',
		width: 1600,
		height: 1204,
		aspectRatio: 1600 / 1204,
		title: 'The Domes from Sentinel Dome',
		alt: 'A sunlit granite dome rises beyond forested slopes viewed from a high ridge.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. The Domes from Sentinel Dome, 1866. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/286049',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1181',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP-15403-001.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:f3b3e9af4bb33b8470cbdb3284acc75d7734886b5e37cf749f15e659410e01f3',
		status: 'active',
	},
	{
		id: 'photographer-met-285860-v1',
		url: 'assets/starters/photographer/05-cascade-nevada-fall.jpg',
		width: 1600,
		height: 1294,
		aspectRatio: 1600 / 1294,
		title: 'Cascade, Nevada Fall on Left, View above Vernal Fall',
		alt: 'White water runs through smooth granite shelves beneath a dense stand of pines.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Cascade, Nevada Fall on Left, View above Vernal Fall, 1861. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/285860',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1187',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP205164.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:b96b4480283df1345fa52973df8119aa3afb3c2ece13c101699cf3858fdbe141',
		status: 'active',
	},
	{
		id: 'photographer-met-286459-v1',
		url: 'assets/starters/photographer/06-nevada-fall.jpg',
		width: 1600,
		height: 1363,
		aspectRatio: 1600 / 1363,
		title: 'Nevada Fall, 700 Feet',
		alt: 'A waterfall drops between dark trees into a rock-lined pool crossed by fallen trunks.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Nevada Fall, 700 Feet, 1861. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/286459',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1261',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP205153.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:9e8d317aa7e03c6610f407b0ae340a3f8d238e2e15c6923f9bcaf7bb3c330806',
		status: 'active',
	},
	{
		id: 'photographer-met-286511-v1',
		url: 'assets/starters/photographer/07-lower-yosemite-falls.jpg',
		width: 1273,
		height: 1600,
		aspectRatio: 1273 / 1600,
		title: 'Lower Yosemite Falls',
		alt: 'A bright vertical waterfall cuts through a shadowed wall of rock and trees.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Lower Yosemite Falls, 1860s. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/286511',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1180',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP-19598-017.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:f9a4e05dccb517304e2a51bbd6b757feeeb6bdcbe3add0b149fbbc2d630a3e0a',
		status: 'active',
	},
	{
		id: 'photographer-met-286425-v1',
		url: 'assets/starters/photographer/08-cathedral-rock.jpg',
		width: 1600,
		height: 1353,
		aspectRatio: 1600 / 1353,
		title: 'Cathedral Rock',
		alt: 'The sheer face of Cathedral Rock fills the frame above a line of conifers.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Cathedral Rock, 1861. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/286425',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.1189',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP205169.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:87dc99e8c9bf27475be31ed990136255d1d449bbfef4f246eda041a964dcff13',
		status: 'active',
	},
	{
		id: 'photographer-met-262612-v1',
		url: 'assets/starters/photographer/09-view-columbia-cascades.jpg',
		width: 1600,
		height: 1262,
		aspectRatio: 1600 / 1262,
		title: 'View on the Columbia, Cascades',
		alt: 'The Columbia River bends past wooded banks toward faint mountains on the horizon.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. View on the Columbia, Cascades, 1867. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/262612',
		rightsProof: MET_RIGHTS,
		accessionNumber: '1979.622',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DT1173.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:e54d626420a31a51fb962df7fac3ce1cbf5b6210619ff33d7c393c80a019fb0b',
		status: 'active',
	},
	{
		id: 'photographer-met-283222-v1',
		url: 'assets/starters/photographer/10-cape-horn-celilo.jpg',
		width: 1600,
		height: 1229,
		aspectRatio: 1600 / 1229,
		title: 'Cape Horn near Celilo',
		alt: 'A massive column of rock rises beside a river and a straight rail line.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Cape Horn near Celilo, 1867. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/283222',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.109',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP139563.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:14eec81a81bbc7dcd92ce597d1dcae9c07163708148b9ddad7ce196f0022e5a6',
		status: 'active',
	},
	{
		id: 'photographer-met-285772-v1',
		url: 'assets/starters/photographer/11-mount-shasta-north.jpg',
		width: 1600,
		height: 1228,
		aspectRatio: 1600 / 1228,
		title: 'Mount Shasta from the North',
		alt: 'Snow-covered Mount Shasta rises above a dark open plain and distant tree line.',
		creator: 'Carleton E. Watkins',
		credit: 'Carleton E. Watkins. Mount Shasta from the North, 1870. The Metropolitan Museum of Art.',
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/285772',
		rightsProof: MET_RIGHTS,
		accessionNumber: '2005.100.340',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DP-19598-020.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:7e7922cd81b3fa35fbb0128ddc271e6769730165affea94b4407f56e4b5bbfa6',
		status: 'active',
	},
	{
		id: 'photographer-met-266132-v1',
		url: 'assets/starters/photographer/12-devils-canyon.jpg',
		width: 1600,
		height: 1217,
		aspectRatio: 1600 / 1217,
		title: "Devil's Canyon, Geysers, Looking Down",
		alt: 'A rugged canyon descends between brushy slopes, cut by pale mineral channels.',
		creator: 'Carleton E. Watkins',
		credit: "Carleton E. Watkins. Devil's Canyon, Geysers, Looking Down, 1868–70. The Metropolitan Museum of Art.",
		source: 'The Metropolitan Museum of Art',
		objectUrl: 'https://www.metmuseum.org/art/collection/search/266132',
		rightsProof: MET_RIGHTS,
		accessionNumber: '1989.1082',
		sourceImageUrl: 'https://images.metmuseum.org/CRDImages/ph/original/DT5588.jpg',
		downloadedAt: '2026-07-27',
		checksum: 'sha256:f98181964af1d1241e1bc94ba76cbb6849c61cf2d88d4db3df54f80c4eee866a',
		status: 'active',
	},
	{
		// Permanent tombstone used to exercise the same opt-in replacement path
		// partner stand-ins and future revoked media use. Its bytes are deliberately
		// absent, exactly as they will be after a completed wind-down.
		id: 'internal-lifecycle-standin-v1',
		url: '',
		width: 1686,
		height: 2092,
		aspectRatio: 1686 / 2092,
		title: 'Retired internal starter stand-in',
		alt: 'Internal starter stand-in withdrawn from the product catalog.',
		creator: 'Hangwork',
		credit: 'Internal development stand-in. Retired before partner starter release.',
		source: 'Hangwork internal',
		objectUrl: 'https://hangwork.art',
		rightsProof: 'Internal product artwork; excluded from publishing.',
		accessionNumber: 'internal-lifecycle-standin-v1',
		sourceImageUrl: '',
		downloadedAt: '2026-07-27',
		checksum: 'tombstone:no-bytes',
		status: 'revoked',
		retirementDate: '2026-07-27',
		replacementId: 'painter-aic-14655-v1',
	},
	{
		id: 'internal-placeholder-v1',
		url: '',
		width: 1200,
		height: 1200,
		aspectRatio: 1,
		title: 'Upload image',
		alt: 'Empty image placeholder.',
		creator: 'Hangwork',
		credit: 'Internal editor stand-in. Not publishable.',
		source: 'Hangwork internal',
		objectUrl: 'https://hangwork.art',
		rightsProof: 'Internal product artwork; excluded from publishing.',
		accessionNumber: 'internal-placeholder-v1',
		sourceImageUrl: '',
		downloadedAt: '2026-07-27',
		checksum: 'internal',
		status: 'draft',
	},
];

export const SAMPLE_ARTWORK = new Map(artworks.map((artwork) => [artwork.id, artwork]));

export function getSampleArtwork(id: string | null | undefined): SampleArtwork | undefined {
	return id ? SAMPLE_ARTWORK.get(id) : undefined;
}

export function sampleArtworkIdForUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	for (const artwork of SAMPLE_ARTWORK.values()) if (artwork.url === url) return artwork.id;
	return null;
}

export function isSampleWithdrawn(artwork: SampleArtwork, now = new Date()): boolean {
	if (artwork.status === 'revoked') return true;
	if (artwork.status !== 'retiring' || !artwork.retirementDate) return false;
	const retirement = new Date(artwork.retirementDate);
	return !Number.isNaN(retirement.getTime()) && retirement.getTime() <= now.getTime();
}

export const WITHDRAWN_SAMPLE_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23dedbd5'/%3E%3Ctext x='50%25' y='48%25' fill='%235d5a54' font-family='sans-serif' font-size='34' text-anchor='middle'%3ESample withdrawn%3C/text%3E%3Ctext x='50%25' y='56%25' fill='%23706d67' font-family='sans-serif' font-size='22' text-anchor='middle'%3EReplace this image%3C/text%3E%3C/svg%3E";

export function sampleArtworkUrl(id: string | null | undefined, now = new Date()): string | undefined {
	const artwork = getSampleArtwork(id);
	if (!artwork) return undefined;
	if (isSampleWithdrawn(artwork, now)) return WITHDRAWN_SAMPLE_IMAGE;
	if (!artwork.url) return undefined;
	return `${import.meta.env.BASE_URL}${artwork.url}`;
}

export function sampleReplacement(id: string | null | undefined): SampleArtwork | undefined {
	const artwork = getSampleArtwork(id);
	return artwork?.replacementId ? getSampleArtwork(artwork.replacementId) : undefined;
}

export function aspectDifference(a: SampleArtwork, b: SampleArtwork): number {
	return Math.abs(a.aspectRatio - b.aspectRatio) / a.aspectRatio;
}
