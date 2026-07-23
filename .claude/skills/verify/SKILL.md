---
name: verify
description: How to build, run and drive this portfolio-builder app to verify changes end-to-end.
---

# Verifying changes in this repo

## Build / launch
- `npm run build` — static Astro build (catches SSR/type issues in .astro + islands).
- `npm run dev` — dev server. Port 4321 is often taken by the user's own session; Astro
  auto-bumps to 4322. The base path is `/portfolio-template`, so the editor is at
  `http://localhost:4322/portfolio-template/editor`.

## Driving the editor (the main surface)
Playwright 1.61 lives in the npx cache, not node_modules. ESM-import it by absolute path:
`import { chromium } from '/Users/williamstroud/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'`
(if that hash is gone, find it with `for d in ~/.npm/_npx/*/node_modules/playwright; do ls $d; done`).
Chromium browsers are already installed in `~/Library/Caches/ms-playwright`.

Flow gotchas that cost time:
- Start screen: fresh browser context → click `.start-actions .btn-secondary` ("start blank").
- Image upload: each ImageDrop has a hidden `input[type=file][accept="image/*"]` —
  `setInputFiles` with in-memory `{name, mimeType, buffer}` PNGs works; scope the locator
  to `[data-section="<pageKey>"]` because there are many drop zones.
- "Add sub-page" uses `window.prompt` → register a `page.on('dialog')` handler BEFORE clicking.
- React range sliders don't respond to `fill`; set value via the native setter and dispatch
  `input` (see the prototype-setter trick).
- The phone preview is a real iframe (`.device-frame`) — use `frameLocator` and wait for
  its content; site CSS/media queries apply inside it at 390px width.
- The demo/bundled content uses the legacy masonry gallery; freeform canvas behavior
  (z-order, grid overlay) only appears after uploading images in the editor.

## What's worth driving per area
- Canvas: upload 2–3 solid-color PNGs, drag one onto another, check paint order + computed
  z-index; grid overlay chips live in the preview toolbar.
- Publishing: don't drive a live publish against production. The live flow is Hangwork
  accounts (sign in → license → `staticgen` upload to the API Worker), not GitHub;
  `scripts/gh-publish-dryrun.mts` is the offline dry-run.
