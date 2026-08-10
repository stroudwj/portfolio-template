# Beta feedback "Hangwork PT 2" — 2026-08-06

Screenshots extracted from the beta tester's PDF (stream-of-consciousness notes, second
round). Each image is referenced from BACKLOG.md specs 16–18. Filenames describe the
complaint/request the shot illustrates. Images contain the tester's own artwork — do not
reuse outside these specs.

| Screenshot | What it shows | Spec |
|---|---|---|
| `ellipsis-menus-stack.png` | Multiple per-image "…" popovers stuck open at once | 16 |
| `copy-to-menu.png` | The Copy to… dropdown (workbench + every group) — wants feedback + a one-click workbench action | 16 |
| `click-image-scroll.png` | Works panel + grid: clicking a canvas image scrolls to the block top, not the clicked image | 16 |
| `earlier-delete-misclick.png` | "↑ Earlier / ↓ Later / Delete image" menu — spamming Earlier lands clicks on Delete | 16 |
| `collapse-button-toolbar.png` | Preview toolbar `<` button (collapses editor) that reads as browser back | 16 |
| `product-blank-space-sidebar-open.png` | Shop page with sidebar open: huge blank space between segments (product block suspected) | 16 |
| `preview-expand-blank-bug.png` | Expanded preview after sidebar was open: page renders as one giant blank texture | 16 |
| `preview-expand-expected.png` | Same page expanded after hiding the sidebar first — correct render | 16 |
| `preview-published-unclear.png` | Follow-up shot: tester unsure which view reflects the published site | 16 |
| `add-section-bottom.png` | Bottom of panel above "Mobile & advanced" — wants an "add section" button here too | 16 |
| `pull-bar-add-section.png` | White pull bar morphing into "+ Add section" on touch — felt unintuitive | 16 |
| `crop-lightbox-sliders.png` | Crop & light lightbox — slider-only, wants numeric input | 16 |
| `thumbnail-card-picker.png` | Card thumbnail picker — wants workbench source + crop | 16 |
| `compact-details-toggle.png` | Compact/Details toggle — unreachable when scrolled away | 16 |
| `details-from-ellipsis.png` | Per-image "…" menu — wants "open Details mode" from here | 16 |
| `whole-page-bg-not-applied.png` | Whole page = white (#ffffff) but signature + footer area still textured | 17 |
| `empty-page-placeholder.png` | "This page is empty…" placeholder over a page that has content | 17 |
| `footer-image-cutoff.png` | Freeform footer image (dragonfly) clipped; resize doesn't help | 17 |
| `freeform-caption-scrollbar.png` | Freeform image with bottom caption showing a stray scrollbar | 17 |
| `freeform-caption-expected.png` | Same image rendering correctly (no scrollbar) | 17 |
| `link-underline.png` | Commission links — wants underline removal as an option | 17 |
| `segment-divider.png` | Section divider drag UI — divider color only affects line & ornament; wants fade/dither between colored segments | 17 |
| `mount-dropdown-current.png` | Current Mount options (none/tape/nail/hook/frame) — baseline for new mounts | 17 |

Parked (not specced — need tester follow-up):
- "maybe graying out what doesn't work?" (p7 top) — referent unknown.
- "grid overrides freeform rules silently" (p6) — not reproducible for tilt/hover on our
  side; may be the same bug as the hover-Still leak (spec 17). Revisit after 17 lands.
- Visitor guest-book / live notes page (p7) — real feature idea, deliberately not queued.
