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

## 4. og:image + twitter card on remaining product pages — `queued`

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

## 8. Workbench Finder-parity — `queued`

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

## 9. Guided crop & light demo in the workbench — `queued`

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

## 10. Series folders → one-time page build on workbench exit — `built` (branch worktree-spec-10-series-build, awaiting review/merge)

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

## 11. Discipline template picker + auto-placement — `built` (branch worktree-spec-11-template-picker, awaiting review/merge)

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

## 12. Motion primitives + template motion vocabulary — `queued`

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

## 13. Per-element motion tools — `queued` (after 12; independent of catalog)

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

## 14. Template catalog production — the 42 → ~15 starters — `in progress` (batch 1 `built` on branch worktree-spec-14-batch-1: conservatory/masthead/atelier/contact-sheet/runway + NGA sample catalog; batches 2–3 queued)

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
- Every batch merges through the standard gate; starter JSON is deliberately unhashed —
  no runtime manifest churn expected from content-only batches.
- SOURCES.md stays the ledger: status, font substitutions, which Hangwork template id
  each keeper became.

**Out of scope.** New renderer/editor capability (if a design needs one, flag it as a new
spec instead of hacking it into content), pixel-perfect cloning, copying any asset,
carousels/sliders.

---

## 15. Editor panel polish: squished controls + hover help tips — `queued`

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
