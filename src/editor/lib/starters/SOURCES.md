# Template catalog sources — Squarespace portfolio designs

Scraped 2026-08-08 from squarespace.com/templates/browse/topic/popular-designs/type/portfolio
("Portfolio Website Templates (42)"). All 42 demo URLs verified live (HTTP 200).

These are **design references for translation** into Hangwork starters (BACKLOG spec 11 →
catalog production): layout, typography, palette, nav feel — rebuilt with our own theme
tokens and rights-cleared sample art (`public/assets/starters/new-starters-aug-8/` +
`sample-artwork.ts`). Copy the *design ideas*, never assets, images, fonts we can't license,
or copy text. Target: ~15 distinct layouts to fill 5 slots × (4 disciplines + Other).

## Curation pass — 2026-08-09 (agent-proposed, pending William's approval)

All 42 demos visited; near-duplicates grouped (same bones, different palette/font).
**Proposed: 19 keep / 23 cut.** Keeps ≤ 25, so spec 14's picker-overflow flag is not
triggered. Every call below is a proposal — William may overrule any of them.

Near-duplicate groups (pick ≥1 per group, cut the rest):

- **A — dark pinned collage, giant display type over scattered images:** Night, Mosley, Reflect
- **B — light studio editorial (statement/photo hero + project sections):** Radian, Bergen, Utica
- **C — giant light masthead wordmark + collection galleries:** McCurry, Reseda
- **D — statement + dense masonry grid:** Keo, Balboa, Falodu
- **E — pure masonry grid + lightbox home:** Gates, Matsuya, Talva, Minetta
- **F — titled project-card index grid:** Beaumont, Nevins, Novo, Kester, Pazari, (Tepito execution)
- **G — full-bleed photo cover home:** Quincy, Zion
- **H — agency/service statement sites (not work-first portfolios):** Adri, Sawyer, Agaro, Nolan, Sackett
- **I — bio/CV narrative pages (image-light):** Hart, Otto, (Suhama text-only)

## Translation ledger — batch 1 (2026-08-09, branch worktree-spec-14-batch-1;
## revision pass + batch 2: 2026-08-09, branch worktree-spec-14-revision-batch-2)

The first five keepers are translated into Hangwork starters. Fonts: the renderer
ships no webfonts (templates cannot carry font files), so each substitution below is
the closest **system font stack**, not a Google Font. Imagery: National Gallery of
Art open-access masters from `public/assets/starters/new-starters-aug-8/`, cataloged
in `sample-artwork-nga.ts` (129 entries, generated from NGA open data; alt text from
NGA assistive text).

| Keeper | Hangwork template id | Theme preset | Imagery | Font substitutions |
|---|---|---|---|---|
| Mosley | `conservatory` | `conservatory-green` | George Bellows (10) | Gilda Display → Didot/Bodoni stack; Clarkson → Helvetica Neue |
| Reflect | `masthead` | `poster-white` | Berthe Morisot (14) | Clarkson → Helvetica Neue (logo weight 800 carries the masthead) |
| Radian | `atelier` | `studio-white` | Eugène Atget (18) | Halyard Display → Avenir stack; Pragmatica → Helvetica Neue |
| Keo | `contact-sheet` | `almond-paper` | Lewis Hine (9) | Poppins → Futura/Century Gothic stack; Halyard → Avenir |
| Gilden | `runway` | `backstage-black` | Amedeo Modigliani (10) | Syne → Futura/Century Gothic stack; Source Sans Pro → Helvetica Neue |

Batch-1 device notes (as revised): the giant-wordmark devices (Mosley/Reflect/
Gilden) are canvas TEXT blocks at display scale (richText runs up to 144pt in
the heading stack) layered with the images — no longer flattened into the site
header; `logoScale` eased to 110–150 so the header does not double the name.
The giant texts hide on phones (`gallery.mobile` items — phone stacking renders
fixed-pt type oversized) where the header wordmark carries identity. Every home
now places its full image set across source-matching scroll depth, with spec-21
edge bleed (x < 0 / x+w > 100, `sectionBleed`) where the sources crop the
viewport. Keo's marquee ticker stays `headingKinetic: marquee`; Reflect's shop
is out of scope for a starter (Stripe links are per-artist) and was not
translated. Bellows' "The Germans Arrive" (NGA 133761) is deliberately NOT
placed in conservatory — a WWI atrocity scene is wrong for a starter sample.
Revision font changes: atelier body Pragmatica → system grotesque
(-apple-system/Segoe UI/Roboto), runway body Source Sans Pro → Seravek/Gill
Sans — Helvetica Neue body is capped at two templates (conservatory, masthead).

## Translation ledger — batch 2 (2026-08-09, branch worktree-spec-14-revision-batch-2)

| Keeper | Hangwork template id | Theme preset | Imagery | Font substitutions |
|---|---|---|---|---|
| Bergen | `promenade` | `plaster-white` | Emily Sargent (9) | ltc-bodoni-175 → Didot/Bodoni stack; proxima-nova → Optima/Candara |
| Cimen | `still-room` | `still-cream` | Met sculpture (8, reused) | Playfair Display → Baskerville stack; Rubik → Trebuchet MS/Verdana |
| Aue Sobol | `signal` | `signal-blue` | Watkins Met photos (12, reused) | nunito-sans 900 → Arial Black stack; body → Verdana |
| Arthur | `clearing` | `clearing-white` | Eugène Atget (10) | Karla → Seravek/Gill Sans stack |
| Quinn | `marmalade` | `marmalade-white` | J. S. Sargent drawings (13) | minion-pro-condensed-display → Iowan Old Style/Palatino; body → Arial |

Batch-2 device notes: Cimen's full-width VIDEO hero becomes a statement laid
over paired object tiles — starters cannot ship video files; the artist can
swap in their own embed. Quinn's giant orange type becomes white type on an
orange-red `sectionColors` block (text runs cannot carry a color, so the
source's figure/ground is inverted — the orange + doubled condensed serif
still read as Quinn at a glance). Aue Sobol's whole-site klein-ink text color
is the theme `textColor` (#000d7a on white), not a per-run color.

Uncataloged masters flagged for William: `photography/filmseries copy/` and
`photography/photoseries1 copy/` (film01–10.png, vj01–10.png) carry no accession
numbers or rights provenance — they look like personal work, so they were left out of
`sample-artwork-nga.ts` and out of the templates. Two exact-duplicate " (1).jpg"
files were deleted; artist folders were renamed to URL-safe names (`george bellows` →
`bellows`, `sargentdrawingscompress` → `sargent`, `watercolor1` → `emily-sargent`
(they are Emily Sargent watercolors), `eugeneatget` → `atget`, `lewiswickedhine` →
`hine`).

Curation status: `-` unreviewed · `keep` · `cut` (with reason)

| Status | Template | Demo URL | Reason (group) |
|---|---|---|---|
| cut | Night | https://night-fluid-demo.squarespace.com/ | A dup: same dark pinned giant-serif collage as Mosley, offset type is the only difference |
| keep → `conservatory` | Mosley | https://mosley.squarespace.com/ | A pick: giant serif name over scattered images on dark green — most generalizable collage hero |
| keep → `masthead` | Reflect | https://reflect-fluid-demo.squarespace.com/ | A sans variant with a distinct device: full-width bold-sans masthead crossing a vivid collage, plus shop |
| keep → `atelier` | Radian | https://radian-fluid-demo.squarespace.com/ | B pick: white studio editorial — photo hero + project index + alternating case sections |
| cut | Adri | https://adri-fluid-demo.squarespace.com/ | H: freelancer funnel one-pager (stats/FAQ/newsletter), not a work-first portfolio |
| cut | Sawyer | https://sawyer-fluid-demo.squarespace.com/ | H: painting-contractor services + consultation form; layout bones covered by group B |
| cut | Transmission | https://transmission-fluid-demo.squarespace.com/ | Podcast/membership site, no gallery; only distinct device is the marquee wordmark |
| cut | McCurry | https://mccurry-fluid-demo.squarespace.com/ | C dup of Reseda: same masthead-wordmark + work-category bones in a serif skin |
| keep → `contact-sheet` | Keo | https://keo-fluid-demo.squarespace.com/ | D pick: big sans statement + dense lightbox grid + marquee ticker; cleanest light grid portfolio |
| keep → `runway` | Gilden | https://gilden-fluid-demo.squarespace.com/ | Single: dark fashion portfolio — watermark wordmark behind hero + numbered case list |
| keep → `still-room` | Cimen | https://cimen-fluid-demo.squarespace.com/ | Single: cream quiet editorial with full-width video hero; maps to our video-on-canvas |
| keep → `signal` | Aue Sobol | https://aue-sobol-fluid-demo.squarespace.com/ | Single: huge klein-blue centered wordmark + bold statement; shop + gallery author layout |
| keep → `clearing` | Arthur | https://arthur-fluid-demo.squarespace.com/ | Single: sparse asymmetric photo scatter with heavy whitespace — freeform-canvas showcase |
| keep → `marmalade` | Quinn | https://quinn-fluid-demo.squarespace.com/ | Single: light ground, repeated giant serif PORTFOLIO in orange over a gray block + case list |
| keep | Reseda | https://reseda-fluid-demo.squarespace.com/ | C pick: massive grotesque masthead + tagline + stacked collection galleries |
| keep | Ortiz | https://ortiz-fluid-demo.squarespace.com/ | Single: cream + chartreuse color-blocking, organic scalloped image mask, serif display name |
| cut | Agaro | https://agaro-fluid-demo.squarespace.com/ | H: marketing-agency services page on flat violet; no gallery bones |
| keep | Mycelium | https://mycelium-fluid-demo.squarespace.com/ | Single: dark immersive photo-essay — video hero, lowercase captions, themed sections, print shop |
| cut | Balboa | https://balboa-fluid-demo.squarespace.com/ | D dup: statement + image-grid bands with text interludes ≈ Keo bones |
| keep | Beaumont | https://beaumont-fluid-demo.squarespace.com/ | F pick: quiet titled client-project index grid + short bio |
| keep → `promenade` | Bergen | https://bergen-fluid-demo.squarespace.com/ | B second pick, distinct device: centered didone mission + full-bleed category image bands |
| keep | Cami | https://cami-fluid-demo.squarespace.com/ | Single: flat camel ground, bold sans statement + stacked named case rows |
| cut | Elliott | https://elliott-fluid-demo.squarespace.com/ | Structurally a fullscreen numbered slideshow (carousel) — out of scope per spec |
| cut | Falodu | https://falodu-fluid-demo.squarespace.com/ | D dup: centered serif statement + one image row; thin subset of Keo/Balboa |
| cut | Gates | https://gates-fluid-demo.squarespace.com/ | E dup: pure masonry + lightbox, same bones as the Minetta pick |
| cut | Hart | https://hart-fluid-demo.squarespace.com/ | I: black didone bio narrative, image-light; About-page material, not a gallery starter |
| keep | Hawley | https://hawley-fluid-demo.squarespace.com/ | Single: typographic project index (big serif links) with hover image reveals on blush |
| cut | Kester | https://kester-fluid-demo.squarespace.com/ | F dup: statement + titled card grid + shop; covered by Beaumont + Aue Sobol |
| cut | Matsuya | https://matsuya-fluid-demo.squarespace.com/ | E dup: mono-type masonry grid with category subpages; same bones as Minetta pick |
| keep | Minetta | https://minetta-fluid-demo.squarespace.com/ | E pick: pure masonry + lightbox grid; dark skin (light variant = token swap, covers Gates/Matsuya/Talva) |
| cut | Nevins | https://nevins-fluid-demo.squarespace.com/ | F dup: 3-col captioned category grid ≈ Beaumont |
| cut | Nolan | https://nolan-fluid-demo.squarespace.com/ | H: digital-product-agency statement site (dark twin of Agaro); no gallery bones |
| cut | Novo | https://novo-fluid-demo.squarespace.com/ | F dup: titled project-card grid ≈ Beaumont |
| cut | Otto | https://otto-fluid-demo.squarespace.com/ | I: designer bio/CV one-pager, image-light |
| cut | Pazari | https://pazari-fluid-demo.squarespace.com/ | F dup: staggered 2-col category cards ≈ Beaumont/Nevins |
| cut | Quincy | https://quincy-fluid-demo.squarespace.com/ | G dup: full-bleed dark cover + serif statement + booking CTA; cover bones kept via Zion |
| cut | Sackett | https://sackett-fluid-demo.squarespace.com/ | H: craftsman business site — testimonials + consultation funnel |
| cut | Suhama | https://suhama-fluid-demo.squarespace.com/ | Text-only copywriter CV/list on flat orange; no visual gallery bones (typographic index kept via Hawley) |
| cut | Talva | https://talva-fluid-demo.squarespace.com/ | E dup: masonry + lightbox grid ≈ Minetta/Gates |
| keep | Tepito | https://tepito-fluid-demo.squarespace.com/ | F-adjacent pick: editorial serif intro with italic emphasis + region cards + location section, sage palette |
| cut | Utica | https://utica-fluid-demo.squarespace.com/ | B dup: bold sans statement + project cards ≈ Radian |
| keep | Zion | https://zion-fluid-demo.squarespace.com/ | G pick: fullscreen photo cover with category links overlaid — simplest cover-page starter |
