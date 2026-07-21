---
name: verify
description: Build, run, drive, and release this portfolio-builder app. Use for end-to-end verification, production readiness, runtime version releases, immutable runtime tags, or publishing a new editor/runtime version.
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
- Publishing: do NOT drive live GitHub publish; `scripts/gh-publish-dryrun.mts` exists.

## Releasing an editor/runtime version

Only create and push a release tag when the user explicitly asks to release or publish. A
request to explain, inspect, or verify a release does not authorize a GitHub push.

1. Choose the next semantic version and update `version` in
   `.hangwork/runtime-release.json`. Never reuse an existing version. Fetch tags and stop if
   the proposed tag already exists locally or remotely:

   ```bash
   runtime_version="1.0.1"
   release_tag="runtime-v${runtime_version}"
   git fetch origin --tags
   git tag --list "$release_tag"
   git ls-remote --tags origin "refs/tags/$release_tag"
   ```

2. Generate the runtime hashes and verify the complete release sequentially because both
   builds write `dist`:

   ```bash
   npm run runtime:generate
   npm run runtime:check
   npm test
   npm run check
   npm run build:product
   HANGWORK_IS_PRODUCT_SITE=false npm run build
   git diff --check
   ```

3. Review and commit the source changes and generated `.hangwork` manifests together. Do
   not stage unrelated files or secrets. Fetch `origin/main` and reconcile any remote commits
   before tagging; rerun verification if reconciliation changes the release commit.

4. Tag the final commit explicitly, verify the tag resolves to it, and push `main` and the tag
   atomically:

   ```bash
   release_commit="$(git rev-parse HEAD)"
   git tag -a "$release_tag" "$release_commit" -m "Hangwork runtime v${runtime_version}"
   test "$(git rev-list -n 1 "$release_tag")" = "$release_commit"
   git push --atomic origin main "$release_tag"
   ```

5. Verify that remote `main` and the dereferenced annotated tag resolve to the same commit:

   ```bash
   git ls-remote origin refs/heads/main "refs/tags/${release_tag}^{}"
   ```

Keep the GitHub tag ruleset for `runtime-v*` active with **Restrict updates**, **Restrict
deletions**, and **Block force pushes** enabled. Keep **Restrict creations** disabled so new
versions can be created. Never force-update or delete a published runtime tag; issue the next
patch version instead. Cloudflare Pages supplies `CF_PAGES_COMMIT_SHA`; on another production
host, set `HANGWORK_RUNTIME_COMMIT` to the tag's full 40-character commit SHA.
