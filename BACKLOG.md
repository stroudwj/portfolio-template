# BACKLOG.md — agent-ready work queue

Specs written so a fresh Claude session (usually in its own git worktree) can start cold.
One spec per session. Before starting any spec: read [CLAUDE.md](CLAUDE.md), [DESIGN.md](DESIGN.md),
and `.agents/skills/verify/SKILL.md`; run `npm install` if the worktree has no `node_modules`.

**Merge gate (every branch, no exceptions):** `npm run check` + `npm test` pass; diff reviewed
against DESIGN.md; `.hangwork/runtime-release.json` conflicts are never hand-merged — run
`npm run runtime:generate` after merging and commit the result. Pushing `main` deploys
hangwork.art, and cutting a versioned `runtime-v*` release is a separate deliberate step
(see the verify skill) — neither happens automatically from this queue.

Statuses: `queued` → `running` → `review` → `merged`.

---

## 1. Contact block for portfolios — `merged`

> Shipped 2026-08-04 as the "Email button" block (renamed from "Contact" — it sits beside the
> pre-existing "Contact form" block in the add menu, which the spec's recon had missed).
> Address stored as split hex halves (`src/portfolio/contactEmail.ts`) because published
> pages inline all content as `window.__HW__`. Spawned follow-up: spec 7.

**Goal.** Artists currently have no way to put "email me about commissions" on their site.
Add a `contact` block: heading, short text, and an email button, placeable on any page.

**Why.** Inquiries are the whole point of a portfolio. Right now the schema and renderer
(`rg -i "mailto|contact" src/portfolio src/editor/lib/doc-schema.ts` → zero hits) have nothing.

**Files.** `src/editor/lib/doc-schema.ts` (new block kind — optional zod fields with defaults so
old drafts still parse; follow the navStyle/color-blocking precedent of no version bump),
`src/editor/components/PageEditor.tsx` (add-block menu + field editor, following an existing
block editor's structure), `src/portfolio/` renderer (render on-theme), `src/editor/lib/staticgen/`
(published output), validation + migration tests beside the existing ones.

**Requirements.**
- Fields: optional heading, optional short text, required email, button label (default "Email me").
- The email must not appear as a raw `mailto:x@y` string in published HTML — assemble it on
  click from split parts (scraper obfuscation), with a readable no-JS fallback.
- Works in editor preview and in the published static site (see how Embed hydrates).
- DESIGN.md throughout: existing button styles, sentence case, verb labels, no new colors.
- Tests: old draft without the block parses; a draft with it round-trips; published HTML
  contains no raw mailto address.

**Out of scope.** Forms, backends, external form URLs, CAPTCHA, per-image inquiries.

---

## 2. Canvas arrow-key nudging — `merged`

> Outcome 2026-08-04: nudging already existed in `src/portfolio/CanvasGallery.tsx` (spec
> recon looked in the wrong directory). Improved instead of duplicated: grid-aware step,
> one undo entry per burst, transient x/y readout, Klein focus ring — and a real stale-state
> bug in rapid nudge bursts found and fixed. 10× is Alt/Option+Arrow (Shift+Arrow was
> already resize). Post-merge glitch fixes (user report, verified in the live editor):
> key-repeat presses no longer drop steps (write-through draft refs), the canvas no
> longer reflows the page on every keypress when the bottommost item moves (height
> floor until the burst commits), and the toolbar no longer changes width when the
> readout replaces the hint (overlay slot).

**Goal.** With a freeform-canvas element selected, arrow keys move it by one snap/grid step
(Shift = 10×). A small position/size readout appears while nudging.

**Why.** Mouse-only placement makes precise alignment tedious; keyboard nudge is the standard
fix. Verified absent: canvas code has no arrow-key handler (only input fields do).

**Files.** `src/editor/components/PageEditor.tsx` (canvas key handling; selection already
exists — the Klein-outlined element), `src/editor/store.tsx` (movement + undo history).

**Requirements.**
- First verify absence again (`rg -n "Arrow" src/editor/components/PageEditor.tsx`) — if some
  nudge exists, improve it instead of duplicating.
- Arrows never hijacked while focus is in an input/textarea/contenteditable.
- Step: the active grid/snap step when snapping is on, else a small fixed step consistent with
  the layout's % units.
- Undo: one history entry per nudge burst, not per keypress — study the snapshot mechanism
  around `store.tsx:724` and batch (e.g. snapshot on burst start).
- Canvas/selected element reachable by keyboard (tabIndex), visible focus per DESIGN.md.
- Readout: 13px, `--ink-soft`, no new colors; disappears after the burst.
- Tests: unit-test the nudge math if it can live in the store/lib; otherwise `npm run check`
  plus a written manual-verify note in the PR/commit message.

**Out of scope.** Resize via keyboard, multi-select nudge, rotation.

---

## 3. Landing page refresh — `merged` (2026-08-04)

og:image social card (none exists today — shared links get no preview), Examples band showing
the real example site as a proper card, FAQ teaser band (promise-to-proof links), copy pass
against DESIGN.md voice, mobile/360px check. Files: `src/components/Landing.astro`,
`public/assets/brand/`, small og tags on `src/pages/examples/`.

---

## 4. og:image + twitter card on remaining product pages — `merged` (2026-08-08)

`faq/`, `guide/`, `learn/[slug]`, legal pages each hand-roll their `<head>` with no `og:image`.
Add the shared card image + `summary_large_image` to each. Optional (flag first): factor a
`ProductHead.astro` to end the head duplication — the pages are standalone documents on
purpose, so keep it a leaf component, not a layout.

---

## 5. Examples pipeline — `queued` (partly human)

The examples page has one entry and no images. Human part: recruit 2–3 real artists (free
lifetime in exchange for permission to feature). Agent part once sites exist: capture
consistent screenshots, thumbnail row on landing + examples page (flat presentation per
DESIGN.md, radius ≤3px, 1px `--wall-2` border, no shadows).

---

## 6. Weekly marketing routine — `queued` (step 4 of the operating cadence, not started)

A scheduled session that drafts one `learn/` article (`src/lib/seoArticles.ts` pattern) plus a
short distribution checklist (where to post it, community threads worth answering) for review.
Nothing publishes without human review; posting is always the human's step.

---

## 7. Contact form block leaks its recipient address — `merged`

> Shipped 2026-08-04. `recipientEmail` is now split hex halves (shared
> `contactEmailPartsSchema`); legacy plain strings encode silently on load, no version
> bump. Two extra defects found and fixed in the old path: a normalizer guard that would
> have clobbered a customized delivery address once the field held an object, and the
> mailto fallback un-escaping the raw `@` it had just encoded.

Found while building spec 1: the pre-existing `form` block (`src/portfolio/ContactForm.tsx`)
stores `recipientEmail` in plain text, and because every published page inlines the whole
Content as `window.__HW__`, the raw address ships in the served bytes — harvestable even
though the new email-button block obfuscates. Reuse `src/portfolio/contactEmail.ts` (split
hex halves) for the form's mailto fallback path: encode on save in the editor, decode at
submit/click time, migrate existing plain values on draft load (no schema version bump if
kept optional-with-fallback). Tests: published HTML for a site with a form block contains no
raw address; old drafts with plain `recipientEmail` still work.

---

> **Sequencing for specs 8–11:** 8 and 9 are independent — run them in parallel worktrees.
> 10 must merge before 11 starts (11 consumes 10's "Selected works" concept). Template
> catalog production (the Squarespace batch) is separate from all four and can happen any
> time after 11's registry lands. New sample images for the catalog sit in
> `public/assets/starters/new-starters-aug-8/` (photography/painting/drawing, public-domain
> masters) — unusable until each gets a rights entry in `sample-artwork.ts`.

## 8. Workbench Finder-parity — `merged` (2026-08-08)

**Goal.** Make the asset workbench (`src/editor/components/AssetWorkbench.tsx`) feel like a
real Finder window: an accurate list view, a compact list density with very skinny rows, and
a right-click context menu (starting with "New folder").

**Why.** The workbench is the sorting room for the guided first run; artists arriving with
hundreds of phone photos need Finder muscle memory to work. Today the list view is a loose
approximation and folder creation hides behind a toolbar button + `window.prompt`.

**Verify first.** A `grid`/`list` view toggle already exists (`WorkbenchView`,
~AssetWorkbench.tsx:457) — do not add a third toggle from scratch; extend what's there.
Confirm there is currently no `onContextMenu` handler anywhere in the file (recon 2026-08-08
found none) and that folder creation is `createFolder()` via `window.prompt`
(~AssetWorkbench.tsx:151, backed by `createWorkbenchFolder` in `store.tsx`). Folders persist
in the doc as `workbenchFolders` + per-asset `workbenchFolder` meta — reuse, don't re-model.

**Files.** `src/editor/components/AssetWorkbench.tsx`, workbench styles in the editor CSS,
`src/editor/store.tsx` only if a rename/delete-folder action is missing.

**Requirements.**
- List view rendered as true rows (thumbnail, filename, folder, kind/date if cheap), columns
  aligned, matching Finder's list mode rather than a wrapped grid.
- A compact density for the list: very skinny rows (small thumb or none), togglable — Finder's
  "small icons" feel. Persisting the choice locally (localStorage) is fine; not in the doc.
- Right-click on empty workbench space → context menu with "New folder" (inline-rename the
  new folder rather than `window.prompt` if reasonable). Right-click on a selected item or
  multi-selection → at minimum "Move to folder ▸" with the existing folder list.
- Context menu must be keyboard-dismissable (Esc), positioned within the viewport, and styled
  per DESIGN.md (no new colors, sentence case).
- Selection semantics (click, shift-click, drag) must not regress — the file already has them.

**Out of scope.** Column sorting, file renaming, nested folders, drag-out to Finder, any doc
schema change.

---

## 9. Guided crop & light demo in the workbench — `merged` (2026-08-08)

**Goal.** A short, skippable guided example in the workbench first-run: take one deliberately
unprofessional-looking sample photo of an artwork and walk the user through cropping to a
common aspect ratio and adjusting brightness/contrast until it looks gallery-ready.

**Why.** The intake's finishing question (StartIntake.tsx step 4) already tells users the
tools exist; nothing *shows* them. Phone shots straightened + leveled is the single biggest
quality jump a new artist's site can make.

**Verify first.** The crop and brightness/contrast tools ALREADY EXIST — non-destructive,
following the cropZoom pipeline, reachable from every image's Edit. This spec is a guided
demo of existing tools; build no new image-adjustment capability. Confirm how the intake's
`finishing: boolean` answer currently flows into the editor (IntakeAnswers in
`StartIntake.tsx`) and hook the demo's prominence to it: `finishing: true` users get the demo
offered directly; others get a quiet "See how" link.

**Files.** `src/editor/components/AssetWorkbench.tsx` (or a sibling demo component), the
guided first-run wiring from the 2026-08-07 "guided first-run workbench" commit, one bundled
demo image (a rights-cleared sample shot at an angle / bad light — check
`public/assets/starters/new-starters-aug-8/` and `src/editor/lib/sample-artwork.ts` for a
candidate first; if none suits, flag for William to produce one rather than shipping a
polished photo that makes the demo pointless).

**Requirements.**
- 3–4 steps max: (1) here's a crooked, dim photo; (2) crop to a common ratio — offer the
  standard set (1:1, 4:5, 3:4, 2:3) with one-line guidance on when each suits artwork;
  (3) nudge brightness/contrast; (4) before/after moment.
- Runs on the demo image, never on the user's own photos; user's assets untouched.
- Skippable at every step; dismissing it forever is one click; never auto-reopens.
- Ends by pointing at where the same tools live on their own images ("every image's Edit").
- Copy per DESIGN.md voice; no new colors.

**Out of scope.** New adjustment tools (rotation, levels curves, filters), auto-enhance,
changes to the cropZoom pipeline itself.

---

## 10. Series folders → one-time page build on workbench exit — `merged` (2026-08-09)

**Goal.** Connect the intake's series answers to the workbench and the page structure:
series-named folders wait in the workbench; when the user finishes sorting and hits an
"OK — build my pages" button, each folder's images are placed into an image group on the
matching page, the Selected works folder fills the home page, and the connection is then
over — a one-time build, not a live sync.

**Why.** Today the intake promises "we'll hang a page for each" series, and the workbench
has folders, but sorting into a folder doesn't put anything on a page — the two halves of
the first run don't meet.

**Verify first.** Establish exactly what the intake's `series` array currently does after
`onComplete` (does it already create pages? empty or with sample content?) before building.
Confirm `workbenchFolders` persist in the doc and how images copy from workbench to image
groups (`store.tsx` has a copy/move action, ~line 684). Check what the workbench's current
exit/done affordance is.

**Design decision (settled — do not re-litigate): no stored routing.** No `sourceFolder`
field on image groups, no schema change, no in-memory link table. The build is an EVENT:
on "OK — build my pages", match folder names to series/page names, copy each folder's images
into an image group on that page (creating the page if the intake didn't), Selected works →
home page. Nothing records the source, so severing is automatic and later folder edits can
never touch pages. Whether the build already ran is derived (target pages have content), not
a flag. This avoids any runtime-manifest/migration ripple.

**Files.** `src/editor/components/StartIntake.tsx` (series → folder creation on entry),
`src/editor/components/AssetWorkbench.tsx` (Selected works folder, build button, post-build
guide), `src/editor/store.tsx` (the build action, reusing the existing copy machinery).

**Requirements.**
- Entering the workbench from intake auto-creates: a **Selected works** folder (always
  present, cannot be deleted or renamed — enforce in the folder UI) plus one folder per
  series the user named. Users who named no series just get Selected works.
- Persistent, calm hint text: photos can be added or re-sorted ANY time later — this build
  is a head start, not a deadline. Must also be stated in the post-build guide.
- "OK — build my pages" primary button, enabled once ≥1 image is sorted into any folder
  (still exitable without building). On click: the one-time build above, then land on the
  home page with the result visible.
- Skip path: a user with zero photos can leave the workbench and still get their series
  pages, populated with rights-cleared samples from `sample-artwork.ts` appropriate to their
  discipline (the intake starter tells you which).
- Empty folders build empty pages (page exists, no image group) — a place to come back to.
- After the build, a one-screen quick guide of core editor functions (add images, arrange on
  canvas, pages list, publish tab) — dismissable, never auto-reopens, DESIGN.md voice.
- Running "build" twice must not duplicate: folders whose matching page already has content
  are skipped (report, don't overwrite).
- Tests: build action unit-tested at the store level (folder→page mapping, Selected works →
  home, second run no-op, zero-photo sample fallback).

**Out of scope.** Live folder↔page sync, moving/deleting page images when workbench folders
change, nested folders, any doc schema change.

---

## 11. Discipline template picker + auto-placement — `merged` (2026-08-09)

**Goal.** After the workbench build (or straight away for already-organized users), offer a
picker of modern landing-page templates filtered by the discipline chosen at intake —
photography answers see photography-suited layouts first — and applying one re-hangs the
user's Selected works into the template's image positions. Users with no photos get the same
templates filled with rights-cleared samples.

**Why.** The intake currently maps one discipline → one starter. The plan is ~5 modern
looks per discipline (plus an "Other" set); most layouts are shared across disciplines with
discipline-appropriate imagery swapped in.

**Verify first.** Read the starter/template system before building: starters are JSON
(`src/editor/lib/starters/*.content.json` + `theme-presets/*.json`), registry + rights
validation in `lib/templates.ts`, serializer contract in `lib/template-studio.ts`
(`docToTemplateContent` ⇄ `initDocFromContent`, locked by `tests/template-studio.test.ts`),
authored via the dev-only `/template-studio`. Confirm how `StarterRecipe.discipline` is
modeled and whether one starter can serve multiple disciplines today. Do NOT invent a second
template format.

**Files.** `src/editor/lib/templates.ts` (registry: discipline tags per starter, many-to-many),
`src/editor/lib/starters/` (content JSON), a picker component (near `StartIntake.tsx` /
`StartScreen.tsx`), placement logic in `store.tsx`.

**Requirements.**
- Registry supports one template serving several disciplines (tags, not a 1:1 field), plus an
  "Other" bucket that always shows a full set.
- Applying a template with own photos: the user's Selected works images replace the
  template's sample image slots in order; overflow images append to the page's image group;
  the user's name/text content is preserved — template supplies layout + theme, not identity.
- Applying with no photos: template renders with its own `sample-artwork.ts` samples (the
  existing sample-rights validation must pass).
- Applying a template is undoable (single undo entry) and re-pickable — switching templates
  re-flows the same works, not duplicates.
- Prove the machinery with 2–3 templates per discipline built from existing starters —
  but treat those as throwaway placeholders, not the product. The real catalog (~15 distinct
  modern layouts translated from live Squarespace demo-site URLs, not screenshots, reused
  across disciplines) is produced separately through the template studio immediately after
  this spec and REPLACES the existing starters in the picker. Shape the registry for that:
  adding/retiring templates must be pure JSON + registry data, no code changes. Fresh imagery for that catalog is staged in
  `public/assets/starters/new-starters-aug-8/` but has no `sample-artwork.ts` rights entries
  yet — adding entries is part of catalog production, not this spec.
- Tests: apply-with-photos placement order, apply-with-samples rights validation, re-apply
  no-duplication.

**Out of scope.** Producing the template catalog itself; per-template custom code; changing
the starter JSON format; the runtime manifest (starter JSON is deliberately unhashed).

---

## 12. Motion primitives + template motion vocabulary — `merged` (2026-08-09)

**Goal.** A small set of reusable motion primitives in the portfolio renderer, declared per
site in the doc's theme (navStyle precedent) so starter templates can each carry their own
motion feel, plus one site-level dial in the Design panel: Off / Subtle / Full.

**Why.** The template catalog (SOURCES.md in `src/editor/lib/starters/`) is being translated
from Squarespace portfolio designs whose "premium feel" is mostly light motion — scroll
reveals, hover states, slow heroes. Without a shared vocabulary, motion would become
per-template code and break the templates-are-pure-JSON architecture.

**Verify first.** A Motion section already exists in DESIGN.md and motion already ships on
the product site (hero frame sway, wall-drop, hang-tight) — read it and match its taste and
its reduced-motion discipline; do not invent a second motion aesthetic. Check what
transition/animation the portfolio renderer (`src/portfolio/`) already has (lightbox,
canvas) before adding. Confirm how theme fields like `navStyle` flow doc → renderer →
staticgen and follow the identical path.

**Files.** `src/portfolio/` (primitives, CSS-first), `src/editor/lib/doc-schema.ts`
(optional theme fields with defaults, no version bump), Design panel component (the dial),
`src/editor/lib/staticgen/` (published output), starter JSON schema in `lib/templates.ts`
(templates declare their motion), migration/round-trip tests beside existing ones.

**Requirements.**
- Primitives (≤5, CSS-driven where possible): scroll-reveal (fade/rise on viewport entry),
  gallery hover treatment (subtle zoom + optional caption reveal), parallax-lite hero
  (background at reduced scroll rate), page-load stagger (images hang in sequence — align
  with the existing wall-drop metaphor). Nothing else in v1.
- Declared in theme as optional fields with a site-level intensity: `off | subtle | full`;
  template JSON can preset both the intensity and which primitives are active.
- `prefers-reduced-motion` forces everything off, always, no override.
- Works identically in editor preview and published static sites; no layout shift when off
  vs on (motion decorates, never repositions).
- Design panel: one compact "Motion" control (Off / Subtle / Full), DESIGN.md styling.
- Old drafts without the fields parse and render exactly as today (default = current
  behavior); round-trip + migration tests.

**Out of scope.** Per-section/per-image overrides (spec 13), carousels/sliders,
scroll-jacking, page transitions, any motion-authoring UI, JS animation libraries.

---

## 13. Per-element motion tools — `merged` (2026-08-09, on integration/specs-14r-19; spec 24 revision landed on the same branch)

Built entirely as UI over spec 22's existing `sectionMotion` schema — the one
schema change is new optional values on existing fields ('none' joins the
effect enum; 'none'/'caption' join effects.hover), no new fields, no version
bump. Per section: a scroll-scene popover (∿, ColorSwatchPicker pattern) in the
section header settings row beside color/bleed, with Inherit / five effects /
Off + strength + phone; the existing Scroll scenes list in Mobile & advanced now
shares the same choices — its old "Still" label was a lie post-spec-12 (deleting
the entry means inherit, and Off was inexpressible; that was William's "no
ability to tweak the motion"). Per image: Edit panel's On hover select gains
Show title / Still, riding artwork-hover-* classes; the caption value is gated
on a motion-site-* root class so the site dial at Off wins, while pre-existing
lift/tilt/zoom/mono keep their standalone behavior (old drafts unchanged).
Verified live in the template studio against conservatory (sequence 45 ground
truth reads back; Off strips all motion markup from the hero while siblings
keep theirs; Inherit resolves the site reveal). 292/292 tests, check clean,
manifest regenerated. Remaining: merge to integration.

**Goal.** Let users vary motion below the site level: per-section/per-gallery scroll-reveal
on or off, and per-image hover treatment choice — surfaced inside the existing section
settings and image Edit panels, never a new top-level panel.

**Why.** Spec 12 gives every site one motion feel. Artists will want exceptions — a
restrained archive page under a lively landing, one hero image that shouldn't zoom on
hover. Exceptions are picks from the same vocabulary, not new animation.

**Verify first.** Spec 12 must be merged; build strictly on its primitives and theme
fields — if a control here would need a new primitive, stop and flag it. Look at how
per-section options (color blocking) and per-image options (crop & light in Edit) are
surfaced today and extend those exact surfaces.

**Update after spec 22 (2026-08-09).** The per-section data layer ALREADY EXISTS — do not
invent new fields. `sectionMotion` (src/lib/content-schema.ts, `effect` enum
`reveal|drift|pin|scrub|sequence` + `intensity`, per page keyed by section) is rendered by
`src/portfolio/SectionMotion.tsx` and hand-authored in conservatory's JSON (salon =
`sequence` 45). William's exact complaint: "the editor has no ability to tweak the motion"
users can see in that template. So this spec's per-section deliverable is UI over the
EXISTING `sectionMotion` schema: an effect picker (Inherit / the five effects / Off) +
intensity, in the section settings surface. Study spec 22's conservatory JSON as the
ground-truth of what the UI must be able to express, and keep the 2b behaviors intact
(threshold-0 observation, per-item sequence entrances, unmarked-items-fail-visible).

**Files.** `src/editor/lib/doc-schema.ts` (optional per-section/per-image fields,
defaults = "inherit from site"), the section settings + image Edit components,
`src/portfolio/` (respect overrides), staticgen, tests.

**Requirements.**
- Every control is a small picker over spec 12's primitives plus "Inherit" (the default) —
  inherit resolves template/site setting so applying a new template still re-themes motion
  sitewide unless the user explicitly overrode a spot.
- Per section/gallery: scroll-reveal on/off/inherit. Per image: hover treatment
  none/zoom/caption/inherit. Nothing per-image about entrances or timing.
- Site dial at Off still wins everywhere; reduced-motion still wins over everything.
- Old drafts parse unchanged; overrides survive template switching (they attach to the
  user's content, not the template); round-trip tests.

**Out of scope.** Keyframes, timing/easing controls, per-image entrance choreography,
motion preview scrubbing, any new primitive.

---

## 14. Template catalog production — the 42 → ~15 starters — `running` (batches 1 + 2 + the revision pass all merged onto integration/specs-14r-19 — ten new starters in the tree: conservatory/masthead/atelier/contact-sheet/runway + promenade/still-room/signal/clearing/marmalade, and later specs (22–32) already build on them. Batch 3 remains — Reseda, Ortiz, Mycelium, Beaumont, Cami, Hawley, Minetta, Tepito, Zion — and is **doubly gated**: deliberately deferred by William (spec 22 sign-off landed but batch 3 does not start without his go) and **blocked on spec 36**, so its nine are authored in editor-producible terms from day one instead of re-creating the debt 36 pays down. Batch-3 requirements added 2026-08-11 — read them before starting.)

**Goal.** Translate the curated Squarespace portfolio designs in
`src/editor/lib/starters/SOURCES.md` (42 verified demo URLs) into ~15 modern Hangwork
starter templates that fill spec 11's picker — 5 slots × (painting, photography, drawing,
sculpture, Other), layouts reused across disciplines with discipline-appropriate imagery.
These REPLACE the current starters as the picker's content.

**Why.** The existing starters are the product's weakest surface; new users judge Hangwork
against exactly these Squarespace designs.

**Prerequisites.** Spec 11 merged (registry + picker + placement). Spec 12 merged
(templates declare motion). Not before.

**Verify first.** Read the template studio contract before authoring anything:
`lib/template-studio.ts` (`docToTemplateContent` ⇄ `initDocFromContent`, locked by
`tests/template-studio.test.ts`), `validateStarterCatalog` in `lib/templates.ts`, and how
an existing starter's `*.content.json` + theme preset are shaped. Templates are authored
via the dev-only `/template-studio` → editor → "Save to template" path or by writing JSON
that passes validation — never by new code paths.

**Process (batches of 4–6 templates per session; one branch per batch).**
1. **Curation pass (agent proposes, William approves):** visit each of the 42 demo URLs,
   group near-duplicates (same bones, different palette/font), and mark a proposed
   `keep`/`cut` in SOURCES.md with a one-line reason each. Cut only true duplicates and
   designs that are structurally carousel/scroll-jack or otherwise unreproducible — the
   goal is covering every DISTINCT design (likely ~25-30), not hitting a quota. Present
   the marked table to William for approval before any translation begins; he may
   overrule any call. If keepers exceed ~25, flag that spec 11's 5-slot picker needs a
   scrolling-gallery variant and get a decision before proceeding.
2. **Design-spec pass (scriptable):** for each keeper, fetch the demo site's CSS custom
   properties/stylesheets for exact fonts, palette, and scale; screenshot desktop + mobile
   for layout. Substitute closest Google Font where the original isn't freely licensable;
   record the substitution in SOURCES.md.
3. **Translation:** rebuild layout/typography/palette/nav-style/color-blocking/motion
   declarations as starter JSON + theme preset. Copy design ideas only — never assets,
   images, fonts we can't license, or copy text from the demos.
4. **Imagery:** rights-cleared samples only. New masters in
   `public/assets/starters/new-starters-aug-8/` (photography/painting/drawing) need
   catalog entries in `sample-artwork.ts` (public-domain: Atget, Hine, etc.) — writing
   those entries is part of this spec's first batch. Sculpture/Other reuse existing
   catalog imagery.
5. **Registry:** tag each template's disciplines in `lib/templates.ts` data; every
   discipline (plus Other) ends with 5 slots filled; `validateStarterCatalog` and the
   template-studio round-trip tests pass on every batch.

**Requirements.**
- Each template: landing page + at least one interior-page layout; motion declared per
  spec 12's vocabulary; DESIGN.md editor-chrome rules don't apply to template *content*,
  but sample text stays in Hangwork's voice (no lorem ipsum).
- **The source's signature device must survive translation (William's review of batch 1:
  "they all look kind of the same").** If the source's identity is giant display type
  laid across/behind the images (Mosley, Reflect, Gilden), build it with canvas text
  blocks at display scale layered with the images — NOT flattened into the site header.
  Test: a thumbnail of the template home should be attributable to its source at a
  glance. Batch 1's five need a revision pass to this bar before batch 2 starts.
  Revision pass additions (William's conservatory-vs-Mosley review): place EVERY image
  in the set (conservatory used 5 of 10 on one screen — the sources are multi-screen
  scrolling collages; match their scroll depth so scroll-reveal motion has something to
  reveal), and once spec 21 (edge bleed) merges, let collage images cross the canvas
  edges like the sources do.
- Vary body fonts and grounds across a batch — no more than two templates in the whole
  catalog sharing the same body stack; sample imagery should vary in tone, not all
  muted historical work (William's own sets, spec 19, help here).
- Every batch merges through the standard gate; starter JSON is deliberately unhashed —
  no runtime manifest churn expected from content-only batches.
- SOURCES.md stays the ledger: status, font substitutions, which Hangwork template id
  each keeper became.

**Batch 3 additions (2026-08-11).**
- **Order: spec 35 → spec 36 → batch 3, plus William's go (the spec 22 deferral).** Spec 36
  makes every starter construct editor-producible and builds the footer/text format
  vocabulary; batch 3 authors against that vocabulary rather than the current idiom — same
  authoring effort, no new one-offs, and spec 35's audit of "the fourteen" stays true.
  Merge gate per batch-3 starter: only constructs the §spec 35 table verdicts `reproducible`
  (or a format spec 36 shipped), and a pass through spec 35's empty harness. A design that
  needs more is flagged as a new format/spec per Out of scope — never hacked into content.
- **Close the sculpture gap.** Registry today: photography 9, painting 7, drawing 5,
  illustration-design 5, **sculpture 3** — and two of sculpture's three are the legacy
  starters (sculptor, photographer); still-room is the only new-catalog one. At least two of
  the nine tag sculpture with catalog sculpture imagery — Minetta (masonry + lightbox), Zion
  (fullscreen cover), and Beaumont (project-card index) are the natural hosts. Without this,
  the "every discipline ends with 5 slots filled" goal silently fails.
- **Picker overflow check.** Photography lands at 9+ tags against spec 11's 5-slot framing;
  the picker's overflow-to-last-group handling should absorb that — confirm >5 matches
  render as intended in the live picker before merging, don't assume.
- **Cadence.** Nine templates in one session breaks this spec's own 4–6 rule: split 4+5
  across two worktrees, or state in the batch report why the accumulated recipes (NGA
  open-data sourcing, scriptable Fluid-Engine extraction, the byte-clean fixed point) made
  one session honest.
- **The legacy four (painter, photographer, sculptor, works-on-paper).** The goal's "REPLACE
  the current starters" is stale: they are still registered and load-bearing for sculpture
  coverage. The retire-vs-keep call is William's, made at batch-3 review — with one floor
  either way: they do not retire before batch 3 has replaced their coverage, and while they
  stay in the registry they are inside spec 35/36's audit scope like every other starter.

**Out of scope.** New renderer/editor capability (if a design needs one, flag it as a new
spec instead of hacking it into content), pixel-perfect cloning, copying any asset,
carousels/sliders.

---

## 15. Editor panel polish: squished controls + hover help tips — `merged` (2026-08-09)

**Goal.** Fix layout defects in the images-block editor panel at narrow sidebar widths, and
replace the panel's verbose inline helper paragraphs with a small reusable "?" hover tip
used consistently across every major editor area.

**Why.** William's review of the images-block panel (2026-08-09, narrow sidebar): the
Freeform / Grid / Carousel segmented control clips its labels when squished ("Freefor…"),
the "…" overflow button sits misaligned next to its row of siblings, and multi-line hints
("Drag images in the preview to position them. Drag rows here to set which sits in front.",
"11 images · drag rows to change their order", "Choose how the group appears on the page.")
eat vertical space that should go to content.

**Verify first.** Find the actual component rendering this panel (search for the hint
strings above and the Freeform/Grid/Carousel control) before assuming file names. Check
whether any tooltip/help affordance already exists in the editor (search "tooltip",
"title=", "aria-describedby" under `src/editor`) — extend it if so, don't build a second.
Reproduce the squish: the sidebar has a drag-to-resize separator; test at its minimum width.

**Files.** The images-block editor component (likely under `src/editor/components/`),
`src/editor/editor.css`, a new small `HelpTip` component under
`src/editor/components/ui/` if none exists.

**Requirements.**
- Segmented Layout control never clips or wraps labels at minimum sidebar width — let the
  segments shrink with smaller type, stack, or truncate with full label on the help tip;
  pick what reads best at 240px-ish widths and stays per DESIGN.md.
- Align the "…" button with the arrow/trash buttons in its row (same size, same baseline).
- `HelpTip`: a small "?" affordance that reveals its text instantly on hover AND on
  keyboard focus (aria-describedby, Esc dismisses; no delay, no new colors, 13px
  `--ink-soft` text per DESIGN.md). Position within the viewport.
- Sweep the editor's major panel areas: every multi-line explanatory paragraph that is
  advice (not a label) collapses into a HelpTip on the section's heading row — at minimum:
  the three hints quoted above, the workbench intro copy, and equivalents found in the
  Design/Store/Site/Publish panes. One-line field labels stay as-is.
- Nothing loses information: every removed paragraph's text lives in its HelpTip.
- Keyboard + screen-reader accessible; `npm run check` clean.

**Out of scope.** Redesigning panel structure, onboarding flows (specs 9/10 own their
copy), renderer/published-site changes, a tooltip library dependency.

---

## 16. Beta PT 2: editor chrome & panel fixes — `merged` (2026-08-10, on integration/specs-14r-19; William's review remains. All ten headers landed. Notes: the "…" menu is now a portal popover fixed at its opening position — exclusive, outside-click/Esc/scroll close, Send to top/bottom + Open details + one-step "Copy to workbench" added; copy/move actions confirm via a new shared editor toast. Preview clicks carry the artwork's identity (canvas selection key, or img src for grids) and land on that image's row with a 2s Klein-tint fade. The preview-expand blank was a missed host remeasure when the fullscreen toggle's resize notification is lost — DesktopDeviceFrame now remeasures on the fullscreen/sidebar switch itself (verified under suspended rendering: scale snaps to the full width where it previously stuck at the framed size); the fullscreen toolbar also states "Shown exactly as your published site". Card thumbnails: workbench picker + crop lightbox, the crop baked into the stored file so renderer/schema stay untouched. New-section adds are store-driven (a fresh section's collapsed card was why nothing scrolled); "＋ Add section" button added at the panel bottom, opening upward. The preview "+ Add section" bar moved right of the white resize pill (was stacked on it — the touch "morphing" confusion); visual check of that offset is the one item left to eyeball in review, plus the Compact/Details sticky heading in a workbench-built doc — the example scaffold only renders the focusedUi variant, so the sticky CSS was verified computed but not in situ.)

Source: beta tester round 2 (2026-08-06). Screenshots in
[docs/feedback/2026-08-06-pt2/](docs/feedback/2026-08-06-pt2/README.md) — each item links
its shot; read the image before fixing the item. Editor-only (`src/editor/`): no
renderer/manifest impact expected. Overlaps spec 15's panel components — coordinate if
both run at once.

**Goal.** Fix a batch of editor-panel bugs and small UX gaps the tester hit while building
a real multi-page site.

**Verify first.** Reproduce each bug in the dev editor (`npm run dev` →
`/portfolio-template/editor`) before fixing; a few may already be fixed on main. Find
components by searching for visible strings/behaviors, not assumed file names.

**Requirements.**
- **Ellipsis menus are exclusive** ([ellipsis-menus-stack.png](docs/feedback/2026-08-06-pt2/ellipsis-menus-stack.png)):
  opening any per-image "…" popover closes every other open one; clicking outside closes it.
- **Click-on-canvas scrolls to the clicked image** ([click-image-scroll.png](docs/feedback/2026-08-06-pt2/click-image-scroll.png)):
  today clicking an image in the preview scrolls the sidebar to the *top of its images
  block*. Instead scroll to that image's own row/entry and give it a highlight that fades
  out (~2s) so the eye lands on it. Use an existing token color at low opacity per DESIGN.md.
- **Reorder buttons can't become Delete under the cursor** ([earlier-delete-misclick.png](docs/feedback/2026-08-06-pt2/earlier-delete-misclick.png)):
  repeatedly clicking "↑ Earlier" must never land the next click on "Delete image" (menu
  position shifts as the row moves). Keep the menu anchored/stationary while open, and add
  "send to top" / "send to bottom" actions alongside Earlier/Later.
- **Workbench copy feedback** ([copy-to-menu.png](docs/feedback/2026-08-06-pt2/copy-to-menu.png)):
  after "Copy to → Image workbench" show a brief toast ("Sent to workbench"); add a
  one-step "Copy to workbench" action so it doesn't require opening the dropdown.
- **Preview-expand blank-space bug** ([product-blank-space-sidebar-open.png](docs/feedback/2026-08-06-pt2/product-blank-space-sidebar-open.png),
  [preview-expand-blank-bug.png](docs/feedback/2026-08-06-pt2/preview-expand-blank-bug.png),
  [preview-expand-expected.png](docs/feedback/2026-08-06-pt2/preview-expand-expected.png)):
  with the sidebar open, expanding the preview (top-right arrows) leaves an enormous blank
  area / wrong layout — the editor panel isn't collapsed properly and the view doesn't
  reflect the real site ([preview-published-unclear.png](docs/feedback/2026-08-06-pt2/preview-published-unclear.png)).
  Hiding the sidebar first then expanding renders correctly. Repro on a page with a
  product block. Expanded preview must render identically regardless of prior sidebar state.
- **Collapse button legibility** ([collapse-button-toolbar.png](docs/feedback/2026-08-06-pt2/collapse-button-toolbar.png)):
  the `<` toolbar button collapses the editor panel but reads as browser back. Swap to a
  panel-collapse glyph (sidebar-with-arrow) + tooltip ("Hide panel").
- **Add-section ergonomics**: creating a section/block from anywhere scrolls+focuses the
  sidebar to the new section; add an "Add section" button at the bottom of the page panel
  too ([add-section-bottom.png](docs/feedback/2026-08-06-pt2/add-section-bottom.png)); the
  white pull bar morphing into "+ Add section" on touch confused the tester
  ([pull-bar-add-section.png](docs/feedback/2026-08-06-pt2/pull-bar-add-section.png)) —
  keep drag working, make the affordances visually distinct.
- **Numeric crop inputs** ([crop-lightbox-sliders.png](docs/feedback/2026-08-06-pt2/crop-lightbox-sliders.png)):
  Zoom/Brightness/Contrast sliders each get a small numeric field (type a value, both stay
  in sync).
- **Card thumbnails from the workbench** ([thumbnail-card-picker.png](docs/feedback/2026-08-06-pt2/thumbnail-card-picker.png)):
  the card thumbnail "+" currently only takes a file upload; also allow picking from the
  workbench and cropping (reuse the crop lightbox).
- **Details mode reachability** ([compact-details-toggle.png](docs/feedback/2026-08-06-pt2/compact-details-toggle.png),
  [details-from-ellipsis.png](docs/feedback/2026-08-06-pt2/details-from-ellipsis.png)):
  the Compact/Details toggle is unreachable when scrolled deep in a long list — keep it
  sticky/visible, and add "Open details" to the per-image "…" menu.
- Merge gate per header; `npm run check` + `npm test` clean.

**Out of scope.** Renderer/published-site changes (spec 17), grid/batch workflow (spec 18),
custom-cursor size (needs design decision), guest-book feature.

---

## 17. Beta PT 2: renderer bugs, styling options, more mounts — `merged` (2026-08-10, on integration/specs-14r-19; William's review remains)

> Outcome. All five bugs root-caused and fixed: (1) whole-page color now suppresses the
> wall texture for that page (the texture multiply-blended over --color-bg, so white never
> painted; fixed in Portfolio.tsx + Layout.astro); (2) "This page is empty" was a
> per-gallery-block check that rendered on published pages and over mixed-canvas sections —
> published sites now render nothing for an empty gallery, the editor shows a block-scoped
> hint ("This image group is empty…") or nothing when a canvas sits underneath; (3) the
> "freeform image near the footer" clip is the footer's freeform box: FooterEditor hardcoded
> ar:1 and the canvas cover-crops any other ratio with aspect-locked resize — Footer now
> self-heals the stored ratio in the editor (measure-on-load, 2% tolerance, widget-autoheight
> pattern) and the footer canvas image letterboxes instead of cropping; (4) the caption
> scrollbar is `.canvas-widget-content{overflow:auto}` on carousel widgets whose title/count
> flow below the 100%-height frame — carousels now flag `overflowVisible` and the chrome
> hangs below like the standalone canvas carousel; (5) hover "Still" now wins everywhere:
> wobble/color-spin/base zoom rules exclude `.artwork-hover-none`, and — spec 18
> reconciliation — smart-grid effect classes moved from `.smart-item` to `.smart-art`
> (whose direct child is the img), so mounts, hover, hang, and light adjustments work in
> smart grids at all (they were silently dropped before). Also fixed latent spec-13 bug:
> doc-schema's hover enum lacked 'none'/'caption', so a draft using them failed validation
> on reload. Options shipped (all optional-with-defaults, no version bump): theme
> linkUnderline (explicit Underline mark still wins per link), text-block `background`
> (auto-contrast card), textureOpacity/textureHue (overlay path only when tuned; untouched
> themes keep byte-identical background rules), per-section `sectionFades` fade/dither
> (blends from whatever renders above, phone order included). Mounts: mat, oak + walnut
> wooden frames, thumbtack, nailed/taped/tacked four-corner variants, photo corners — one
> shared ARTWORK_MOUNTS catalog drives the sidebar dropdown AND a new mount select on the
> canvas selection toolbar. Verified in the live editor and through the real in-browser
> staticgen publish (HTML + runtime CSS assertions); 16 new tests in
> tests/renderer-beta2.test.ts; `npm run check` + `npm test` (328) clean; manifest
> regenerated. William's hands-on review remains; note the tester's parked "grid overrides
> freeform rules" complaint should be rechecked after this lands (likely the same leak).

Source: beta tester round 2 (2026-08-06). Screenshots in
[docs/feedback/2026-08-06-pt2/](docs/feedback/2026-08-06-pt2/README.md). Touches
`src/portfolio/` (+ `doc-schema.ts` for the new options) → **manifest regen required**
(`npm run runtime:generate`, commit `.hangwork/` with the change). New schema fields are
optional-with-defaults, no version bump (navStyle precedent).

**Goal.** Fix rendering bugs visible on the tester's published-style preview, add the
styling options they asked for as *options* (not global changes), and expand the
mounts/fixtures catalog they love.

**Verify first.** Reproduce each bug in the editor preview AND in a built site
(`npm run build`) — several may be staticgen-specific. Check what the Mount dropdown
already offers ([mount-dropdown-current.png](docs/feedback/2026-08-06-pt2/mount-dropdown-current.png)).

**Requirements — bugs.**
- **Whole-page background not applied everywhere** ([whole-page-bg-not-applied.png](docs/feedback/2026-08-06-pt2/whole-page-bg-not-applied.png)):
  page background set to `#ffffff` but the region behind a freeform signature image and the
  footer keeps the textured background. Whole-page color must paint behind every section,
  signature, and footer.
- **False "This page is empty" placeholder** ([empty-page-placeholder.png](docs/feedback/2026-08-06-pt2/empty-page-placeholder.png)):
  the "This page is empty… add something" text renders over a page that clearly has images.
  Find the emptiness check and make it match reality.
- **Freeform footer image clipped** ([footer-image-cutoff.png](docs/feedback/2026-08-06-pt2/footer-image-cutoff.png)):
  a freeform image placed near the footer gets cut off and resizing doesn't fix it —
  container overflow/height bug.
- **Stray scrollbar on captioned freeform images** ([freeform-caption-scrollbar.png](docs/feedback/2026-08-06-pt2/freeform-caption-scrollbar.png)
  vs expected [freeform-caption-expected.png](docs/feedback/2026-08-06-pt2/freeform-caption-expected.png)):
  freeform + bottom caption shows an internal scrollbar.
- **"On hover: Still" ignored on grid images**: with hover set to Still (and page-level
  wobble on), grid images still zoom/wobble on hover. Per-image Still must win over
  page/group motion everywhere. (The tester's separate "grid overrides freeform rules"
  complaint is likely this same leak — recheck after fixing.)

**Requirements — options (all opt-in, defaults preserve current look).**
- **Link underline toggle** ([link-underline.png](docs/feedback/2026-08-06-pt2/link-underline.png)):
  a per-site theme option (and ideally per-link override) to remove underlines from text
  links — an *option*, not a global removal.
- **Text-box background color**: text blocks get an optional background color (existing
  ColorSwatchPicker + auto-contrast rules).
- **Texture opacity + hue shift**: textured page backgrounds get opacity and hue-shift
  controls (non-destructive, like brightness/contrast in crop & light).
- **Segment transitions** ([segment-divider.png](docs/feedback/2026-08-06-pt2/segment-divider.png)):
  option to fade/dither the boundary between differently-colored sections; divider color
  currently only affects the line & ornament — let it follow section color sensibly.

**Requirements — mounts & fixtures.**
- New Mount options beyond none/tape/nail/hook/frame: **gallery mat**, more wooden-frame
  styles, **colorful thumbtack**, **four-corner** variants (nailed/taped/tacked at all four
  corners), **photo corners**. Match the physical style of existing mounts (DESIGN.md).
- **Fixture toggle from the preview**: switch an image's mount (tape/nail/etc.) directly
  from the canvas selection UI, not only the sidebar dropdown.
- Merge gate per header; migration tests: old drafts without new fields parse; a draft
  using each new option round-trips; `npm run runtime:generate` committed.

**Out of scope.** Editor chrome (spec 16), smart grid (spec 18), new motion work (specs
12/13), custom cursors.

---

## 18. Beta PT 2: smart grid + batch image workflow — `merged` (2026-08-09, on integration/specs-14r-19; William's hands-on review remains. Smart grid ON by default for newly-toggled grids, gallery-wall variance seeded per image id, gap sliders, batch shuffle/reset-crops/crop-all/clear-settings each a single undo step. Verified: 32 mixed-ratio images driven through the editor, publish-built via staticgen, published mosaic matches preview; 15 new tests incl. the untouched-doc migration invariant. Note: spec said "run after spec 17 merges" — 17 was still queued, so grid-code conflicts with 17's renderer fixes may need a rebase at merge time.)

Source: beta tester round 2 (2026-08-06); see
[docs/feedback/2026-08-06-pt2/README.md](docs/feedback/2026-08-06-pt2/README.md). Run
**after spec 17 merges** — touches both `src/editor/` and `src/portfolio/` grid code →
manifest regen required. The tester's framing: "the next hurdle. recreate this by
uploading 25-50 images and trying to arrange them."

**Goal.** Make Grid mode intelligent by default — an aspect-aware mosaic that places mixed
horizontal/vertical pieces together well — and add the batch tools needed to arrange a
25–50 image page without per-image fiddling.

**Verify first.** Read the current grid implementation (uniform grid mode: columns/crop —
see the canvas-image-system history) before designing. Confirm where grid layout lives
(renderer vs editor) and how `ImageLayout` interacts with grid mode.

**Requirements — smart grid.**
- **"Smart grid" toggle, ON by default** for new grids (existing docs keep their current
  uniform behavior until toggled): packs images by original aspect ratio into an
  auto-adjusting mosaic — mixed horizontal + vertical pieces, no forced square crops.
- A **"gallery wall" variance option**: slightly randomized sizes within the mosaic so it
  reads like a hung gallery wall, not a spreadsheet. Deterministic per doc (seeded), so
  publish matches preview.
- **Variable columns** and **grid gap controls** (horizontal + vertical whitespace
  independently).
- Toggling smart grid off returns to the current uniform grid; nothing about a doc that
  never touches the toggle changes visually (migration test).

**Requirements — batch tools.**
- **Clear all image settings** (per block): resets hanging/mount/hover/crop overrides to
  page defaults, with confirm.
- **Reset all crops** and a **unified "crop/zoom all"** control for grid mode: set one
  frame/zoom for the whole block, then optionally nudge individual images.
- **Shuffle order** for a whole image group.
- All batch actions are single undo steps (Cmd+Z restores the previous arrangement).
- **Verify clause:** load 25–50 images into one page (sample masters under
  `public/assets/starters/` are fine), arrange with smart grid + batch tools, publish-build
  it, and screenshot the result. This workflow is the acceptance test.
- Merge gate per header; manifest regen committed.

**Out of scope.** Freeform-mode changes, workbench features (spec 8 owns Finder-parity),
per-image motion (spec 13), renderer bugs (spec 17).

---

## 19. Catalog William's own film & photo-series masters — `merged` (2026-08-09, on integration/specs-14r-19; vj02 skipped by the agent)

**Goal.** The two uncataloged master sets that batch 1 correctly refused to touch —
`public/assets/starters/new-starters-aug-8/photography/filmseries copy/` (film01–10) and
`photoseries1 copy/` (vj01–10, PNGs) — are **William Stroud's own photographs; he granted
sample-use rights in-session 2026-08-09.** Catalog them properly so later spec 14 batches
can hang them in templates.

**Why.** Batch 1 flagged them as provenance-unknown and left them out (the right call).
With rights now settled, they're the only genuinely contemporary photo sets in the pool —
valuable for film-series and photo-essay templates (Mycelium, Minetta, Zion styles) where
1900s public-domain material reads as a history site.

**Verify first.** Read batch 1's flag in `src/editor/lib/starters/SOURCES.md` and the
existing `sample-artwork.ts` entry shape (accession/provenance fields, url format, how
creator/title render in UI tooltips: "Sample: <creator>, <title>"). Check what format/size
the catalog's existing images use — the vj set is PNG; convert to compressed JPEG matching
house conventions unless transparency is load-bearing (it won't be for photos).

**Files.** `public/assets/starters/new-starters-aug-8/photography/` (rename the two
folders URL-safe, no spaces — e.g. `film-series/`, `photo-series/` — matching batch 1's
rename convention), `src/editor/lib/sample-artwork.ts`, SOURCES.md (clear the flag,
note the resolution).

**Requirements.**
- Creator: "William Stroud". Titles: short neutral descriptive titles per image (from
  looking at each — no filename-as-title like "vj07"). Rights note: owner-provided,
  sample-use in Hangwork starters; no external accession numbers (these are not museum
  works — the catalog entry shape must tolerate that; extend the type minimally if it
  demands an accession).
- Compress/convert to match existing catalog file sizes (the sets must not exceed the
  size norms of neighboring sample images).
- `validateStarterCatalog` + existing tests pass; images render in the editor's sample
  picker with correct attribution.
- If ANY image in these folders looks like it might not be William's own (contains
  recognizable third-party artwork, watermarks, other people as the subject without
  obvious consent), skip it and flag it in SOURCES.md rather than cataloging.

**Out of scope.** Using them in templates (later spec 14 batches do that), touching the
museum-sourced sets, republishing masters at full resolution.

---

## 20. BUG: template apply wedged drafts via stale phone-arrangement ids — `merged` (2026-08-09, fixed same day)

> Reported by William while testing 14b1+15: "This browser draft could not be upgraded
> safely (content.pages.home.mobile: Phone image arrangement points to an item that no
> longer exists ×3)" — and "Continue editing" silently dead (same root cause: the load
> threw and aborted).

**Root cause.** `applyTemplateToDoc` (spec 11) replaces template sample slots with clones
of the artist's works carrying fresh ids, but kept the template home's phone arrangement
(`gallery.mobile.order`/`items`) pinned to the old slot ids. The doc validator treats a
stale pin as fatal, so the next load of the saved draft refused to open.

**Fix (both ends), on `integration/specs-14b1-15`:**
- Producer: `applyTemplateToDoc` remaps `image:<slotId>` keys to the hung works' ids.
- Loader: `parseAndMigrateEditorDoc` drops a stale phone arrangement on the affected
  pages and retries (mirrors the existing `ogImage` self-heal precedent) instead of
  refusing the draft. Phone arrangement is a derived preference, never irreplaceable work.
- Regression tests in `tests/template-apply.test.ts`; the old fatal contract in
  `tests/content-compat.test.ts` updated to the heal contract. Verified against
  William's actual wedged draft — it opens with everything intact.

---

## 21. Freeform canvas edge bleed — `merged` (2026-08-09)

**Goal.** Let freeform-canvas images (and text) extend past the canvas's left/right edges
so collage layouts can bleed off-screen the way Mosley/Reflect-style designs do, plus a
per-section full-bleed option so the canvas itself can span the viewport.

**Why.** William's review of the `conservatory` starter vs mosley.squarespace.com
(2026-08-09): the source's images crop off both viewport edges; ours stop dead at the
canvas edge. Verified genuine limitation, not template timidity: `clampLayout`
(`src/portfolio/canvasLayout.ts:22`) clamps x to [0, 100−w] and y to ≥0 — a placement
cannot cross an edge at all. Templates alone cannot fix this.

**Verify first.** Re-read `clampLayout`/`clampTextLayout` and every call site
(`CanvasGallery.tsx` drag/nudge/group paths, `store.tsx`) — the clamp is load-bearing for
drag UX (items must stay grabbable). Check how the canvas section relates to the page's
content width/padding (is x=0 the viewport edge or the content edge?) before deciding
where "bleed" is measured from. Check published staticgen output crops (overflow hidden?).

**Files.** `src/portfolio/canvasLayout.ts`, `src/portfolio/CanvasGallery.tsx`,
section/page styles (overflow + full-bleed), `src/editor/` section settings (the
full-bleed toggle), staticgen, tests beside `canvasLayout`'s.

**Requirements.**
- Allow x < 0 and x+w > 100 up to a sane bleed margin (e.g. half the item's width —
  an item must always keep a grabbable sliver ≥ MIN_W/2 inside the canvas; never fully
  escape). y ≥ 0 stays.
- Canvas section clips bleed (`overflow hidden`) — no horizontal page scrollbar, ever,
  editor preview and published site alike (the DESIGN/verify no-horizontal-scroll rule).
- Per-section "full bleed" option: the canvas spans the viewport width instead of the
  content column, so x=0/100 mean the actual screen edges. Optional field, navStyle
  precedent, defaults to today's behavior.
- Drag, arrow-nudge, snap, guides, and group-drag all respect the new bounds (edge snap
  should still offer the true edge); phone rendering must not produce sideways scroll.
- Old drafts unchanged (their placements are already within [0,100]); round-trip tests;
  a clamp unit test for the new bounds.

**Out of scope.** Vertical bleed, bleed on grid/masonry layouts, parallax (spec 12 owns
motion), template content changes (spec 14's revision uses this once merged).

---

## 22. Conservatory fidelity sprint — one template to indistinguishable — `merged` (on integration/specs-14r-19; William signed off on conservatory 2026-08-10. Batch 3 technically unblocked but deliberately deferred by William — do not start it without his go)

Step 1: 18-row gap audit in starters/SOURCES.md, decisions approved by William
same day (accept list; footer upgrade; exact #2c332c/white/no-grain palette;
shapes kept in scope). Step 2 built and tested on the branch: accordion block
(native details, script-free), three-zone navStyle (last menu item = CTA),
canvas shapes (line/arrow/rectangle on the shared widget canvas), footer
upgrade (display-scale footerName + up to three footerColumns), motion — no
renderer bug found (hidden preview panes freeze IO/transitions and fake the
symptom; conservatory's home was drift-only by data) — salon now uses
`sequence` 45 and slowReveal was dropped. Step 2b (2026-08-09): both render
blockers fixed and acceptance-verified in a visible pane — sampleArtworkUrl
joins BASE_URL through withBase (test pins '/', '/portfolio-template', and
the trailing-slash form), and SectionMotion observes at threshold 0 with
per-item sequence entrances (motion-pending opt-in hiding, so unmarked items
fail visible); 10/10 salon images render and stagger on scroll at desktop and
phone widths, via both the studio and the template-picker apply path. Step 3
(2026-08-09): conservatory rebuilt to the Mosley bones — exact palette,
three-zone nav with Book-now CTA, one-pager home (hero wall / eyebrow+statement
/ captioned scatter / 92pt SERVICES accordion / BOOK-A WALL canvas CTA hidden
on phone / booking form), Bio-Portfolio-Awards-Book pages, footer name+columns,
sequence-everywhere motion with phone entrances on; galleries split into six
rooms (19 slots from 15 cleared samples, four rehung twice). 284/284 tests,
`check` clean, manifest regenerated. Remaining: William's side-by-side
scroll-through against mosley.squarespace.com is the acceptance test. Known
data-untunable gap for the review: canvas display type keeps the renderer's
airy line-height (~1.75) vs Mosley's ~0.86/-2% tracking — a schema-level
line-height control would be a new (b) capability if William wants it.

**Goal.** Make `conservatory` a faithful stand-in for mosley.squarespace.com — every page,
not just the landing — and in doing so produce the vetted capability list the other 18
keepers need. William's call (2026-08-09): "if we can get one, we can get the rest."
Spec 14's batch 3 is PAUSED until this spec is merged and William signs off on the result.

**Why.** Two review rounds each found systemic gaps (flattened type devices, then missing
scroll depth/bleed, now interior-page devices). Auditing one source exhaustively is cheaper
than fixing 19 templates three more times.

**Step 1 — gap audit (do this first, report before building).** Walk every page of
mosley.squarespace.com beside conservatory in the editor. Produce a table in SOURCES.md:
each difference, classified as (a) template data — fix now in the template studio,
(b) missing capability — needs editor/renderer work, (c) accept — deliberate divergence
(e.g. licensed fonts, booking CTA). Present the table; William approves the (c) list.

**Step 2 — known capability gaps to verify and build (each small, one branch each, this
spec is the umbrella):**
- **Accordion block**: full-width rows with display-scale headings and +/− toggles that
  expand to text/images (Mosley's Film/Stage services page). New block kind — follow the
  contact-block precedent (optional zod fields, no version bump, renderer + staticgen +
  editor field UI + tests). No-JS fallback: expanded.
- **Canvas shapes**: hairline rules and arrows as canvas items (line, arrow, rectangle;
  theme ink color, optional custom). Layout like text items; z-order, drag, nudge, bleed
  per spec 21. NOT a general drawing tool — three primitives max.
- **Nav variant**: three-zone bar — links left, wordmark center, single CTA link right
  (Mosley's bar). Extend navStyle options; phone behavior per existing fullscreenMobileMenu.
- **Motion in preview (verify first — may be a bug, not a feature)**: William reports no
  visible motion on conservatory in the editor preview despite `subtle` reveal declared.
  Spec 12 requires preview parity. Diagnose: does reveal fire in the preview iframe at
  all? Is `subtle` perceptible? Fix the bug if bug; if `subtle` is just too quiet,
  recalibrate subtle (and re-check `full`).
**Check SOURCES.md batch notes and the (a) list before building any of these — and if the
audit finds a gap not listed here, add it to the table rather than silently expanding scope.**

**Status 2026-08-09.** Steps 1+2 are DONE and committed on
`worktree-spec-22-conservatory-fidelity` (audit table in SOURCES.md with William's
approvals recorded; accordion block, canvas shapes, three-zone nav, footer name+columns,
and the motion data fix all landed; `npm run check` 0 errors, `npm test` 283/283 green).
The prior session ran out of context — continue on the SAME branch in a fresh session.
Review found conservatory renders BLANK in the template studio. Two pre-existing renderer
bugs (both reproduce on the integration branch too — NOT regressions from this branch's
work) block step 3 and must be fixed first:

**Step 2b — render blockers (fix these before touching step 3):**
- **Sample-asset URLs drop the slash after the base.** Every starter image src comes out
  as `/portfolio-templateassets/starters/...` (404, so the whole wall is blank). The join
  is `` `${import.meta.env.BASE_URL}${artwork.url}` `` in `sampleArtworkUrl`
  (src/editor/lib/sample-artwork.ts, ~line 903): in dev `BASE_URL` is `/portfolio-template`
  with no trailing slash while catalog `url` values are relative (`assets/starters/...`).
  Fix with a join helper that guarantees exactly one slash (BASE_URL may be `/`,
  `/portfolio-template`, or `/portfolio-template/` — handle all three), and grep for other
  bare `BASE_URL` concatenations while there. Verify both entry paths: the template studio
  (`?template-studio=starter:conservatory`) AND applying conservatory through the normal
  template picker. Add a test pinning the joined URL shape.
- **`reveal`/`sequence` never fire on tall sections.** `SectionMotion.tsx` observes
  sections with `threshold: 0.14` (+ rootMargin `0px 0px -8% 0px`). IntersectionObserver's
  ratio is visible-height ÷ section-height, so a spec-21 deep canvas (salon wall is
  ~4,400px) in a ~700px preview iframe tops out near 0.13 — the threshold can never be
  crossed, `motion-visible` is never added, and every canvas item sits at opacity 0
  forever. That is the "template doesn't render" symptom even after images are fixed, and
  it will hit ANY tall section on published sites on small screens too. Fix so tall
  sections still trigger (e.g. per-section `threshold: Math.min(0.14, fraction-of-section
  a full viewport can cover)`, or observe with threshold 0 + a rootMargin that requires
  meaningful entry); for `sequence`, consider whether observing per-item serves Mosley's
  staggered entrance better. Keep `prefers-reduced-motion` and the phone gate intact.
- **Acceptance for 2b:** open the template studio on conservatory with the browser pane
  VISIBLE (a hidden pane freezes IntersectionObserver and fakes "no motion" — see
  SOURCES.md note), confirm all 10 salon images render and play their staggered entrance
  on scroll, on both desktop and phone preview widths.

**Step 3 — apply.** Revise conservatory's JSON in the template studio using the new
capabilities until a side-by-side scroll-through of every page reads as the same design
in different clothes. William is the acceptance test.

**Out of scope.** The other 18 templates (batch 3 resumes after sign-off), carousels,
booking/scheduling integrations, per-element motion UI (spec 13), copying Mosley's text
(sample copy stays ours), webfont shipping.

---

## 23. Starter webfonts — self-hosted, OFL-only, subset — `merged` (2026-08-10 onto integration/specs-14r-19. All ten batch 1–2 starters now bundle their display face as one self-hosted woff2 (variable where the family has one) + its OFL.txt, vetted through a registry with license evidence (`starter-fonts.ts`); faces ride the EXISTING custom-font contract (`theme.customFonts` + new optional `weight` @font-face descriptor), so a no-fonts starter is bit-identical to before. Verify-first findings that shaped the build: sample assets are stripped at publish, so fonts could NOT ride the sample path — instead `generateStaticSite` fetches face+license from the editor deploy into `/assets/fonts/` each publish (hash-diff makes re-uploads free), which also carries the export zip and account-reload for free; and the pipeline supports one file per family, hence single-file faces instead of per-weight files. OFL discipline: Gilda + Playfair declare Reserved Font Names, so they ship as pure woff2 conversions (subsetting would make an un-nameable Modified Version); the other eight are Latin subsets. Worst per-site cost 104KB (still-room), rest ≤60KB; `font-display: swap` kept — the accepted artifact is a brief fallback-stack flash. Presets stay stacks-only; `contentWithThemePreset` unions template-declared faces with the artist's own (artist wins name collisions). Editor-preview + publish + weight-range bold verified in-browser on conservatory and still-room. Ledger updated in SOURCES.md.)

**Goal.** Let starter templates ship real display typography instead of system-stack
approximations: each template may bundle up to ~2 self-hosted webfont faces (subset,
OFL-licensed), closing the last fidelity gap against the Squarespace sources.

**Why.** Batch 1/2 translations substitute system stacks (SOURCES.md ledger: Gilda →
Didot/Bodoni, Halyard → Avenir, etc.). At display scale the type IS the design. Decision
deliberately deferred until after spec 22: if the fidelity sprint's layout/device work
makes conservatory read faithfully with system stacks, William may drop this spec.

**Hard fences (William approved the tradeoff on these terms, 2026-08-09):**
- **Self-hosted only.** No Google CDN request from published sites — visitor privacy
  (GDPR precedent against Google Fonts CDN) and the FAQ's no-third-party shutdown promise.
- **OFL-licensed faces only**, vetted per face; record license + source in the registry.
- **Subset** (Latin, only the weights used); target ≤ ~150KB added per site; pick a
  `font-display` strategy deliberately and note the artifact it accepts.
- **Starters-only.** Templates declare bundled faces; there is NO user-facing font
  browser, no arbitrary-font picker. That would be its own future spec.

**Verify first.** How custom fonts already work (an earlier feature added user custom
fonts — find it before inventing a parallel path), what staticgen/publish uploads to R2,
what the lifetime-export zip includes (fonts MUST ride in the zip — a download that
fetches fonts remotely breaks "own it forever"), and how the runtime manifest treats
binary assets (starter JSON is deliberately unhashed; decide fonts' status explicitly).

**Files.** Font files under a starters asset path, starter/theme-preset schema for
declared faces, `staticgen` + publish upload + export zip, `lib/templates.ts` validation
(license metadata required), template studio round-trip, tests.

**Requirements.**
- Published site + editor preview + exported zip all render the bundled faces offline.
- A starter with no declared fonts behaves exactly as today (system stacks stay the
  default and the fallback).
- Re-translate the batch 1–2 display faces (per SOURCES.md substitution ledger) to their
  closest OFL equivalents; update the ledger with the chosen face + license.
- Font binaries excluded from unnecessary duplication (dedupe shared faces across
  starters).

**Out of scope.** User font browser/arbitrary uploads beyond the existing custom-font
feature, non-OFL/commercial faces, CJK or extended subsets, variable-font axes UI.

---

## 24. Motion tools revision — cascade, preview fidelity, discoverability — `merged` (2026-08-09, on integration/specs-14r-19 with spec 13; William's hands-on review remains. Verify-first found: reveal sections vanished after className-changing edits (React wiped the runtime's motion-visible — fixed with a MutationObserver guard + entered-state WeakSet); scrub was never sharp while readable (curve renormalized to complete at 15% viewport); the Strength slider was dead for reveal/sequence (scene changes now replay entrances); and the spec-12 dial did not actually gate hand-authored scenes (now a true master switch — painter/photographer/sculptor got a muted vocabulary so their authored scenes survive). Cascade landed as theme.motion.scene + page.motion over the existing shape, resolved by resolveSectionScene; conservatory's ten entries regression-tested identical. The ∿ button is now a labeled chip naming the active scene.)

**Goal.** Iterate on spec 13's per-section motion tools from William's hands-on review
(2026-08-09, in the template studio on conservatory). Three findings, in priority order:
1. **No way to set motion above the section.** He wants a sitewide scroll-scene choice
   and a page-wide one — picking an effect once, not section by section.
2. **Preview fidelity.** "Some of them don't really load or preview that well — timing
   can be off." Effects must play in the editor preview the way they will publish.
3. **Discoverability.** He could not find the ∿ button even when told it existed. The
   icon reads as decoration, and the placement (between color and bleed controls) says
   nothing about motion.

**Where.** Continue on `worktree-spec-13-motion-tools` (spec 13 is built there,
unmerged — do NOT start from integration; you'd lose the section picker). Read spec 13
and its commits first.

**Verify first.** Before writing any fix, reproduce finding 2 with the browser pane
VISIBLE (a hidden pane freezes IntersectionObserver and CSS transitions — known trap):
walk all five effects (`reveal`, `drift`, `pin`, `scrub`, `sequence`) on conservatory
sections at desktop and phone widths, and record per effect what is actually wrong —
doesn't fire, fires at the wrong scroll position, wrong duration/stagger, re-triggers on
edit, differs from the published/staticgen output. Fix what's broken; recalibrate what's
merely weak; write the findings table into the commit message. If an effect is fine and
the complaint was editor-iframe-specific, make the preview match publish — never the
reverse.

**The cascade (finding 1).** One inherit chain, resolved top-down, using the EXISTING
`sectionMotion` shape at each level — no new effect vocabulary:
- **Site level**: a default scroll scene (effect + strength + phones) in Design →
  Effects, sitting with the spec-12 "Site motion" dial (which stays the master switch:
  Off still kills everything; reduced-motion still wins over all).
- **Page level**: an optional override in the existing page settings surface.
- **Section level**: spec 13's picker, unchanged semantics — `Inherit` now resolves
  section → page → site → spec-12 default; explicit `Off` at any level pins that scope
  still. Absent = inherit (the spec-13/22 convention, do not change it).
- Templates keep working: conservatory's hand-authored per-section entries must resolve
  identically after the cascade lands (regression-test this against its JSON).
- Schema: optional fields only, defaults = inherit; old drafts parse unchanged;
  round-trip + staticgen tests.

**Discoverability (finding 3).** Replace the bare ∿ icon treatment: clearer icon plus a
visible affordance — a short text label, or at minimum a HelpTip (reuse
`ui/controls.tsx` HelpTip — extend, don't duplicate). Consider whether motion belongs
grouped with color/bleed at all; if you move it, keep it inside the existing section
header surface, no new panels. Apply DESIGN.md: sentence case, verb-or-noun labels that
say what the thing does ("Motion"), no new colors.

**Out of scope.** New effects/primitives, keyframe or easing editors, per-image entrance
choreography, motion preview scrubbing, per-block (non-section) motion.

---

## 25. BUG: editor preview mis-positions text around oversized display headings — `merged` (2026-08-10, onto integration/specs-14r-19; William's hands-on review remains. Two causes found by the recon: (1) the editing canvas laid the site out at max(1100, panel width) while fullscreen used the window width — canvas geometry is %-of-width but type is fixed pt, so the views genuinely disagreed; both now lay out at max(1100, window.innerWidth) and the fullscreen desktop surface goes edge to edge, host = window width at scale 1. (2) The genuine renderer overlap both views shared: an oversized run (giant wordmarks are body runs with an inline pt size) inherited body leading 1.75, a line box ~75% taller than its glyphs — body-run leading is now min(1.75em, 1em + 24px), identical up to 24pt, display leading above; in-place + panel editor mirrors match. Verified three ways at 1280: editor canvas, fullscreen, and in-browser staticgen output measure identically on the conservatory CTA, all sub-24pt runs keep exact legacy leading, painter/clearing unchanged. Residual truth: a pt-fixed wordmark still collides with %-y neighbors at windows much narrower than the template was authored for — that is the composition, out of scope per the spec.)

**Goal.** The same page renders differently in the editor canvas vs the fullscreen
"Shown exactly as your published site" preview. Observed on a doc using a huge serif
display heading ("BOOK A WALL"): the caption below it ("Two prizes and a long-list live
on the Awards page.") sits under the heading in fullscreen, but in the editor canvas it
overlaps the middle of the heading. The page title ("Workshops" / "Your Name") shows a
similar overlap in both views, so there may be two issues: an editor-only positioning
divergence, and a genuine renderer overlap that both views share. Fix so the editor
canvas matches the published/fullscreen output pixel-for-alt-pixel at the same width.

**Why.** The whole trust model of the editor is WYSIWYG — the fullscreen toolbar
literally promises "Shown exactly as your published site". Any layout divergence between
the two makes users fix layouts that were never broken (or ship ones that are).

**Recon (verify first).** Reproduce before touching anything: load a doc with an
oversized display-type heading followed by a text block, compare editor canvas vs
fullscreen preview at the same viewport width. Suspects, in order: the
`DesktopDeviceFrame` scale/remeasure path (spec 16 just reworked its remeasure on
fullscreen/sidebar switch — this may be a regression or a missed case); editor-only CSS
leaking into the preview iframe vs the clean published CSS (see the known
client:only/island CSS traps); font loading timing (heading metrics measured before the
display font arrives → stale positions in the scaled frame only). Confirm which view
matches the actual published/staticgen output — that one is "correct".

**Files.** `src/editor/components/` (DesktopDeviceFrame / preview frame, whatever hosts
the canvas scale), `src/portfolio/` heading + text-block renderer only if the overlap
reproduces in staticgen output too. Renderer edits touch hashed files → `npm run
runtime:generate` and commit the manifest.

**Requirements.**
- Editor canvas and fullscreen preview render this doc identically at equal widths.
- If the title/name overlap also exists in published output, fix it in the renderer
  (likely line-height/overflow on the display heading), not with editor-side patches.
- No visual change to docs that don't use oversized display headings — eyeball a couple
  of merged starters before/after.
- `npm run check` + `npm test`; add a regression test only if the cause lands somewhere
  testable (e.g. staticgen output), otherwise document the manual repro in the PR.

**Out of scope.** New typography controls, redesigning the display-heading scale,
mobile-preview parity work beyond this bug.

---

## 26. Editor panel accordion sizing — resizable/right-sized block editor — `merged` (2026-08-10 onto integration/specs-14r-19. Recon: panel *width* was already user-resizable (320–720px rail with keyboard + dbl-click reset) — height was the gap: an open block card had no bound and no scroll of its own, so a dense form editor stretched the panel scroll past 2000px. Build: every renderBlock card wraps its body in a shared BlockBody — capped at clamp(260px, 100dvh−300px, 1100px) as the one clear scroll region, head always in reach — with a resize grip at the card's foot (pointer drag, ArrowUp/Down/Home/End, dbl-click reset; --wall-2 at rest, Klein only hover/focus, mirroring the sidebar rail; renders only when the body overflows or was resized; height lives per-session in sessionStorage, never the doc). Spec-15 0x0 trap: hidden pane measures 0 → grip withdraws, ResizeObserver re-arms on return, nothing persisted. Spec-16 Compact/Details heading re-anchors sticky to the body scrollport (top:0 inside .block-body; the panel's 92px ladder untouched) — verified computed + a stuck-in-place probe; this scaffold only renders the focusedUi variant, the same in-situ gap spec 16 noted. Spec-30 popover untouched (portal test green); the block-head "…" menu overlays the new scroller unclipped. Found in passing: the narrow-layout rule for four-column question rows was a phone @media, so a narrow *panel* clipped Required/✕ at the card edge — new @container (max-width: 400px) stacks form rows; the container reads ~64px narrower than the sidebar, so the default 440px panel stacks too, and four-column rows return (and fit) once the sidebar passes ~465px. Verified live at 320/440/520 sidebar widths on a 10-question contact form: 420px card, one inner scroll, drag/keys/reset/session-restore all exercised. tests/block-body-resize.test.ts locks the wrap count, cap+overflow-y, sticky re-anchor, quiet grip, and session-only persistence. npm run check 0 errors, npm test 348/348, manifest regenerated.)

**Goal.** The expanded block accordion in the left Pages panel (e.g. the contact-form
block editor with heading, delivery email, service address, help prose, and the
questions list) runs far taller than the panel, forcing long inner scrolls in a narrow
fixed-width box. Give the accordion a better-fitting box: let the open block use the
available panel height sensibly, and let the user resize it — at minimum a drag-to-resize
affordance (width, height, or both — decide from what the panel layout can support), or
an "expand" state that gives a dense editor like the form block more room.

**Why.** William's note from beta use: editing a form inside the current accordion feels
cramped — the box is the wrong size for the content it holds. Spec 15/16 polished the
controls inside the panel; this is about the container itself.

**Recon (verify first).** Find the accordion/expanded-card implementation in
`src/editor/components/PageEditor.tsx` (or wherever spec 16 moved block cards) and check
what sizing already exists — fixed panel width, any max-height, any existing resize or
expand affordance — before adding one.

**Files.** `src/editor/components/PageEditor.tsx` and the panel chrome around it;
`ui/controls.tsx` only if a shared resize handle belongs there. Editor-only — no
renderer/schema changes, so no manifest regen expected.

**Requirements.**
- The open accordion body stops double-scrolling awkwardly: it should grow to use the
  panel height available, with one clear scroll region when content still overflows.
- Resize affordance per DESIGN.md: subtle handle, no new colors, keyboard-reachable if
  it's interactive; size choice may persist per-session but doesn't need to be saved in
  the doc.
- Dense editors (contact form with its questions list) are the acceptance case: editing
  one must feel roomy without collapsing other panel functions.
- No layout regressions in the collapsed card list, the 0x0 hidden-pane trap (spec 15
  memory), or the sticky Compact/Details heading from spec 16.
- `npm run check` + `npm test` pass.

**Out of scope.** Detaching the panel into a floating window, redesigning the panel
navigation, touching the preview canvas, per-block custom layouts beyond the shared
resize behavior.

---

## 27. Fullscreen preview replays motion like a first visit — `merged` (2026-08-10 onto integration/specs-14r-19. Recon confirmed the spec's hunch and found the trigger already in-tree: the runtime replays whenever its effect re-mounts — `reset(true)` runs on every mount, the same path spec 24's scene-change fix and page navigation (`PortfolioPage key={page}`) use — so the fix is a remount, not a new mechanism. Editor-only: PreviewPanel keys the preview `<Portfolio>` on a `visitEpoch` bumped on each fullscreen entry (batched with `setFullscreen` so the fresh mount happens at fullscreen size), and a new `scrollResetKey` prop on DeviceFrame scrolls the iframe to top. Exit doesn't bump, so the canvas returns with its DOM intact. Found + fixed a PRE-EXISTING stuck-hidden bug (reproduced on unmodified baseline): the editor-only empty page-heading band (`is-empty-page-heading`) unmounts for fullscreen (resizeBreakpoint flip) and remounts on exit after the runtime's scan — unobserved, the reveal CSS hid it forever. Fixed via editor.css override (cloned into the preview iframe, never shipped with published sites) rather than touching the renderer. src/portfolio and staticgen untouched → published output byte-identical by construction. Verified with Playwright at 1440: 14/14 checks — conservatory entry (scroll reset, entered-state cleared, in-viewport content settles), 6/6 entrances replay during fullscreen scroll-through, clean exit incl. the band, re-entry replays again, reduced-motion never dips below opacity 1, blank doc no errors/flash. `npm run check` 0 errors, `npm test` 343/343, manifest regenerated. Mobile-preview replay came free (shared epoch key). Residual: hand-verify the entrance feel by eye — automation asserted classes/opacity, not choreography taste.)

**Goal.** Entering the fullscreen preview ("Shown exactly as your published site")
should reset and replay all page motion — section entrances, reveals, sequences — as if
the visitor just landed on the published page for the first time. Today the preview
carries over the editor canvas's already-entered state, so the user never sees the
entrance choreography they authored without a manual reload.

**Why.** The fullscreen preview exists to answer "what will a visitor see?" — and the
first-load motion IS what a visitor sees first. Right now the one view that promises
published fidelity is the one place you can't check your entrances.

**Recon (verify first).** Study the spec 13/24 motion runtime before touching it: the
entered-state WeakSet + MutationObserver guard that keeps `motion-visible` from being
wiped, and the existing "scene changes replay entrances" path that the Strength slider
fix added (spec 24). A replay mechanism therefore already exists — the work is
triggering it on the fullscreen toggle, not building a new one. Find where the
fullscreen switch lives (`DesktopDeviceFrame` / the toolbar from spec 16, which already
hooks that transition for its remeasure).

**Files.** `src/editor/components/` (fullscreen toggle → fire the replay), the motion
runtime module from specs 12/13/24 (expose a reset/replay entry point if scene-change
replay isn't directly callable). If the runtime file is hashed, `npm run
runtime:generate` + commit the manifest.

**Requirements.**
- On entering fullscreen: all entered-state is cleared and entrances/reveals/sequences
  re-run from their initial hidden state, scroll position reset to top — matching a
  cold load of the published site.
- Exiting fullscreen returns to the editor canvas without motion artifacts (no sections
  stuck hidden — the exact failure class the spec 24 MutationObserver guard fixed).
- Respects the motion master switch and `prefers-reduced-motion`: when motion is off,
  fullscreen shows the static page, no replay flash.
- Published sites unchanged — this is an editor-preview trigger, not a runtime behavior
  change; verify staticgen output is byte-identical if the runtime module is touched.
- Works with hand-authored template scenes (conservatory is the regression case, per
  spec 24) and with docs that have no motion at all (no flash, no errors).
- `npm run check` + `npm test` pass.

**Out of scope.** A replay button inside the editor canvas itself, motion scrubbing,
changing any published-site load behavior, mobile-preview replay (nice if free, not
required).

---

## 28. Better motion icon — replace ∿ everywhere it appears — `merged` (2026-08-10 onto integration/specs-14r-19. Recon: the squiggle survived in exactly one JSX site — the shared SectionMotionPicker trigger chip — plus a CSS comment; the page- and site-level scene pickers are plain selects with no glyph, so one component covers every motion surface. Replaced with a new shared `motion` PanelIcon in ui/panel-icons.tsx (speed lines trailing a dot, outline stroke per DESIGN.md), sized 14px in the chip. Recon grep re-run: zero ∿ under src/. Labels, HelpTips, and the popover untouched; eyeballed rest "Motion" and active "Sequence" chip states at panel scale. `npm run check` 0 errors, `npm test` 328/328, manifest regenerated.)

**Goal.** Find every place the editor uses the ∿ squiggle as the motion glyph — the
per-section chip (spec 24 made it a labeled chip naming the active scene), the
per-element motion tools from spec 13 (SectionMotionPicker and friends), and any other
block-level motion affordance — and replace it with one clearly-better icon used
consistently in all of them. The squiggle reads as "wave/decoration", not "motion".

**Why.** Spec 24's discoverability finding already flagged the bare ∿ as the weak
point; the label helped, but the glyph itself still doesn't communicate motion. One
good icon, applied everywhere, beats per-spot improvisation.

**Recon (verify first).** `rg -n "∿" src/editor` (and search for any named
motion-icon component) to enumerate every usage before designing — the fix is a
search-and-replace across all of them, not a new icon in one spot. Check how other
editor icons are implemented (inline SVG? glyph characters?) and follow that pattern.

**Files.** Wherever the recon finds the glyph — expected: `src/editor/components/`
(section header chip, SectionMotionPicker, motion pickers from specs 13/24) and possibly
`ui/controls.tsx` if the icon should become a shared component (extend, don't
duplicate, per the HelpTip precedent). Editor-only; no schema or renderer changes.

**Requirements.**
- One icon, every motion surface — no site of the old glyph left behind (re-run the
  recon grep at the end to prove zero remaining hits).
- The icon must read as motion/animation at 13–16px: think a play-style or
  motion-lines mark, chosen against DESIGN.md — monochrome, current ink colors, no new
  colors, works on both panel and canvas-chip backgrounds.
- If made a shared component, all call sites import it from one place.
- Labels and HelpTips added by specs 15/24 stay intact — this changes the glyph, not
  the affordance structure.
- Eyeball at real panel scale: section header chip, per-element picker, and any canvas
  overlay usage. `npm run check` + `npm test` pass.

**Out of scope.** Redesigning the motion pickers or chip layout, new motion features,
icon changes to non-motion controls, published-site output (no runtime files touched).

---

## 29. Numeric pixel input beside the smart-grid gap sliders — `merged` (2026-08-10 onto integration/specs-14r-19. Recon: gaps are stored in rem (slider 0–4rem, renderer emits `--gap-x/y: <v>rem`) and nothing in the portfolio runtime overrides the root font size, so the field honestly speaks px at ×16 (0–64px, same clamps). Reused spec 15's SliderNumberInput from ImageCropDialog — hoisted to ui/controls.tsx, shared by crop dialog + both gap-slider sites. Undo: gap patches now pass an actionKey so typing is one undo per committed edit and a slider drag coalesces to one entry (was one per 0.25 step). Off-step typed values (22px = 1.375rem) store exactly; slider thumb displays the nearest 0.25 step by DOM step-snapping — cosmetic only. Verified: e2e drive typed 22px/9px → preview `--gap-x:1.375rem` → in-browser staticgen index.html emits identical rem; narrow nested-block panel wraps the px field below the slider instead of clipping. Other slider+number candidates noted, not done (out of scope): the batch "Crop & zoom all" zoom slider in PageEditor (shows a read-only × value today) and ThemeEditor's texture strength/hue sliders — SliderNumberInput is now shared in ui/controls.tsx if wanted.)

**Goal.** The smart-grid image-spacing controls (the gap sliders spec 18 added) get a
small numeric input next to each slider showing the current value in px, editable
directly: type a number → grid updates, drag the slider → the number follows. Applies
to every gap slider the smart grid exposes (row/column or single gap — whatever spec
18 shipped).

**Why.** Sliders are good for feel, bad for precision and repeatability. Artists
matching a spacing across sections (or copying a value from another site) need to see
and type the exact number, not eyeball a thumb position.

**Recon (verify first).** Find the spec-18 gap sliders (`rg -ni "gap" src/editor` near
the smart-grid controls) and check: what unit the doc schema actually stores (px? a
unitless token? %) and whether a numeric-input-beside-slider pattern already exists
anywhere in the panels (spec 15 polished these controls — reuse its idioms). If the
stored unit isn't px, display px only if the conversion is honest at render time;
otherwise show the stored unit and say so in the label.

**Files.** `src/editor/components/` (the smart-grid/gap control site),
`ui/controls.tsx` if a shared slider+number field is the right shape (extend, don't
duplicate). No schema change expected — same stored value, second way to set it.

**Requirements.**
- Two-way binding: slider drag updates the field live; typing (or arrow keys in the
  field) updates the grid and the slider. Same min/max clamps as the slider; values
  outside range clamp, junk input reverts to current value.
- One undo entry per committed text edit (on blur/Enter), consistent with the
  slider's undo behavior — follow the spec-18 single-undo discipline.
- Layout per DESIGN.md and the spec-15 squish fixes: the input is compact (~4ch), 13px,
  doesn't wrap or crowd the slider in the narrow panel, no new colors.
- Preview and published output already follow the stored value — verify one publish
  round-trip that a typed value renders identically in staticgen output.
- `npm run check` + `npm test` pass.

**Out of scope.** New spacing options or units, per-image spacing, changing slider
ranges/defaults, applying the pattern to unrelated sliders (do the grid gaps only —
note other candidates in the outcome line instead).

---

## 30. BUG: image-row "…" menu renders as a broken see-through overlay — `merged` (2026-08-10 onto integration/specs-14r-19. Root cause: the spec-16 popover portalled to document.body, but every editor design token — surface colors, Inter, ui themes, custom appearance — is scoped to `.editor` (scoping predates spec 16, so the menu was born broken, not a merge collision); outside that scope each `var()` declaration is invalid, so the menu painted transparent in UA-default serif. Fix: the portal now mounts into the trigger's `closest('.editor')`, which also makes dark/contrast/custom-appearance themes inherit correctly — verified opaque paper surface, stacked spec-16 order, exclusivity, Esc/outside-click/scroll close, bottom clamp, copy-to-workbench + toast, and a dark-theme spot check in the browser; regression test `tests/image-menu-popover.test.ts` locks the portal host and the popover's token background. Note found in passing, not fixed here: `.workbench-menu`, `.color-swatch-popover`, and `.motion-scene-popover` still portal to document.body with the same token trap — the latter two paper over it with hardcoded light-theme var() fallbacks, the workbench context menu has none and should be see-through today.)

**Goal.** The per-image "…" menu in the Pages panel (the portal popover spec 16 built:
Copy to workbench / Use page setting / Copy to… / Move to… / Earlier / Later / Send to
top / Send to bottom / Open details / Delete image) currently renders bugged: the
popover has no opaque background, so its items paint directly over the image rows and
section cards behind it, labels collide with row text ("Copy to workbench" over the
Image 4 row, stray "Hanging"/"Copy"/"Move" fragments, "Delete image" floating over
Section 2), and items are scattered rather than stacked in one coherent menu. Fix it so
the menu is a single opaque, correctly-positioned popover again.
Screenshot of the broken state:
[docs/feedback/spec-30-broken-image-menu.png](docs/feedback/spec-30-broken-image-menu.png).

**Why.** This is the only home of destructive and organizational actions per image
(delete, move, copy); in this state it's unreadable and risks misclicks — a beta
blocker for the panel work already merged.

**Recon (verify first).** Reproduce first (any doc with image rows → click "…").
This popover landed in spec 16 as a portal fixed at its opening position, and specs
merged after it on `integration/specs-14r-19` (17's renderer work, 18's grid controls)
may have collided with its styles. Check: is the popover's container/background CSS
missing or overridden (portal mounting outside the scoped style boundary — see the
known client:only island-CSS trap); did a z-index/stacking or transform change break
the fixed positioning; or did a merge drop the popover stylesheet? `git log` the
popover component for recent touches before assuming.

**Files.** The spec-16 popover component in `src/editor/components/` (PageEditor or
the extracted menu component) and its styles. Editor-only; no schema/renderer changes
expected.

**Requirements.**
- The menu renders as one opaque panel per DESIGN.md (existing surface/ink tokens, no
  new colors), items stacked in the spec-16 order, positioned at the trigger.
- Spec 16 behaviors intact: exclusive (one open at a time), closes on outside click,
  Esc, and scroll; actions still fire and the copy/move toast still shows.
- Check both places the menu opens (image rows and any other "…" trigger that shares
  the component) and at panel-bottom rows where the popover must flip/clamp on-screen.
- Add whatever regression check is feasible (even a smoke test that the portal mounts
  with its background class); `npm run check` + `npm test` pass.

**Out of scope.** New menu items, redesigning the menu, the accordion-resize work
(spec 26), drag-and-drop changes.

---

## 31. Expose the contact-sheet side-scrolling text as an editor feature — `done — already shipped, verified` (2026-08-10, no code change. Recon found the spec's premise stale: the full KineticText control shipped in "Release motion tools" (94e5292, 2026-07-29) — every text block has a "Type motion" select (Still/Words rise/Letters rise/Lines rise/Marquee) with Tempo + "Use on phones" + ▶ Preview, and every page has the same under Page details → "Heading motion"; both write the exact template schema shape (`block.kinetic` / `page.headingKinetic`, `{effect, speed?, phone?}`). Verified end-to-end by driving the editor on a blank doc: marquee on/off round-trips clean (switching back to Still deletes the key — untouched-doc bytes preserved), canvas preview animates live (canvas + normal-flow text and heading; tempo 150% → 8s track; phone-off class applies; replay button works), `prefers-reduced-motion` stops the animation, and the real in-browser staticgen publish renders both marquees (content.json carries both configs; index.html has 2 tracks/4 copies with the aria-hidden duplicate; kinetic CSS ships). Contact-sheet byte-identical — zero renderer/schema/editor edits, manifest untouched. `npm run check` + `npm test` (328) pass.)

**Goal.** The contact-sheet template has a side-scrolling (marquee) text treatment that
users can only get by starting from that template — the renderer already ships it
(`src/portfolio/KineticText.tsx` / `KineticText.css`, referenced from
`contact-sheet.content.json`). Surface it in the editor so any user can turn a text
block or heading into side-scrolling text and edit its content, on any doc.

**Why.** It's one of the most distinctive moves in the catalog, and today it's
template-locked: apply contact-sheet or never have it. Template-only renderer features
keep generating "how do I get that?" beta questions.

**Recon (verify first).** Read `KineticText.tsx` and how `contact-sheet.content.json`
invokes it — what schema shape drives it today (a block kind? a text-block flag? a
display-type variant?). Then check the doc-schema and the text-block editor
(`TextBlock.tsx`, PageEditor's text controls) for any existing partial exposure before
adding one. The schema shape the template already uses is the contract — expose that,
don't invent a parallel one.

**Files.** `src/editor/components/PageEditor.tsx` (the control: a style/display option
on text blocks or headings, following existing option-picker idioms),
`src/editor/lib/doc-schema.ts` only if the template's shape isn't already representable
(optional fields, defaults preserve old drafts — the standing convention).
`src/portfolio/KineticText.*` only for bugs found along the way. Renderer/schema are
hashed → `npm run runtime:generate` + commit the manifest if touched.

**Requirements.**
- A text block/heading can be switched to side-scrolling and back in the panel; the
  editor canvas previews the actual motion (or a paused state if the canvas suppresses
  motion — match how other motion previews behave, specs 13/24).
- Editable content, and whatever knobs KineticText already supports (speed/direction/
  repeat) exposed only if they're already in the template's schema shape — no new
  capabilities this pass.
- Respects the motion master switch and `prefers-reduced-motion` the same way the
  contact-sheet template does today.
- Contact-sheet renders byte-identical after the change (it's the regression case).
- Publish round-trip: a doc using the new control renders the marquee in staticgen
  output. `npm run check` + `npm test` pass.

**Out of scope.** New marquee capabilities (vertical scroll, per-character effects),
applying it to images, changes to the contact-sheet template content, a general
"kinetic text" design system.

---

## 32. Contact-sheet fidelity pass against its reference site — `merged` (2026-08-10 onto integration/specs-14r-19. Keo DOM-measured at 1280 beside the starter; full audit table in SOURCES.md §spec 32. Fixed: marquee moved to a full-bleed ticker band between grid and signature (canvas text + `sectionBleed` + two `shape: line` hairlines — first shape use), marquee direction flipped renderer-side to Keo's rightward drift (no schema knob; KineticText.css keyframes), speed 50 = the reachable floor (~53px/s vs Keo ~30), statement 38pt = 50.7px (Keo 51.3), grid 4-col with 4:3 crops + 6rem gutters = 228×171 cells (Keo 235×176) and 3 unused Atget street scenes added (12 frames; catalog has only 9 Hine), white/black palette in content + almond-paper preset, body stack Poppins-led (live Keo body IS Poppins — batch-1 Halyard→Avenir mapping superseded), nav centered+uppercase with logo 75 and un-pinned header, hover motion off, sequence intensity 25, giant name single-line at x2% with links stacked above (9-char placeholder collides where "Keo" doesn't), links underlined with real /field-notes /about runs. Renderer bug found+fixed: rich-text marquees rendered the aria-hidden duplicate unstyled (still-room's 20pt ticker showed two sizes live) — both copies now carry run formatting, links stripped from the duplicate. Second renderer bug found+fixed via the real staticgen publish check: with samples stripped the empty canvas host is dropped and the standalone fallback rendered either texts or shape widgets (whichever block type anchored first), so the published-unmodified starter lost ticker/name/links — all four standalone anchor branches in PortfolioPage now render texts+embeds+widgets in one canvas; published index.html verified carrying the full band (track ×2 copies at 35pt, both hairlines, bleed, rightward keyframes, Poppins+OFL). Skipped with reasons (SOURCES.md rows): −3% tracking + display line-heights (not in richText schema, flagged since spec 22), Poppins 400 weight (bundled face is 500, spec 23 owns), nav link px/weight + 26px side margins (renderer CSS), 16th–13th grid frames (only 9 Hine in catalog), second footer column (no real social URLs), /work hover-follow index (capability gap, out of scope), scale-pop entrance (sequence fade+rise is the closest vocabulary). Verified: template-studio Save bar reports byte-clean (hand JSON = serializer fixed point), motion checked in a visible viewport (4 pending → 0 on scroll), phone (name hidden, ticker live, 1-col grid), still-room + masthead regression eyeballed. `npm run check` + `npm test` (343) pass; manifest regenerated (templates.ts, KineticText.css/tsx, TextBlock.tsx, Hero.tsx hashed). Remains: William's side-by-side sign-off, then merge.)

**Goal.** Side-by-side the reference site
<https://keo-fluid-demo.squarespace.com/> against our contact-sheet starter
(`/portfolio-template/editor?template-studio=starter:contact-sheet` on the dev server —
William runs it at `http://localhost:4406`, but any `npm run dev` port works) and close
the gaps: animations, fonts, spacing, and sizing, until the starter reads as the same
design. This is the spec-22 conservatory treatment applied to contact-sheet.

**Why.** Contact-sheet is a signature-device starter; "roughly similar" isn't the bar
the catalog set in spec 22. A reference this specific deserves a deliberate audit, not
incidental fixes.

**Recon (verify first).** Load both at the same viewport width and walk the full page
scroll on each, listing every divergence before editing anything: entrance/scroll
animations and their timing, the marquee behavior (speed, direction, seamlessness —
coordinate with spec 31, which exposes KineticText as an editor control; don't fork its
schema shape), typography (family, weight, size scale, letterspacing, case), spacing
rhythm (section padding, grid gaps), and element sizing/proportions. Note which gaps
are template *content/preset* fixes (edit `contact-sheet.content.json` + theme preset
via template studio — "Save to template" writes the JSON back) vs *renderer* gaps
(missing capability in `src/portfolio/`). Prefer content/preset fixes; renderer changes
only for capabilities the design truly needs, per the spec-14 preset-trait discipline.

**Files.** `src/editor/lib/starters/contact-sheet.content.json`, its theme preset in
`theme-presets/`, `src/portfolio/` only where a capability gap is proven (hashed →
`npm run runtime:generate` + manifest commit). Fonts: only faces already in the font
ledger (spec 14) — if the reference's face isn't available, pick the closest ledger
face and note it; spec 23 (starter webfonts) owns adding new ones.

**Requirements.**
- Deliverable includes the divergence list with each item marked fixed / deliberately
  skipped (with reason) — the spec-22 audit format.
- Template-studio round-trip: changes saved via "Save to template" pass
  `validateStarterCatalog` and survive `docToTemplateContent` serialization (the
  template-studio tests stay green).
- Rights discipline: any new imagery follows the sample-artwork rights catalog; no
  assets copied from the reference site — layout/motion/typography are what's being
  matched, never its content or photos.
- Hidden-pane trap (spec 22 memory): verify motion with the pane visible — a hidden
  pane fakes "no motion".
- Other starters unchanged: eyeball two non-contact-sheet starters before/after if the
  renderer was touched. `npm run check` + `npm test` pass.

**Out of scope.** Pixel-cloning the reference's images or copy, new starters, spec-23
webfont infrastructure, editor UI changes (spec 31 owns the KineticText control).

---

## 33. Beta PT 3: invisible new-section text, boundaries on by default, floating buttons → top bar — `merged` (2026-08-11 onto integration/specs-14r-19. **A — fixed, renderer runtime.** Repro nailed first at 1440 on conservatory: add a text block through "New section" and the new part renders `data-motion-effect="reveal"` at opacity 0 and stays there even once scrolled into view. Three-way check split it cleanly — canvas broken, fullscreen fine, published fine — so the cause is a live-DOM timing gap in the shared runtime, not a rendering bug. `SectionMotionRuntime` snapshots `[data-motion-effect]` once per effect run, and its signature (section entries + page scene + theme scene) does not change when a page *part* is added, so a section that mounts later is never observed, never marked entered, and `.motion-runtime-ready .motion-effect-reveal … { opacity: 0 }` holds it invisible forever. "Sometimes" = only where the resolved scene is reveal (10 of the 14 starters declare `theme.motion.reveal`; painter/photographer/sculptor/works-on-paper do not), and it self-heals the moment any motion setting is touched or the section arrives from a saved template carrying motion — both change the signature and force a rescan. Fix: the runtime now watches the page root and adopts late arrivals as *already entered* (visible at once, class guard armed, continuous scenes scheduled), prunes sections the editor deleted, and no longer bails when the first scan finds nothing — an empty page can gain its first motion section. An insertion into a live page is an edit, not a scroll entrance; published pages never insert sections, so first-load choreography is untouched by construction (SSR markup still carries no `motion-visible`/`motion-runtime-ready`, locked by test). Verified: all 14 starters now show the new section at opacity 1, and fullscreen still replays the pre-existing entrances. **B — already true, now locked.** Verify-first found the premise stale: `sectionEdges` has defaulted ON since the toggle was introduced (before it, boundaries were unconditional), in all four branches of `gridPrefs.load()`. Probed with an empty profile — no stored prefs, button `aria-pressed=true`, 8 resize handles, klein boundary lines drawn. The only way to see them off is having turned them off, which the spec says must stick. No code change; four tests lock default-on, off-for-legacy-prefs-without-the-key, and explicit-off-persists. **C — done.** The floating `.pv-dock` is gone; Layers and Add block are two icon buttons in the preview toolbar (`preview-tool-button`, existing `layers`/`plus` icons, sentence-case tooltips, no new colors, toolbar already `flex-wrap`). The buttons live in the editor document and the cards in the preview iframe's own React root, so a small `controls.tsx` bus carries the click in (`togglePreviewStructureTool`) and the open state back out (`usePreviewStructureState`) for the pressed state; Escape now also closes from the editor document, but *only* what those two buttons opened. Measured before/after against the unmodified checkout: conservatory's "Works" and "Bio" were covered by `pv-dock-button pv-dock-add`, now all five nav links hit-test clean, dock count 0 on every starter. Found in passing, unchanged and out of scope: several starters (clearing, still-room, masthead, photographer) compose their own canvas art over the header, so the nav is covered by the artwork itself before and after — the header is still reachable from the Site tab. Residual: the Layers/picker cards still open at the frame's top-left and cover the nav *while open* (they are dialogs, and they covered it before too, one dock-height lower). `npm run check` 0 errors, `npm test` 364/364 including 16 new in `tests/beta-pt3.test.ts`; manifest regenerated.)

Three beta findings from William (2026-08-10), bundled spec-16 style: independent items,
fix all three, report each in the outcome line.

**A. BUG: text added to a new section is sometimes invisible.** Add a section, add a
text block, type — the text sometimes doesn't render in the canvas. Reproduce first and
pin down "sometimes": likely suspects are the new-section default colors (text color =
section background?), a motion/entrance state that never fires for freshly-added blocks
(the spec-24 entered-state machinery — a block added after the scene ran may sit
permanently hidden awaiting an entrance), or a zero-height/collapsed block. Check
whether it reproduces in fullscreen preview and staticgen output or only in the canvas —
that splits renderer vs editor-state causes. Fix the real cause, not a CSS override;
add a regression test if it lands somewhere testable.

**B. Section boundaries on by default.** The section-boundary outlines toggle in the
editor canvas should default to ON for everyone (find the existing toggle + where its
state lives — if it persists per-user, only the initial default changes; an explicit
user choice to turn it off must stick). Editor-only, no doc-schema change.

**C. "＋ Add block" and layers buttons stop covering the site's navigation.** The two
floating buttons at the canvas top-left (layers ≋ and "＋ Add block") sit on top of the
rendered site's nav bar — see spec-30's screenshot era: they overlap the portfolio's
own menu links. Move both into the editor's top toolbar (the row with the device/grid
toggles) instead of floating over the page. Keep their functions and shortcuts
identical; kill the floating overlay entirely so no canvas chrome covers site content.
DESIGN.md for the toolbar buttons: existing icon style, sentence-case tooltips, no new
colors.

**Recon (verify first).** For each item, find the current implementation before
changing it (boundary toggle state, the floating-button container in
`src/editor/components/` — likely near the PreviewEditLayer/DesktopDeviceFrame chrome).
Item A needs the repro nailed before any fix.

**Files.** `src/editor/components/` (canvas chrome, toolbar, PageEditor);
`src/portfolio/` only if item A turns out to be a renderer bug (hashed → `npm run
runtime:generate` + commit manifest).

**Requirements.**
- A: text in a fresh section is always visible immediately after typing, in canvas,
  fullscreen, and published output; regression test where feasible.
- B: boundaries default ON; an explicit off still persists however the toggle persists
  today.
- C: no floating buttons over the rendered page; both live in the top bar, work at
  narrow window widths without crowding the existing toggles, and the nav bar of every
  starter is fully clickable in the canvas.
- `npm run check` + `npm test` pass; manifest regenerated if hashed files touched.

**Out of scope.** Redesigning the toolbar, the layers panel's contents, new block
types, the accordion-resize work (spec 26).

---

## 34. Text editing consolidation: retire panel text mirror, reliable floating panel, cursor-jump bug — `merged` (2026-08-11 on worktree-spec-34-text-editing. **A — done.** The text card's `RichTextEditor` is gone; the card keeps every setting it had (font + linked/independent status, box color, type motion with tempo/phone/preview, whole-box link, width & position, canvas placement) and gains a read-only 90-char excerpt — so two text cards still tell apart — plus a "Edit text on the page" button. That button rides a new `editTextOnPage` bus in `controls.tsx` to PreviewPanel, which returns the preview to plain desktop editing on the block's page and *then* starts the in-place edit (deferred through a `pendingInlineEdit` state, because the existing effect clears in-place editing whenever page/device/fullscreen change — setting it outright would be undone in the same commit). Verified from phone mode and on a sub-page: the preview flips to desktop, the caret lands in the right block, typing continues from the caret. Undo behavior untouched — in-place edits still coalesce through the existing `page:<key>:rich-text:<id>` action key. About content keeps its own panel editor (different block, no in-place path). **B — two deterministic causes found and fixed, not an intermittent one.** (1) `selectedRect` measured `blockRect` = `.preview-block-boundary` only, but canvas-pinned blocks have no flow boundary — and `store.addTextBlock` gives *every* new text block a `layout`, so no text block ever showed the block toolbar (`.pv-block-toolbar` count 0 with the block selected and outlined-nothing; the inline format toolbar showed only because it already used the `anyBlockRect` fallback). Now `anyBlockRect`. (2) An empty text box rendered `null` in the page flow, so there was no element to measure or click — with A landed that would have been a dead end. `TextBlock` now takes `editorPreview` and renders the same dashed "Empty text — double-click to write" placeholder that canvas texts already had; verified absent in fullscreen (= published). (3) `selectedId` moved from the edit layer's local state up to PreviewPanel: the layer unmounts on fullscreen, the phone view, and Fast Refresh, so the selection — and the toolbar — died with it. Verified toolbar present after desktop→phone→desktop and after fullscreen exit. Note: the floating chrome is desktop-only by design (`editable = device === 'desktop' && !fullscreen`), so "both device modes" is verified as surviving the round trip, not as drawing chrome over the phone frame. **C — reproduced, and A was NOT the whole fix.** Instrumented the re-seed and drove it: plain typing (slow, fast, mid-paragraph, multi-paragraph, after re-entry) never re-seeds — the `lastEmittedRef` echo guard holds, and `execCommand` fires `input` so bold/italic/align are safe too. Two real triggers: (i) the toolbar's size presets and exact-pt input — `applyPointSize` keeps rewriting the DOM *after* execCommand's input event, so the editable never records that edit, the store's model reads as an outside change, and the next render rewrites `innerHTML` under the live caret (measured: text typed afterwards landed at paragraph offset 0). Fixed at the cause — `applyPointSize` now dispatches its own `input` event, built from the editable's own realm so the in-place editor inside the preview iframe actually hears it. (ii) the panel mirror, exactly as the spec suspected — with the caret live on the page, each panel keystroke re-seeded the page's editable (5 re-seeds for 5 keystrokes); removed by A. Defense in depth for anything left (undo mid-edit, future writers): new `src/lib/caret.ts` measures the selection as character offsets and restores it across a re-seed, wired into `InlineTextEditor`'s seed effect. Works for canvas free-form and normal-flow text alike. `npm run check` 0 errors, `npm test` 372/372 including 8 new in `tests/text-editing.test.tsx`; manifest regenerated (caret.ts, InlineTextEditor, TextBlock, PortfolioPage + editor files hashed). Not fixed, found in passing: `vitest.config.ts` excludes `.claude/worktrees/**` but worktrees now live in `.claude-worktrees/`, so a main-checkout `npm test` sweeps in every in-flight worktree's tests — shared surface, left alone.)

Three coupled text-block findings from William (2026-08-10). The direction: in-place
editing on the canvas is the one way to edit text *content*; the panel keeps *settings*
only.

**A. Retire the text content editor in the left panel — keep the settings.** The text
block's card in the Pages panel currently mirrors the text content for editing. Remove
the content-editing field from the panel; everything else on the card stays (type
motion, style/size controls, the block's move/delete chrome — whatever settings exist
today). Content edits happen in place on the canvas. Make discovery obvious: the card
should point at the canvas ("Edit text on the page" affordance that selects/focuses the
block), so nobody hunts for the vanished field.

**B. BUG: the floating settings panel must always be available while a text box is
selected.** With a text block selected on the canvas, the floating panel (the
PreviewEditLayer chrome) sometimes disappears — and with A landed it becomes the
primary settings surface, so intermittent is unacceptable. Reproduce first: known
fragilities in that layer are iframe re-renders/Fast Refresh wiping overlay state,
scale/remeasure on device-frame changes (specs 16/25 both touched remeasure), and
selection state lost when the doc re-renders after an edit. Fix the disappearance;
selection alone must deterministically show it, every time, in both device modes and
fullscreen-exit.

**C. BUG: cursor teleports to paragraph start while typing.** In-place text editing
sometimes snaps the caret to the front of the paragraph mid-typing — the classic
controlled-contenteditable failure: a re-render replaces the DOM text node under the
caret (often after a store round-trip or a debounced sync). Reproduce, then fix at the
cause: don't rewrite the contenteditable's DOM while it owns focus (skip the mirror
update for the actively-edited node, or preserve/restore the selection range across the
sync). With A landed there is no panel mirror to sync mid-edit, which may remove the
trigger — verify rather than assume.

**Recon (verify first).** Find the panel text field (PageEditor text-block card), the
floating panel implementation (PreviewEditLayer — see the spec-16 constraints:
in-iframe, instanceof→nodeType, iframe scale), and the in-place edit sync path
(canvas contenteditable → store). Reproduce B and C before changing anything; note
whether C reproduces only while the panel mirror exists (A may be the fix).

**Files.** `src/editor/components/` (PageEditor card, PreviewEditLayer, canvas edit
layer), `src/editor/store.tsx` (sync/undo). Editor-only expected; manifest regen only
if hashed files are touched.

**Requirements.**
- A: no content-editing field in the panel; all existing settings preserved; the card's
  "edit on page" affordance selects and focuses the block on the canvas. Undo history
  unaffected (in-place edits already coalesce — keep that behavior).
- B: selection ⇒ floating panel visible, deterministically — canvas, both device
  modes, after fullscreen exit, after Fast Refresh in dev. Add a regression test if the
  visibility logic is extractable.
- C: caret never moves except by user action; typing at speed mid-paragraph and after
  the debounce boundary stays in place. Test the sync-skip/selection-restore logic if
  it lands somewhere testable.
- Works for canvas free-form text and normal-flow text blocks alike.
- `npm run check` + `npm test` pass.

**Out of scope.** Rich-text features (formatting toolbar, links), heading blocks'
panel treatment beyond what they share with text cards, the accordion work (spec 26),
mobile/touch editing.

---

## 35. AUDIT: can every starter be built from — and emptied back to — a blank document? — `done, unmerged` (2026-08-11, branch `worktree-spec-35-starter-audit`; audit table in SOURCES.md §spec 35, harness in `tests/starter-empty-harness.ts` + `tests/starter-empty.test.ts`, `HARNESS_STRICT=1` = spec 36's acceptance bar. Measured: 3,078 strings / 130 distinct schema paths across the fourteen. **Both of William's named worries came back clean** — every block type a starter uses is in the Add-a-block menu, and no starter uses a footer arrangement `FooterEditor` lacks, so there is no hard-coded text or footer section to promote. Eleven empty-direction findings, all renderer- or product-level and none starter-specific: 404 shell copy, `Open  in image viewer` with a hole where the title was, ContactForm's undeletable `Send message`/`Required`/unavailable sentence (conservatory), the carousel `1 / 4` counter (photographer), sub-page cards that fall back to the raw page slug **and** an inline label that refuses to be emptied (works-on-paper), and `resume.label` = `Résumé` with no control. Structure pass is otherwise clean: all fourteen empty to an `index.html` with **zero visible text**. Biggest build-direction gap is typography — **18 font stacks used by 13 of 14 starters are absent from the font menu**, so the picker shows an opaque `Custom (…)` and a blank-document artist cannot name any of the ten bundled faces. One premise disproved by driving the editor rather than reading source: the `footerColumns?.length` stray-`0` is *not* reachable, because `setFooterColumns` normalises `[]` → `undefined` — recorded as latent hardening, not a bug. Spec 36 = **three sessions, four if the cosmetic chunk is taken**, in four parallel chunks: renderer fallbacks / form-block fields / font menu / small missing fields.)

**Audit only — no product code changes.** The deliverable is a written table plus verdicts.
Spec 36 does the building; it cannot start until this merges.

William's standard (2026-08-11) runs **both directions**:

- **Blank → template.** Every template must be reproducible by an artist starting from a
  totally blank document, using only editor UI. No hard-coded text sections, no hard-coded
  footer sections. Where a template does something distinctive with a footer or a text
  section, that distinctiveness belongs in the footer/text menu as a *named format* the artist
  can pick — not as a one-off that only exists because the starter JSON (or the renderer) says
  so.
- **Template → blank.** Every template must also be emptiable back to a blank document. No
  text an artist cannot delete or replace through the UI: every string a starter ships —
  headings, body copy, nav labels, footer/signature lines, button and link labels, form field
  labels, page titles, alt text, placeholder-looking copy — must be reachable and removable,
  and the page must render sanely once it is gone (no orphaned band, no ghost label, no
  section that reappears with the template's words in it).

The two directions catch different bugs: the first finds capability the editor lacks, the
second finds text that is baked into the renderer or into a shape the editor won't let go of.

**Why audit first.** Recent specs in this area kept finding the premise wrong in both
directions: spec 31's "missing" control had already shipped, and spec 32 found the reverse — a
renderer path that only worked for template-authored shapes. Guessing the work list from greps
would waste the build session.

**Method — audit by construct, not per starter.** The fourteen starters ship ~2,800
non-trivial strings (112–400 each), but they collapse to ~66 distinct schema leaf fields —
gallery `title`/`description`/`alt`/`link` alone are ~730 strings yet *one* editor control.
Verify each construct once and project the result onto starters; never re-prove the same
control fourteen times. Funnel:

1. **Script pass (no UI).** Walk the fourteen `src/editor/lib/starters/*.content.json` plus
   their presets in `theme-presets/`, extract every `(schema path, string)` pair, and dedupe to
   the distinct constructs — field kinds plus block/section shapes. This mechanical inventory
   is the table's row source; a starter × finding row is a projection of
   construct → starters-that-use-it.
2. **Static reachability pass (blank → template).** Map each construct to the editor control
   that writes its schema path. A grep cannot prove a control *missing*, but it can cheaply
   prove one *present* — those rows become `reproducible` citing the control, no UI time.
   Constructs with no match or an ambiguous one go to the live queue. Footer and text sections
   go to the live queue regardless — they are the two William named, and whether an artist can
   *reach a distinctive arrangement* is a UI question no grep answers.
3. **Calibration drive.** Live-drive one representative starter end-to-end in both directions
   (see the `verify` skill). If the mechanical verdicts hold there, trust them for the rest;
   if a control exists but is unreachable in some state (spec 15's hidden-pane trap is the
   canonical case), widen the live set until the mechanical pass is trustworthy again. Then
   drive the residual queue from step 2.
4. **Automated empty harness (template → blank).** A script, not a hand pass: per starter,
   load it, clear every editable field through the store/UI, run the real in-browser staticgen
   publish (the spec 18/32 trick), and assert the output contains **no visible text at all** —
   not merely "no starter strings", which would miss text the *renderer* supplies (defaults,
   fallbacks, empty-state copy, the editor-only page-heading band from spec 27): exactly the
   `hardcoded text` class this audit hunts. Every survivor is a row: text with no editable
   field, a section that cannot be removed, a label that falls back to template copy when
   cleared, or a layout that breaks rather than collapsing. The harness lives in `scripts/`
   (or `tests/` if it fits the runner) — never `src/` — and is itself a deliverable: spec 36
   re-runs it as its round-trip acceptance test, so this labor is paid once.
5. **Renderer special-case pass.** Check `src/portfolio/` (footer rendering, `PortfolioPage`
   standalone-anchor branches, signature band, `Hero`/`TextBlock`) for anything that behaves
   differently for template-authored shapes than for artist-authored ones, or that hardcodes a
   string. Spec 32 fixed one such case and found it statically; assume more exist.

**Deliverables.** Two:
1. An audit table in `src/editor/lib/starters/SOURCES.md` (§spec 35), where specs 22 and 32
   keep theirs: one row per starter × finding, tagged with its direction (`build` / `empty`)
   and a verdict — `reproducible` / `needs a format` (a distinct arrangement to offer in the
   footer/text menu) / `needs a control` (a plain field the editor lacks) / `hardcoded text`
   (a string the artist cannot delete or replace) / `renderer special case`. Every
   non-`reproducible` row states what the artist cannot reach today and the smallest change
   that would fix it. Close with a short "build order for spec 36" section grouping the rows
   into **independently mergeable chunks** — so 36 can run as parallel worktrees if it is more
   than one session — and an honest estimate of whether 36 is one session or several.
2. The empty harness from step 4, committed and documented well enough that spec 36 can re-run
   it unmodified as its acceptance test.

**Requirements.**
- Commit the table even where rows stay uncertain — mark them `unverified` with the reason
  rather than guessing a verdict.
- Every `reproducible` row cites its evidence: the editor control that writes the path (static
  pass) or the drive that produced it. Verdicts on doubtful rows must come from driving the
  editor, and the row says so.
- Both directions are covered for all fourteen starters. The empty-direction proof is the
  harness run: a starter passes only if it was **actually emptied** — by the harness, or by
  hand with the row saying so — not because nothing looked suspicious.
- No changes under `src/` — this spec touches `SOURCES.md`, BACKLOG.md, and the new harness
  (`scripts/` or `tests/`) only, so the manifest stays untouched; `npm run check` /
  `npm test` stay green with the harness in the tree.

**Out of scope.** Any fix, any schema change, any starter JSON rewrite — all of that is spec 36.

---

## 36. Promote starter one-offs into real formats; make every starter string deletable — `queued` (blocked on spec 35)

**Do not start before spec 35 merges.** Its audit table in `src/editor/lib/starters/SOURCES.md`
(§spec 35) is this spec's work list — read it first and follow its build order — and its empty
harness is this spec's acceptance test.

**Goal.** Close every `needs a format` / `needs a control` / `hardcoded text` /
`renderer special case` row from the audit, so each of the fourteen starters is both
**buildable from** a blank document and **emptiable back to** one, using only editor UI.

**Build.**
- **Footer.** Fold every distinct footer arrangement the starters use (signature band, footer
  image + layout, multi-column, name size, the contact-sheet band — the audit has the real
  list) into `FooterEditor` as explicit named choices: a *format* picker where the arrangements
  are genuinely different shapes, plain controls where they are only field values. An artist on
  a blank doc must be able to reach each starter's footer.
- **Text.** Same treatment for text sections: any starter text section whose look comes from
  something the text menu does not offer becomes an offered option. (Type motion already
  shipped — spec 31 — so check the audit before adding anything.)
- **Hardcoded text.** Every string a starter ships becomes artist-owned: reachable in the UI,
  deletable, and gone from the rendered page once deleted. A string the renderer supplies as a
  fallback stops standing in for content — an empty heading renders empty (or its band
  collapses), it does not fall back to the template's words. Where a section is only meaningful
  with text, emptying it removes the section rather than leaving an orphan band.
- **Renderer special cases.** Delete them in favour of the general path, the way spec 32 did
  with the standalone canvas anchor.
- **Rewrite the starter JSON** so each template is expressed in editor-producible terms.
  Template studio is the tool: `/template-studio` → edit → "Save to template", and its Save bar
  reporting byte-clean is the fixed-point signal (spec 32).

**Files.** `src/editor/lib/starters/*.content.json` + `SOURCES.md`, `src/editor/components/FooterEditor.tsx`,
the text-block card in `PageEditor.tsx`, `src/editor/lib/doc-schema.ts` (only if a format needs a
new optional field — optional-with-default, no version bump, per spec 1), `src/portfolio/` (only
to remove a special case), `tests/`.

**Requirements.**
- **No template may change appearance.** This is a representation change, not a redesign: every
  starter is byte-verified through template studio after the rewrite. The strong form of the
  appearance check: where a rewrite is purely representational, diff the staticgen output
  before vs after — byte-identical published HTML is the proof, and eyeballing is reserved for
  the starters where the output legitimately differs (say which, and why).
- New footer/text formats are named in plain language per DESIGN.md (sentence case, no jargon);
  where it aids discovery, the help tip names the starter the format came from.
- **Round-trip proof, per starter: re-run spec 35's empty harness** — it already applies each
  starter, strips it through the store/UI, publishes via real in-browser staticgen (samples are
  stripped at publish, which is exactly where spec 32's fallback bug surfaced), and asserts no
  visible text survives. All fourteen must pass it. Extend the harness where a fix changes what
  "empty" looks like; do not rebuild the proof by hand. Anything the harness cannot exercise
  (a new format picker's UI reachability, choreography taste) is checked by hand, and the spec
  report says plainly which starters got hand checks.
- Any schema addition is optional with a default so existing artist drafts parse unchanged;
  migration test beside the existing ones.
- The audit table is updated in place as rows are closed — each row ends at `done` or a stated
  reason for deferral.
- `npm run check` + `npm test` pass; `npm run runtime:generate` re-run and committed if hashed
  files were touched.

**Out of scope.** New template designs, new block kinds beyond what an audited row demands,
batch 3 of the template catalog (deferred by William — spec 22 — and sequenced after this spec:
§14's batch-3 requirements gate it on the format vocabulary and empty harness built here),
redesigning the footer's visual language.
