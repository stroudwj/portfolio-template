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

## 13. Per-element motion tools — `review` (built 2026-08-09 on `worktree-spec-13-motion-tools`, unmerged; William's review found gaps → spec 24 continues on the same branch)

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

## 14. Template catalog production — the 42 → ~15 starters — `running` (batch 1 merged + revision pass built, batch 2 built 2026-08-09 on worktree-spec-14-revision-batch-2 awaiting merge: revision rebuilds the five to the signature-device bar with full placement/scroll depth/edge bleed; batch 2 adds promenade/still-room/signal/clearing/marmalade; batch 3 remains: Reseda, Ortiz, Mycelium, Beaumont, Cami, Hawley, Minetta, Tepito, Zion)

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

## 16. Beta PT 2: editor chrome & panel fixes — `queued`

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

## 17. Beta PT 2: renderer bugs, styling options, more mounts — `queued`

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

## 18. Beta PT 2: smart grid + batch image workflow — `queued`

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

## 22. Conservatory fidelity sprint — one template to indistinguishable — `built` (steps 1+2+2b+3 done 2026-08-09 on worktree-spec-22-conservatory-fidelity; awaiting William's side-by-side sign-off, then merge — spec 14 batch 3 unblocks after)

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

## 23. Starter webfonts — self-hosted, OFL-only, subset — `queued` (decide after spec 22 sign-off)

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

## 24. Motion tools revision — cascade, preview fidelity, discoverability — `queued` (continues spec 13's branch)

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
