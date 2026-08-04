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
