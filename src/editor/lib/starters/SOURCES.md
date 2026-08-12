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

The first five keepers are translated into Hangwork starters. Fonts: at batch time
the renderer shipped no webfonts, so each substitution below was the closest
**system font stack** — since re-translated to self-hosted OFL faces layered over
those stacks (see “Spec 23 — Starter webfonts” below). Imagery: National Gallery of
Art open-access masters from `public/assets/starters/new-starters-aug-8/`, cataloged
in `sample-artwork-nga.ts` (129 entries, generated from NGA open data; alt text from
NGA assistive text).

| Keeper | Hangwork template id | Theme preset | Imagery | Font substitutions |
|---|---|---|---|---|
| Mosley | `conservatory` | `conservatory-green` | George Bellows (10) | Gilda Display → Didot/Bodoni stack; Clarkson → Helvetica Neue |
| Reflect | `masthead` | `poster-white` | Berthe Morisot (14) | Clarkson → Helvetica Neue (logo weight 800 carries the masthead) |
| Radian | `atelier` | `studio-white` | Eugène Atget (18) | Halyard Display → Avenir stack; Pragmatica → Helvetica Neue |
| Keo | `contact-sheet` | `almond-paper` | Lewis Hine (9) + Atget (3, spec 32) | Poppins → Futura/Century Gothic stack; body Poppins-led (spec 32; supersedes Halyard → Avenir) |
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

Batch 1 flagged two uncataloged masters (`photography/filmseries copy/` and
`photography/photoseries1 copy/`) as provenance-unknown. **Resolved 2026-08-09 (spec
19):** they are William Stroud's own photographs; he granted sample-use rights for
Hangwork starters in-session on 2026-08-09. The folders were renamed to
`photography/film-series/` (b/w 35mm scans, film01–10) and `photography/photo-series/`
(color night series, vj01–10), the PNGs converted to compressed JPEGs, and 19 of the 20
frames cataloged in `sample-artwork-stroud.ts` (source "Artist provided", credit
"Courtesy of the artist", rights note in that file — no accession numbers; these are
not museum works). **Skipped: `photo-series/vj02.png`** (kept in-repo, uncataloged) — a
double exposure compositing a recognizable Earth-from-space image whose origin is
unclear; per the spec-19 safety rule it stays out of the catalog until William confirms
the source imagery is his to grant (NASA imagery would be public domain, but that is
his call to make).

Two exact-duplicate " (1).jpg"
files were deleted; artist folders were renamed to URL-safe names (`george bellows` →
`bellows`, `sargentdrawingscompress` → `sargent`, `watercolor1` → `emily-sargent`
(they are Emily Sargent watercolors), `eugeneatget` → `atget`, `lewiswickedhine` →
`hine`).

## Spec 23 — Starter webfonts (2026-08-10, branch worktree-spec-23-webfonts)

The batch 1–2 display faces are re-translated to their closest OFL equivalents,
self-hosted from `public/assets/starters/fonts/` (binaries + one OFL.txt per face;
registry with license evidence in `src/editor/lib/starter-fonts.ts`). Each starter
declares its face through the existing custom-font contract
(`theme.customFonts: {name, file, weight}`); the face leads the old system stack,
which stays as the fallback. Body faces remain system stacks. Publish fetches the
binary + license from the editor deploy into the site's own `/assets/fonts/`
(no font CDN request ever); the export zip therefore carries both.

| Template | Source face | OFL face (weights shipped) | File (woff2) | Upstream |
|---|---|---|---|---|
| `conservatory` | Gilda Display | Gilda Display (400) — the source face IS OFL | `gilda-display.woff2` 28KB | google/fonts `ofl/gildadisplay` |
| `masthead` | Clarkson | Archivo (var 400–800) | `archivo-latin.woff2` 33KB | `ofl/archivo` |
| `atelier` | Halyard Display | Hanken Grotesk (var 400–700) | `hanken-grotesk-latin.woff2` 24KB | `ofl/hankengrotesk` |
| `contact-sheet` | Poppins | Poppins (500) — source face is OFL | `poppins-500-latin.woff2` 8KB | `ofl/poppins` |
| `runway` | Syne | Syne (var 400–800) — source face is OFL | `syne-latin.woff2` 38KB | `ofl/syne` |
| `promenade` | LTC Bodoni 175 | Bodoni Moda (var 400–700, opsz kept) | `bodoni-moda-latin.woff2` 52KB | `ofl/bodonimoda` |
| `still-room` | Playfair Display | Playfair Display (var 400–900) — source face is OFL | `playfair-display.woff2` 104KB | `ofl/playfairdisplay` |
| `signal` | Nunito Sans 900 | Nunito Sans (900) — source face is OFL | `nunito-sans-900-latin.woff2` 14KB | `ofl/nunitosans` |
| `clearing` | Karla | Karla (var 400–700) — source face is OFL; leads body AND heading (Arthur is all-Karla) | `karla-latin.woff2` 24KB | `ofl/karla` |
| `marmalade` | Minion Pro Condensed Display | Cormorant (var 500–700) | `cormorant-latin.woff2` 60KB | `ofl/cormorant` |

License discipline (all faces OFL 1.1, verified in each upstream OFL.txt):
- **Reserved Font Names** — Gilda ('Gilda') and Playfair Display ("Playfair
  Display") declare RFNs, and the OFL treats subsetting as creating a Modified
  Version that may not keep the name. Those two ship as **pure woff2 conversions
  of the unmodified masters** (format conversion is accepted as not a
  modification), which is why Playfair is the largest file. The other eight
  reserve no names, so they are Latin subsets with variable axes limited to the
  weights used (headings 400/500, bold runs 700, header logo 800).
- Every published site that uses a face serves the face's full OFL.txt beside the
  binary (`/assets/fonts/<face>-OFL.txt`) — redistribution keeps its license,
  including inside the lifetime-export zip.
- `font-display: swap` (the pipeline's existing choice, kept deliberately):
  accepted artifact is a brief flash of the fallback system stack on first paint —
  never invisible text, and the fallback stacks are the batch 1–2 substitutions,
  so the flash shows the pre-spec-23 design.
- Known faux-bold remnants: Gilda Display has a single 400 cut, so the header
  logo (weight 800) synthesizes; Poppins ships 500 only, same story. Both match
  the display-scale usage the sources show; revisit only if William flags them.
- Rebuild recipe (masters from the google/fonts repo, `fonttools` +
  `pyftsubset --unicodes=<latin> --layout-features='*' --flavor=woff2`, variable
  axes limited with `fontTools.varLib.instancer`): weights per face as in the
  table; RFN faces use `fontTools.ttLib.woff2 compress` only.

## Spec 22 — Conservatory ↔ Mosley gap audit (2026-08-09, step 1; decisions approved by William 2026-08-09)

Method: every page of mosley.squarespace.com walked at 1280×720 and DOM-measured
(section map, block geometry, computed type sizes/colors, animation tweaks) beside
`conservatory` in the editor (template-studio mode, desktop preview ≈1100px). Mosley
pages: home (7-section one-pager, ~7460px), /bio, /portfolio, /awards, /book-now,
plus a global footer. Motion caveat: the browser pane was hidden for most of this
session — hidden documents throttle IntersectionObserver and freeze CSS transitions,
so editor-preview motion could not be conclusively tested (see row 17).

Class: **(a)** template data — fix in template studio now · **(b)** missing
capability — editor/renderer work · **(c)** accept — deliberate divergence.
Split classes mean "part now, part decision".

| # | Area | Mosley (measured) | Conservatory today | Class | Fix / decision |
|---|---|---|---|---|---|
| 1 | Nav bar | Three-zone fixed bar on solid #2c332c: links left (uppercase 16px HN), script wordmark center, bordered/underline BOOK NOW button right. Phone: burger + fullscreen folder menu (matches our fullscreenMobileMenu) | `navStyle: minimal` hamburger overlay | (b) | Nav variant per spec step 2 (three-zone + CTA slot). Verified absent: navStyle enum is dock/topbar/centered/pill/minimal |
| 2 | Script wordmark | "don" in Seaweed Script (webfont), 28px | Site name in Didot stack | (c)? | No webfonts shipped (spec 23 gated on this spec). Propose accept: serif wordmark |
| 3 | Global footer | On every page: ~224px serif name, footer image, two link columns ("Site map" Bio/Portfolio/Awards · "Contact" Email/Instagram/X) under 25px serif heads | `site.footer` = one text line + optional footerImage; no links/columns/display type | (b)/(c) | Decision: small footer upgrade (link columns + display-scale name) vs accept text+image footer vs per-page closing section (data, duplicated ×pages) |
| 4 | Home hero | 205px Gilda name over 5 scattered imgs, left+right edge bleed, static (no pinning) | Salon canvas: 144pt name + statement + CTA + 10 imgs over ~2.7 viewport-widths, bleed ✓ | (a) | Close. Split: Mosley's hero is ~1 viewport, then DISTINCT sections follow; conservatory folds everything into one canvas. Restructure home into hero + sections below (rows 5–9) |
| 5 | Home bio statement | Eyebrow "BIO / DON MOSLEY" (14.4px caps) + 77px serif statement + one small img | Statement lives inside hero canvas, smaller | (a) | Add eyebrow+statement section device (text blocks) |
| 6 | Home skills scatter | 5 imgs staggered across 2325px, each with a plain 16px caption UNDER it | No captioned scatter | (a) | Canvas imgs + adjacent text items as captions (no first-class static caption field; hoverCaptions is hover-only) |
| 7 | SERVICES accordion | Eyebrow + 3 rows (Film/Stage/Stunts): 123.5px Gilda titles, +/− right, 1px hairline dividers (top+bottom shown), one-open-at-a-time, text-only bodies (~320 chars) | None | (b) | Accordion block per spec step 2. Confirmed details: display-scale titles, text bodies suffice (no images in Mosley's), expanded no-JS fallback |
| 8 | Home BOOK/DON CTA | Giant "BOOK" 174px + "DON" 165px, underline BOOK NOW link between, award note, email + address | None | (a) | Canvas text at display scale + link |
| 9 | Home contact form | First/Last name, Email, Project description, Budget as 4 checkbox-buttons, Message, SUBMIT bar | No form on any page | (a)+(c) | Add contact block to home (fields: name/email/text/textarea ✓). Budget checkbox-group: accept as a text field (or tiny (b) if parity wanted) |
| 10 | Page inventory | Home + /bio + /portfolio + /awards + /book-now | Works + Portraits + About | (a) | Rebuild page set as Bio / Portfolio / Awards (+ Book analog); sample copy stays ours |
| 11 | /bio layout | Centered 123.5px heading; wide img; eyebrow; 43.6px serif statement left; running 16px text right column; 2 small scattered imgs | About page = about block | (a) | Editorial split via text/images blocks (about block can't do the two-column offset) |
| 12 | /portfolio layout | Centered giant heading + captionless scatter collage (5 imgs, 2131px), no lightbox links | Portraits: intro + 2-col grid | (a) | Convert to scatter canvas page (grid page optional extra) |
| 13 | /awards layout | Heading + wide img + two OFFSET eyebrow+43.6px statement pairs (2nd pair indented right) | None | (a) | New page, text/images blocks |
| 14 | /book-now | "Book Don" heading + Acuity scheduling iframe + 2 scattered imgs | None | (c) | Booking integrations out of scope per spec. Optional (a): approximate with contact block + imgs |
| 15 | Palette | #2c332c ground, PURE white text/headings, no accent tint | #252c25 + warm off-white #f0efe6 + sage muted/accent | (a)? | Recommend matching #2c332c + white for fidelity; keep sage only if William prefers the richer set. Also: conservatory `grain: 3` — Mosley is flat; recommend grain 0 |
| 16 | Display type metrics | Headings line-height ≈0.86, letter-spacing ≈-2% at 123–224px | 144pt recipe; metrics unverified | (a) | Tune in studio at step 3 (visual check) |
| 17 | Motion | Global entrance animation ON: every block fades+slides (0.6s ease, 0.6s delay, per-element "detailed") | Home = drift-only (35 on a ~4400px section ⇒ ±24px total: imperceptible); only reveal part on home is the EMPTY page heading; portraits/about get subtle reveal on 2 small parts | (a)+verify | Data: put `sequence`/reveal on the salon (and new sections), consider `full`. Preview-parity bug NOT confirmed: IObserver did fire when pane visible; hidden-pane throttling reproduces "no motion" symptomatically. Needs 2-min visible re-test before/with the spec's motion item |
| 18 | Canvas shapes | Only hairlines on the whole site are the accordion dividers + CTA underline; NO arrows/rules/rectangles anywhere | n/a | audit note | For conservatory fidelity, shapes are NOT required (accordion carries its own dividers). Keep the shapes build only if other keepers need it — William's call |

**William's decisions (2026-08-09, in-session):**
- **(c) accept list APPROVED**: script wordmark → serif stack (row 2), budget
  checkbox-group → text field (row 9), booking/Acuity skipped (row 14) — plus the
  batch-1 carry-overs (system font stacks, Bellows imagery).
- **Footer (row 3): build the small footer upgrade** — optional link columns +
  display-scale name in the site footer ((b), one branch under the spec umbrella).
- **Palette (row 15): match Mosley exactly** — #2c332c ground, pure white text,
  `grain: 0`. The warm off-white/sage set is dropped from conservatory.
- **Shapes (row 18): KEPT in scope** — build line/arrow/rectangle now so the
  capability exists before batch 3, even though conservatory itself needs none.

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

## Spec 32 — Contact-sheet ↔ Keo fidelity audit (2026-08-10, branch worktree-spec-32-contact-sheet)

Method: keo-fluid-demo.squarespace.com walked at 1280×800 headless-Chromium and
DOM-measured (computed type, grid geometry, marquee mechanics via `textPath`
`startOffset` sampling, `document.getAnimations()`, block config attributes)
beside `contact-sheet` in template studio at the same 1280px layout width.
Keo's marquee block config: `data-animation-speed="0.5"`,
`data-animation-direction="right"`, paused-on-hover. Keo's live computed body
face is **Poppins** everywhere (the site.css "halyard-display" faces load but
style nothing on the home page), so the batch-1 "Halyard → Avenir" body mapping
is superseded: body stack now leads with the bundled Poppins.

Class: **fixed** · **skipped** (with reason). Same divergence bar as spec 22.

| # | Area | Keo (measured) | Outcome |
|---|---|---|---|
| 1 | Marquee position | Full-bleed ticker band between grid and footer, 1px hairlines above/below (~273px apart) | **fixed** — page `headingKinetic` removed; ticker is now a canvas text block (35pt run, `kinetic: marquee, speed 50`) inside the signature canvas with `sectionBleed`, between two full-width `shape: line` blocks (first in-catalog use of shape primitives) |
| 2 | Marquee direction | Drifts **right** at ~30px/s | **fixed** (renderer) — `kinetic-marquee` keyframes flipped to `-50% → 0`; schema has no direction knob and Keo is the design source of the marquee capability. Loop stays seamless (identical copies) |
| 3 | Marquee speed | ~30px/s | **fixed to the floor** — `speed: 50` (slowest reachable) ≈ 53px/s at 1280. Residual: schema clamps at 50 |
| 4 | Marquee copies | One continuous track | **fixed** (renderer bug found) — rich-text marquees rendered the aria-hidden duplicate as an unstyled string, so sized runs produced two different-size copies (still-room's 20pt ticker showed it live). Both copies now render the formatted runs; links stripped from the duplicate |
| 5 | Statement | 51.3px Poppins 400, −3% tracking, lh 1.18, 88% width | **fixed size** — run 36→38pt = 50.7px. Skipped: −3% tracking and lh (no letter-spacing/line-height in richText schema — same gap spec 22 flagged for Mosley); weight 400 (bundled Poppins is the single-file 500 face, spec 23 owns faces) |
| 6 | Grid | 4 cols, 235×176 uniform 4:3 landscape crops, 96px gutters, 16 imgs | **fixed** — `columns: 4`, `gapX/gapY: 6` (96px), `cropAspect: "4:3"` on every sheet item → 228×171 cells. 12 imgs not 16: catalog has only 9 Hine; 3 unused Atget street scenes added (Cour rue de Valence, Ancien Hôtel des Parlementaires, Hôtel du Cardinal Dubois) — coherent vintage documentary row |
| 7 | Entrance motion | Per-image fade+scale 0.92→1, 800ms, on viewport entry, no hover effects | **partial** — sequence motion kept (fade+rise is the closest renderer vocabulary; no scale variant), intensity 40→25 for a subtler rise; `motion.hover: false` (Keo has none) |
| 8 | Palette | Pure white bg, pure black text (site vars: white/black; darkAccent `#ab8055` = our accent already) | **fixed** — theme + almond-paper preset → `#ffffff`/`#000000`; muted + accent unchanged |
| 9 | Body face | Poppins 400 (17.5px body) | **fixed family** — body stack now `Poppins, Avenir, …` (bundled face; renders at its 500 weight — closest ledger face) |
| 10 | Nav | Logo left ~24px; links centered, typed-uppercase 17.5px/400; socials right; header absolute (scrolls away) | **fixed shape** — `navStyle: centered` (centered + uppercase), `logoScale 130→75`, `stabilizeNavigation/stabilizeLogo: false`. Skipped: nav link size/weight (renderer CSS 11.5px/700, not data-reachable); social icons right (starter ships no social URLs) |
| 11 | Giant name | "Keo" 286px, lh 1.0, single line, x=2%vw | **partial** — single line at x=2% restored (box 96 wide, links moved above the name instead of beside it — a 9-char placeholder collides where 3-char "Keo" doesn't). Size stays 192px: richText caps at 144pt |
| 12 | Footer columns | Two underlined uppercase link columns right of name + "MADE WITH …" | **partial** — links restyled to a stacked underlined column (13pt runs with real `/field-notes` `/about` links); colophon photo sits where Keo's second column would (no real social/email URLs to fill it); centred "Made with hangwork.art" credit stays (product convention) |
| 13 | Side margins | 26px at 1280 | skipped — page padding is renderer CSS (40px), not data-reachable |
| 14 | /work page | Portfolio index with hover-follow images | skipped — capability gap, out of spec scope (field-notes keeps its 2-col grid) |
| 15 | /about page | Statement + contact + global footer | skipped — our About block is the product's About by design |

Publish-path check (real in-browser staticgen, spec-18 recipe): sample stripping
removes every grid image, and dropping the empty images host exposed a second
renderer gap — the standalone-canvas fallback rendered EITHER texts OR
shape/divider widgets depending on which block type anchored the section first,
so the published-unmodified starter lost its ticker, name, and links (shapes
anchored). Fixed by unifying all four standalone anchor branches in
PortfolioPage to render texts + embeds + widgets in one canvas. Verified: the
published index.html now carries 1 marquee track / 2 copies both at 35pt with
the aria-hidden duplicate, both hairlines, the full-bleed section, rightward
kinetic keyframes, and the Poppins face + OFL license.

Regression: still-room (the only other marquee user — its ticker now renders
both copies at run size and drifts right) and masthead eyeballed in template
studio after the renderer edits; no layout change. Phone: name hidden (existing
arrangement), ticker animates, single-col grid, shapes render as thin rules.

---

## Spec 35 — Starter round-trip audit: blank → template → blank (2026-08-11, branch `worktree-spec-35-starter-audit`)

**Audit only; no `src/` changes.** Deliverables: this table plus the empty harness
(`tests/starter-empty-harness.ts` + `tests/starter-empty.test.ts` — run
`npx vitest run tests/starter-empty.test.ts`, or with `HARNESS_STRICT=1` for spec 36's
acceptance bar). Spec 36 builds; nothing below was fixed here.

### What was measured

The fourteen starters ship **3,078 non-empty strings** (126–426 each) across
**130 distinct schema paths** once page keys and gallery items are collapsed
(`galleries.*.items.*.{title,alt,description,link}` alone is 728 strings and one
editor control). Verdicts are per construct and projected onto starters, per the
spec's method. Block types in use across all fourteen: `images, text, about,
project, accordion, form, shape, divider, children` — **every one of them is in the
editor's "Add a block" menu** (verified live in the running editor: Text, Image
group, Video, Shots, Music player, Google Map, Button, Divider, Shape, About
content, Email button, Contact form, Accordion, Project fields, Products,
Sub-page). No starter contains a hard-coded section type.

Method notes worth keeping: the harness runs the **real publish pipeline**
(`buildBundle` → `generateStaticSite`, the two functions the 🚀 Publish tab calls)
in node — an emptied document has no images left, so the spec-18 in-browser trick
buys nothing here; the live editor was used instead to calibrate *which*
operations the UI actually offers. That calibration mattered: see row E7.

### Direction A — blank → template ("can an artist build this?")

| # | Construct (starters) | Direction | Verdict | What the artist cannot reach / evidence |
|---|---|---|---|---|
| B1 | Block vocabulary — `images/text/about/project/accordion/form/shape/divider/children` (14) | build | `reproducible` | Live drive: the Add-a-block menu offers all sixteen block kinds on both the page and per-section menus. |
| B2 | Footer: text, large closing name, up to 3 link columns, footer image, signature (conservatory uses columns + closing name; the other 13 use footer text only) | build | `reproducible` | `FooterEditor.tsx` (Site tab → Footer) writes `site.footer`, `footerName`, `footerNameSize`, `footerColumns[].heading/links[].label/url`, image + layout; `SignatureEditor` writes `site.signature`. **No starter uses a footer arrangement the menu lacks** — William's footer concern is already covered. |
| B3 | Text-section distinctiveness — rich-text runs (pt size, bold/italic/link/align), per-block font, kinetic marquee, section color / full bleed / motion / height | build | `reproducible` | `RichTextEditor.tsx` pt input (6–144pt); `PageEditor.tsx` text font select + `setTextKinetic`; per-section chrome in `PreviewEditLayer.tsx` ("Published background color for Section 1…", "Full bleed…", "Scroll scene…"). Spec 31 already verified the kinetic control shipped. |
| B4 | **Font stacks — 18 distinct stacks used by 13 of 14 starters are absent from the font menu** (all but `photographer` and `painter`) | build | `needs a control` | `FONT_OPTIONS` is 15 fixed stacks. A starter's stack (`"Gilda Display", Didot, "Bodoni MT", …`; also plain-system ones like `Optima, Candara, …`, `Verdana, Geneva, …`, `"American Typewriter", …`) matches none of them, so `ThemeEditor` falls to the opaque `Custom (…)` option — verified live: after applying the Conservatory Green preset the heading select reads `Custom ("Gilda Display", Didot, …)`, never a named entry. An artist starting blank cannot choose any of the ten bundled webfaces or the eight extra system stacks by name, and once they change the select they cannot get the starter's stack back. **Smallest fix:** have `fontOptionsForTheme()` emit each bundled `STARTER_FONT_FACES` entry with the catalog stack the starters actually use (and match the select by family name, not by exact string), so the ten template faces + the starter system stacks appear as named options. |
| B5 | Bundled webfaces reachable only by applying a theme preset (10 starters) | build | `needs a control` (same fix as B4) | `contentWithThemePreset()` installs `theme.customFonts` from the preset, so the face arrives only as a side effect of a preset. There is no "template fonts" list; "Upload font…" is the only other route. |
| B6 | Section names (`pages.*.sections[].name`, 82 strings, 14) | build | ~~`needs a control`~~ → **`reproducible`** (spec 36 chunk 4) | The audit read `PreviewEditLayer`, where the name is display-only; the rename control lives in the **page editor** — `PageEditor.tsx`'s `.section-name-input` ("Name for Section N") commits on blur through `store.renameSection()`. No code change; row closed by verification. Like spec 31's row, the control had already shipped. |
| B7 | `site.favicon` (14, all `favicon.svg`) | build | ~~`unverified`~~ → **`reproducible` (product chrome)** (spec 36 chunk 4) | Confirmed: `site.favicon` is a *file name*, set once in `content-init.ts` and never rendered as text — `staticgen/site.ts` copies the editor deploy's own `favicon.{ico,svg,png}` set alongside it. No artist string, so no control is owed. Left out of the empty harness deliberately (comment in `emptyContent()`). |
| B8 | Everything else — page heading/label/title/description, nav labels + paths, image title/alt/description/link, crop aspect, gallery layout + carousel fit/frame/arrow, mobile arrangement, per-element mount/reveal/hover effects, section motion + colors + bleed + heights, theme colors/texture/nav style/logo placement/page-heading position, creative transitions, store products, about/contact/social | build | `reproducible` | Controls cited in `emptyContent()` in `tests/starter-empty-harness.ts` — every clear operation there names the store action and the component that calls it. |

### Direction B — template → blank ("can an artist delete this?")

Both harness passes were run against all fourteen starters. Survivors are
**identical across starters** except where noted, which is itself the headline: no
starter ships a string that only that starter cannot delete. The blank document is
no cleaner than an emptied starter.

| # | Survivor (starters) | Direction | Verdict | What the artist cannot reach / smallest fix |
|---|---|---|---|---|
<<<<<<< HEAD
| E1 | `Page not found` / `That page doesn’t exist here (anymore).` / `Back to the home page` + the `— Page not found` `<title>` — **404.html, all 14 + blank** | empty | `hardcoded text` — **open (William's call)** | `staticgen/site.ts` hardcodes the 404 body. Not starter debt (a blank document gets it too), but it is text no artist can change. Fix: either accept it as product chrome and say so, or source it from `content.site`. **Spec 36 chunk 1 left the wording untouched** — the audit flagged it as a product decision, not build work. It is listed in the harness's `PRODUCT_CHROME` so strict mode tolerates it; if William decides to make it editable, that list is where the change shows up. |
| E2 | `Open  in image viewer` — lightbox trigger, **all 14** | empty | `hardcoded text` (degrades) — **done** (spec 36 chunk 1) | `Gallery.tsx` built the label as `Open {title} in image viewer`; with the title cleared it announced with a hole in it. Fixed: `src/portfolio/imageViewerLabel.ts` names the button from title → alt → the gallery's alt, and with all three empty falls back to the control's function, `Open image in image viewer` — chrome, not artist words. Used by all four `Gallery.tsx` triggers and `CanvasGallery.tsx`; recorded in the harness's `PRODUCT_CHROME`. |
| E3 | `Open site navigation` — hamburger, **all 14 + blank** | empty | `hardcoded text` (accept) — **open (William's call)** | `Nav.tsx`. Functional chrome on an unlabelled single-page site; listed for completeness. Spec 36 chunk 1 left it alone and recorded it in the harness's `PRODUCT_CHROME`. |
| E4 | Contact-form copy: `Continue in email` / `Send message`, `Required`, `This contact form isn't ready yet. Please use another way to get in touch.`, aria `Contact form`, honeypot `Leave this field empty` — **conservatory** (the only starter with a `form` block) | empty | `hardcoded text` | `ContactForm.tsx` defaults. Clearing the block's heading and success message works (both vanish), but the submit label, the required chip and the unavailable sentence have no field at all. Fix: add `submitLabel` / `requiredLabel` to the form block (schema + `updateFormBlock`), and default the unavailable sentence to nothing once the block has no action. (`Leave this field empty` is the CSS-hidden honeypot — it only surfaces with styles off; lowest priority.) |
=======
| E1 | `Page not found` / `That page doesn't exist here (anymore).` / `Back to the home page` + the `— Page not found` `<title>` — **404.html, all 14 + blank** | empty | `hardcoded text` | `staticgen/site.ts` hardcodes the 404 body. Not starter debt (a blank document gets it too), but it is text no artist can change. Fix: either accept it as product chrome and say so, or source it from `content.site`. |
| E2 | `Open  in image viewer` — lightbox trigger, **all 14** | empty | `hardcoded text` (degrades) | `Gallery.tsx` builds the label as `Open {title} in image viewer`; with the title cleared it announces with a hole in it. Fix: fall back to "Open image in image viewer" when the title is empty. |
| E3 | `Open site navigation` — hamburger, **all 14 + blank** | empty | `hardcoded text` (accept) | `Nav.tsx`. Functional chrome on an unlabelled single-page site; listed for completeness. |
| E4 | Contact-form copy: `Continue in email` / `Send message`, `Required`, `This contact form isn't ready yet. Please use another way to get in touch.`, aria `Contact form`, honeypot `Leave this field empty` — **conservatory** (the only starter with a `form` block) | empty | `hardcoded text` → **closed by spec 36 chunk 2** (except the two accepted below) | Was: `ContactForm.tsx` literals with no field at all. Now: the form block carries `submitLabel` / `emailSubmitLabel` / `requiredLabel` / `unavailableMessage` (`content-schema.ts`, optional with defaults equal to the old renderer words, so an existing draft publishes unchanged with no version bump — `tests/content-compat.test.ts`). Each has its own input in the form block's panel (`PageEditor.tsx`; only the button label the current setup actually shows is offered, so the field always names the words in the preview), and an empty value is a deletion: no button, no marker, no sentence — the element collapses rather than falling back to the template's words (`tests/contact-form-words.test.ts`). Conservatory's fields-pass baseline drops from five survivors to two. **Accepted, not fixed:** `Leave this field empty` is the CSS-hidden, `aria-hidden` honeypot label — artist-editable words would weaken the spam trap — and the `Contact form` accessible name only appears when the heading is blank, functional chrome of E3's class. Both stay in the baseline as deliberate verdicts. |
>>>>>>> worktree-spec-36-form-fields
| E5 | Carousel chrome: `‹`, `›`, `1 / 4`, aria `carousel` / `Show previous image` / `Show next image` / `Image 1 of 4` — **photographer** (only carousel user) | empty | `hardcoded text` (accept, except the counter) | `Gallery.tsx`. Arrows and aria labels are functional. The visible `1 / 4` counter is the one an artist might want off; fix would be a gallery toggle. |
| E6 | Sub-page card labels fall back to the raw page key (`figure-studies`, `field-notes`) — **works-on-paper** (only `children` user) | empty | `hardcoded text` **+** `needs a control` — **done** (spec 36 chunk 1) | Was two problems; the audit missed a third. (a) `PortfolioPage.childItemsFor()` resolved `item.label \|\| pages[item.page].label \|\| item.page` — now `item.label ?? pages[item.page]?.label ?? ''`: an unnamed card still borrows its sub-page's menu name, a cleared one stays cleared, and the slug is never shown. (b) `ChildPages.tsx`'s inline editor refused an empty value (`onBlur` reverted unless `next` was truthy) — it now commits an empty label like any other edit, its aria label drops the hole (`Card text`), and `.child-card-label-editable:empty` keeps a click target in the editor so the artist can type it back. (c) **The slug did not actually come from the renderer.** `ensurePageBlocks()` in `src/lib/content-schema.ts` ran `if (!value.label) value.label = navLabel ?? key` on *every* parse, so a cleared page label was rewritten to the page key on the next load — the renderer was only reporting it. Now backfilled only when the label is missing entirely (`typeof !== 'string'`); regression test in `tests/content-compat.test.ts`. |
| E7 | Footer guard renders a stray `0` when `site.footerColumns` is `[]` — **latent, 0 starters** | empty | `renderer special case` (latent) — **done** (spec 36 chunk 1: guard is now `!!content.site.footerColumns?.length`, so the renderer no longer leans on the store's `[]` → `undefined` normalisation) | `PortfolioPage.tsx` guards the footer with `content.site.footerColumns?.length &&`, which prints `0` for an empty array. **Not reachable today**: `store.setFooterColumns()` normalises `[]` → `undefined`, confirmed by driving the real editor (add a column, remove it, clear the footer text → no `0` in the preview). The harness reproduced it only because it wrote the raw shape. Fix: `!!…?.length`, one character class of change, so the renderer stops depending on a store normalisation. |
| E8 | `resume.label` — `Résumé`, **all 14** | empty | `needs a control` — **done** (spec 36 chunks 1+4) | Both halves landed. Chunk 4 (the control): `store.setResumeLabel()` + a "Résumé link text" field under the PDF upload in `AboutContentEditor` (shown once a PDF exists); `||` → `??` in the store's résumé writers. Chunk 1 (the renderer): `PortfolioPage` takes the label as written and drops the link entirely when it is empty — a link with no text is nothing to announce; a pre-field document with no label at all still gets the historical `Résumé` so its link keeps working. No schema change (`resume.label` already existed); old drafts parse and render unchanged. Locked by `tests/staticgen.test.ts` and the harness's fields pass, which empties `resume.label` against a real résumé URL. |
| E9 | Page/section/block/image deletion, nav labels, footer, bio, contact, social, store, page heading/title/description | empty | `reproducible` | Structure pass: every page but home deleted, every block and section removed, every image removed, all site fields blanked → the emitted `index.html` contains **no visible text at all**, and `404.html` + `index.html` are the only pages left. Verified for all fourteen starters by the harness; deletion affordances verified live (`Delete <block> on <page>` buttons, "Remove section" in the section hover chrome, "Delete page…" in page settings). |
| E10 | The page's **last section cannot be removed** (all 14 + blank) | empty | `reproducible` (by design) — recorded so spec 36 does not "fix" it | `store.removeSection` returns unchanged when `allSections.length <= 1`, and `PreviewEditLayer` hides the button. An empty last section renders an empty `div` with no text, so it does not break the empty direction. The harness models this floor rather than zeroing `sections`. |
| E11 | The **home page cannot be deleted** (all 14) | empty | `reproducible` (by design) | `store.removePage` refuses `home`; the page-settings modal omits "Delete page…" for it. |

Per-starter projection: E1/E2/E3/E8/E9/E10/E11 apply to all fourteen; E4 to
conservatory; E5 to photographer; E6 to works-on-paper; E7 to none (latent). No
starter carries a finding of its own beyond these.

### Build order for spec 36 — independently mergeable chunks

Four chunks, no shared files between them, so they can run as parallel worktrees.

1. **Renderer text fallbacks** — `src/portfolio/`: E2 (lightbox label), E6a (child
   card slug fallback), E7 (footer `!!` guard), E5 counter toggle if wanted.
   Touches `Gallery.tsx`, `PortfolioPage.tsx`, `ChildPages.tsx`. Small, mechanical,
   one session; needs `npm run runtime:generate`.
   **Done** (branch `worktree-spec-36-renderer-fallbacks`): E2, E6 (a + b, plus the
   page-label backfill in `content-schema.ts` that was the real source of the slug),
   E7, and the renderer half of E8. The E5 counter was left to chunk 4 with the rest
   of its row. Harness deltas: `PRODUCT_CHROME` in `tests/starter-empty.test.ts`
   collects the strings kept on purpose (E1, E3, and E2's new function-name label)
   and is the only thing `HARNESS_STRICT=1` now tolerates; the fields pass empties
   `resume.label` against a real résumé URL. After this chunk, strict mode fails on
   conservatory (E4, chunk 2) and photographer (E5, chunk 4) alone — every other
   starter is strict-clean. Whoever closes E5 should add the accepted carousel aria
   strings to `PRODUCT_CHROME` rather than to a baseline.
2. **Form block fields** — E4: schema (`content-schema.ts` form block) +
   `updateFormBlock` + the `PageEditor` form UI + `ContactForm.tsx` defaults. The
   only chunk that touches the content schema, so it should not share a worktree
   with anything else. One session.
3. **Font menu** — B4 + B5: `font-options.ts` + `ThemeEditor.tsx` (named entries
   for the ten `STARTER_FONT_FACES` and the starter system stacks, family-name
   matching instead of exact-string). Self-contained, one session; worth doing
   before spec-14 batch 3 so new starters can only use stacks the menu offers.
4. **Small missing fields** — E8 (résumé label), E6b (allow an empty inline card
   label), B6 (section rename) if it is wanted at all. Editor-only, one session.

E1 (404 copy) and E3/E5-aria are product decisions, not build work; put them to
William rather than to a worktree.

**Honest estimate: three sessions, four if chunk 4 is taken.** Chunks 1–3 are
genuinely parallel. Each chunk's acceptance test is
`HARNESS_STRICT=1 npx vitest run tests/starter-empty.test.ts` after deleting the
matching lines from the baselines in `tests/starter-empty.test.ts`; the whole spec
is done when strict mode passes with empty baselines.

### Spec 36 chunk 4 — small missing fields (2026-08-11, branch `worktree-spec-36-small-fields`)

Five rows, two of which needed no code — the audit's "no control exists" verdicts
were read from the wrong component in both cases, the same failure mode spec 31
recorded. Rows above are annotated; the summary:

- **E8 résumé label — fixed.** `store.setResumeLabel()` + a "Résumé link text"
  field in `AboutContentEditor` (appears once a PDF is attached). `||` → `??` in
  the store's two résumé writers and in `PortfolioPage`, so a cleared label is an
  empty label; an empty label hides the link instead of publishing an unlabelled
  one. No schema change. Test: `tests/staticgen.test.ts`.
- **E6b inline sub-page card label — fixed.** `ChildPages.tsx`'s `onBlur` reverted
  any falsy value, so a card label could never be emptied; it now commits whenever
  the value *changed*. `store.renameChildCard()` already accepted `''`. (E6a — the
  slug fallback in `PortfolioPage.childItemsFor()` — belongs to chunk 1 and is
  untouched here, so `visible: figure-studies` stays in the baseline for now.)
- **E5 counter — no code; control already ships.** PageEditor → image group →
  *Customize layout* → *Carousel settings* → the **"Number count"** checkbox writes
  `gallery.carouselShowCount: false`, which `Gallery.tsx` already honours. The
  harness now mirrors that control in its fields pass, so `visible: 1 / 4` (and the
  aria label on the same element, `Image 1 of 4`) is gone from photographer's
  baseline. The arrows and their aria labels stay — William's product decision.
- **B6 section rename — no code; control already ships** (`PageEditor`, not
  `PreviewEditLayer`). Section names are editor-only and never published. Its input
  keeps the "reverts on empty" guard that E6b removed elsewhere: a nameless section
  would leave the layers list and the section menus unlabelled, and no published
  text depends on it.
- **B7 favicon — no code; product chrome**, not artist copy.

Harness deltas (all in `tests/starter-empty-harness.ts`, cited to their controls):
`carouselShowCount: false` in the fields pass, `resume.label = ''` in both passes.
Baseline delta: `visible: 1 / 4` and `assistive: Image 1 of 4` removed from
`photographer`. Strict mode's remaining survivors for every starter are exactly the
other chunks' rows (E1, E2, E3, E4, E5-aria, E6a) — none of chunk 4's.

Deliberately not touched, per the audit's floors: last-section and home-page
undeletability (by design), and the `footerColumns []` → `undefined` normalisation
(latent; the `!!` hardening is chunk 1's `PortfolioPage` line).
