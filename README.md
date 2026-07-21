# Portfolio Website Template

A clean, minimal portfolio website for showing off your work — art, photography, or any
images. Build it in your browser with a visual editor, then publish it to **your own** free
website on GitHub. **No design or coding experience needed**, and no subscription — you own
the site and its code forever.

It comes with four pages: **Home** (selected works), **Art**, **Photography**, and **About**.
Click any image to view it full-screen. It looks good on phones and computers.

---

## Part 1 — Build & publish from your browser (no install) ⭐

This is the whole thing, and it happens in one browser tab.

**1. Open the editor.** Go to
**https://hangwork.art/editor/**. You'll see a website-builder-style
screen with a live preview.

**2. Start building.** Click **Start building** (or **Start from blank**). Fill in your name,
bio, and email; **upload** a profile photo, project images, and gallery images; drag to
**reorder**; add **social links**. The preview updates as you type. Your work autosaves in
your browser, so you can close the tab and come back.

**3. Authorize GitHub (one click).** When you're ready to go live, click **Publish website**
→ **Connect GitHub** → **Authorize with GitHub**. You'll approve on GitHub and come right
back — no tokens to create, no terminal. (Publishing is on **your** GitHub account, so the
site and its code are yours.)

> Prefer not to use one-click sign-in? The Connect dialog has an **advanced** option to paste
> a personal access token instead — see [Part 4](#part-4--publish-by-hand-advanced).

**4. Publish.** Click **Publish website**, pick a name for your site the first time (it becomes
part of the address), and watch the progress. You get a live link like
`https://YOUR-USERNAME.github.io/YOUR-SITE-NAME`. A brand-new site takes a minute to build —
refresh if it isn't up yet.

**5. Edit anytime, from any device.** Open the editor, **Connect GitHub**, then choose **Edit
my published site** — it pulls your live text and images back in so you can change them and
**Publish** again. It updates the same site (new images added, deleted ones removed); no new
repository is created. It finds your site automatically once you're signed in.

---

## Part 2 — What each thing controls (reference)

You can edit everything in the visual editor. If you'd rather edit files directly (see
[Part 3](#part-3--run-it-on-your-computer-advanced)), here's where things live.

### Your images

Each gallery page reads from its own folder inside `src/assets/`. **Any image you put in the
folder shows up on that page automatically.**

| Page          | Folder                        |
| ------------- | ----------------------------- |
| Home          | `src/assets/selected-works/`  |
| Art           | `src/assets/art/`             |
| Photography   | `src/assets/photography/`     |

Accepted types: **.jpg, .jpeg, .png, .gif, .webp**. Tip: name files so they sort the way you
want them to appear (e.g. `01.jpg`, `02.jpg`). An empty folder just shows a friendly
"add images here" note.

### Your text, links, and colors — one file

Everything the site *says* lives in **`src/data/content.json`**:

- **`schemaVersion`** — the content-format version. Leave this in place; the editor uses it to migrate older sites safely.
- **`site`** — your `name` (the logo and every browser-tab title), the `description` for
  search/social previews, the `favicon` file name, and an optional `logo`.
- **`theme`** — colors and font (`backgroundColor`, `textColor`, `accentColor`, `fontFamily`).
- **`nav`** — the menu: each entry has a `label` and a `path` (a page file name, or `""` for Home).
- **`profile`** — your `image` (a file in `src/assets/`) and `bio` (`\n` = line break).
- **`contact`** — your `email`.
- **`social`** — a list of `{ label, url }` links; leave empty (`[]`) to hide the row.
- **`resume`** — a `label` and `url`; put a PDF at `public/resume.pdf` and set `url` to
  `"resume.pdf"`, or `""` to hide it.
- **`pages`** — per-page `title` (`{name}` is filled from `site.name`), the Home `heading`,
  and each gallery's `folder`, `alt` text, and `order` (`"asc"`/`"desc"`).
- **`galleries`** — optional captions: under a folder's `items`, key an entry by the image's
  file name with a `title`, `description`, and/or `link`.

### Change the favicon
Replace the icon files in **`public/`**: `favicon.svg`, `favicon.ico`, `favicon-16.png`,
`favicon-32.png`, and `apple-touch-icon.png`. You can still point `site.favicon` at a
different SVG file; the ICO, PNG, and Apple icons remain the compatibility fallbacks.

### Add a page
1. Copy `src/pages/art.astro` to e.g. `src/pages/paintings.astro`.
2. In `content.json`, add a `pages` entry (a `title` + a `gallery` folder), a `nav` entry
   whose `path` is the new file name without `.astro`, and optional `galleries` captions.
3. Create `src/assets/paintings/` and drop your images in.

---

## Part 3 — Run it on your computer (advanced)

You don't need this to build or publish — Part 1 covers that. But you can run the site
locally to edit files directly or preview offline.

### 1. Install Node.js
Download the **LTS** version from **https://nodejs.org** and run the installer.

### 2. Open a terminal in this project folder
- **Mac:** open **Terminal**, type `cd ` (with a space), drag this folder onto the window, Enter.
- **Windows:** open this folder in File Explorer, click the address bar, type `cmd`, Enter.

### 3. Start it
```sh
npm install
npm run dev
```
Open **http://localhost:4321/portfolio-template**. The local editor is at
**/portfolio-template/editor** (on `localhost`, use the token option to connect GitHub — the
one-click sign-in only returns to the hosted editor). Leave the terminal open; the site
updates as you save. Stop with **Ctrl + C**.

---

## Part 4 — Publish by hand (advanced)

Prefer to set it up yourself, or connect with a token instead of one-click sign-in?

**With a token (in the editor):** in the Connect dialog, open **advanced** and create a
fine-grained token — set **Repository access** to **All repositories** (needed to create your
site the first time), and set **Administration**, **Contents**, and **Pages** to **Read and
write**. Paste it in. Your token is stored only in your browser and sent nowhere except
GitHub; **Sign out** deletes it.

**Fully by hand (no editor):**
1. Create a free account at https://github.com and a new repository.
2. In **`.hangwork/project.json`**, set `siteUrl` to `https://YOUR-USERNAME.github.io`,
   `basePath` to `/YOUR-REPO-NAME`, and `isProductSite` to `false`.
3. Push this project to that repository.
4. In the repo, **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.

Live a minute later at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME`. The deploy is already
set up in `.github/workflows/deploy.yml`.

> **Custom domain?** Set `site` to your domain and delete the `base` line, then configure the
> domain under **Settings → Pages**.

---

## Setting up your own copy (for whoever runs the template)

If you're **distributing** this template (not just using it), a couple of one-time steps turn
on the one-click sign-in and the license gate. Everything works without them — the editor
falls back to the token flow and leaves publishing ungated — so you can do these whenever.

- **One-click "Authorize with GitHub":** register a GitHub OAuth App and deploy the tiny
  token-exchange Worker, then fill in `src/editor/lib/oauth/config.ts`. Full steps in
  [`oauth-proxy/README.md`](oauth-proxy/README.md).
- **License gate (optional):** to require a purchased key before publishing, set your Lemon
  Squeezy store/product IDs and checkout URL in `src/editor/lib/license/config.ts`.
- **Template source:** publishing clones the repo named in `src/editor/lib/github/config.ts`
  (`TEMPLATE_REPO`), which must be flagged a **Template repository** in its GitHub settings.

### Releasing compatible editor/runtime updates

Published sites keep their current renderer until their owner publishes again. A publish
then migrates content and installs the renderer from the exact commit that built the editor;
it never follows a moving branch. User content/assets are separate from system files, and a
manually changed system file stops the upgrade until the owner explicitly approves replacing it.

For every release:

1. Add sequential content/draft migrations and permanent fixtures for every schema change.
2. Bump `version` in `.hangwork/runtime-release.json`, then run `npm run runtime:generate`.
3. Run `npm test`, `npm run check`, `npm run build`, and `npm run build:product`.
4. Commit the code and generated manifests together, and create an immutable tag such as
   `runtime-v1.1.0`. Keep the previous tagged deployment available for rollback.
5. Cloudflare Pages supplies `CF_PAGES_COMMIT_SHA` automatically. On another host, set
   `HANGWORK_RUNTIME_COMMIT` to the release's full 40-character commit SHA when building.

`npm run build` fails if the runtime hashes are stale, preventing an editor deployment whose
manifest does not match its source. Before promoting production, publish an older fixture to a
canary repository and verify the GitHub Pages workflow for the resulting commit.

---

## Troubleshooting

- **My image doesn't show up.** Check the folder and that its type is `.jpg .jpeg .png .gif .webp`.
- **The page is blank / "no images yet."** That folder is empty — add at least one image.
- **Links/images broken on the live site.** Check `base` in `astro.config.mjs` matches your
  repository name (leading slash, e.g. `/my-portfolio`).
- **One-click sign-in didn't work.** Use the **advanced → token** option in the Connect dialog.

## Commands reference

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm install`     | Downloads what the site needs (first time only)       |
| `npm run dev`     | Runs the site on your computer for editing            |
| `npm run build`   | Builds the final site into `dist/`                    |
| `npm run check`   | Type-checks Astro, React, scripts, and tests           |
| `npm test`        | Runs migration, integrity, and publish-preflight tests |
| `npm run runtime:generate` | Regenerates the system-file integrity manifest |
| `npm run preview` | Previews the finished build                           |

Built with [Astro](https://astro.build).
