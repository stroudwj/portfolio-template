# Portfolio Website Template

A clean, minimal portfolio website for showing off your work — art, photography, or any images. You add your pictures by dropping files into folders, change a few lines of text, and publish it online **for free**. No design or coding experience needed.

It comes with four pages: **Home** (selected works), **Art**, **Photography**, and **About**. Click any image to view it full-screen. It looks good on phones and computers.

> Every image you see right now is a gray "Replace this image" placeholder. Swapping in your own photos is the first thing you'll do.

---

## Part 1 — See it on your own computer

You only need to do the setup (steps 1–2) once.

### 1. Install Node.js

Node.js is the free program that runs this website on your computer.

1. Go to **https://nodejs.org** and download the version labeled **LTS**.
2. Open the downloaded file and click through the installer (the defaults are fine).

### 2. Open a terminal in this project folder

The "terminal" is a window where you type commands.

- **Mac:** open the **Terminal** app. Type `cd ` (with a space), then drag this project folder onto the window and press **Enter**.
- **Windows:** open this folder in File Explorer, click the address bar, type `cmd`, and press **Enter**.

### 3. Start the website

Type these two commands, pressing **Enter** after each. The first one downloads what the site needs (only required the first time); the second starts the site.

```sh
npm install
npm run dev
```

When it says it's ready, open **http://localhost:4321/portfolio-template** in your web browser. You'll see the site with placeholder images.

Leave that terminal window open while you work — the site updates automatically every time you save a change. To stop it, click the terminal and press **Ctrl + C**. To start it again later, just run `npm run dev`.

---

## Part 2 — Make it yours

You can build your portfolio two ways: with the **visual editor** (no code), or by
editing the content file directly.

### Option A — the visual editor (no code) ⭐

With the site running (`npm run dev`), open **http://localhost:4321/portfolio-template/editor**.
It's a website-builder-style screen with a live preview:

1. Choose **Edit current portfolio** (or **Start from blank**).
2. Fill in your name, bio, and email; **upload** a profile photo, project images, and
   gallery images; drag to **reorder**; add **social links**. The preview updates as you type.
3. **Publish it.** The easiest way is **Connect GitHub → Publish website** — it puts your
   site online in one step (see [Part 3](#part-3--publish-it-online-for-free)). Prefer to
   do it by hand? Click **Export ZIP** and unzip the download over this project folder (it
   drops your `content.json` and images into the right places), then run `npm run build`.

Your work autosaves in the browser, so you can close the tab and come back later. The
editor is a local tool; it isn't part of your published site (delete `src/pages/editor.astro`
if you want to remove it entirely).

### Option B — edit the content file by hand

You edit the site by opening its files in a text editor. **[VS Code](https://code.visualstudio.com)** is a free, friendly one. Save a file and your browser updates instantly.

### Add your own images ⭐ (the main thing)

Each gallery page reads from its own folder inside `src/assets/`. **Any image you put in the folder shows up on that page automatically** — no code required.

| Page          | Put images in this folder        |
| ------------- | -------------------------------- |
| Home          | `src/assets/selected-works/`     |
| Art           | `src/assets/art/`                |
| Photography   | `src/assets/photography/`        |

To do it:

1. Open the folder for the page you want.
2. **Delete** the `placeholder.png` file that's in there.
3. **Copy your own images** into the folder.
4. Save — the page updates on its own.

Accepted image types: **.jpg, .jpeg, .png, .gif, .webp**. Tip: name files so they sort the way you want them to appear (e.g. `01.jpg`, `02.jpg`, `03.jpg`).

If you empty a folder completely, the page simply shows a friendly "add images here" note until you add some.

### Edit your text and links — all in one file

Everything the site *says* — your name, the About text, your email, the menu,
social links, résumé, and colors — lives in a single file:
**`src/data/content.json`**. Open it in your text editor, change the values inside
the quotes, and save. The browser updates instantly, and you never have to touch
the page or component files.

Here's what each part controls:

- **`site`** — your `name` (shown as the logo and used in every browser-tab title),
  the `description` used for search/social previews, and the `favicon` file name.
  Change your `name` in this one spot and it updates everywhere. (Optional: add a
  `logo` here to show different text as the logo than your name.)
- **`theme`** — the site's colors and font. Change `backgroundColor`, `textColor`,
  or `fontFamily` to restyle the whole site at once.
- **`nav`** — the menu. Each entry has a `label` (what visitors see) and a `path`
  (the page's file name in `src/pages/`, or `""` for Home). Rename by changing a
  `label`; reorder by moving lines.
- **`profile`** — your `image` (a file in `src/assets/`, shown on the About page)
  and your `bio` (the About text; `\n` is a line break, `\n\n` is a blank line).
- **`contact`** — your `email`, shown on the About page.
- **`social`** — a list of links (each with a `label` and `url`) shown on the About
  page. Add or remove entries freely, or leave it empty (`[]`) to hide the row.
- **`resume`** — a `label` and `url` for a résumé link on the About page. Put a PDF
  at `public/resume.pdf` and set `url` to `"resume.pdf"`, or set `url` to `""` to
  hide the link.
- **`pages`** — per-page settings: the browser-tab `title` (write `{name}` and it's
  filled in from `site.name`), the Home `heading`, and each gallery's source
  `folder`, image `alt` text, and `order` (`"asc"` or `"desc"`).
- **`galleries`** — optional captions for gallery images. Under a folder's `items`,
  add an entry keyed by the image's file name with a `title`, `description`, and/or
  `link`; it appears in the full-screen view when that image is clicked. Images
  without an entry simply have no caption.

### Change the favicon (the little icon in the browser tab)

Replace **`public/favicon.svg`** with your own icon and keep the same file name (or
point `site.favicon` in `content.json` at a different file).

### Add a page

1. Copy `src/pages/art.astro` to a new name, e.g. `src/pages/paintings.astro`.
2. In `content.json`, add a matching entry under `pages` (a `title` plus a
   `gallery` pointing at a new folder), a `nav` entry whose `path` is the new file's
   name without `.astro`, and — if you want captions — a `galleries` entry for the
   folder.
3. Create the folder `src/assets/paintings/` and drop your images in.

---

## Part 3 — Publish it online for free

Your site is hosted on **GitHub Pages** — free, and it re-deploys itself every time you
publish. There are two ways to publish: one click from the editor, or by hand.

### Option A — Publish from the editor (one click) ⭐

In the editor (`/editor`), use the **Connect GitHub** and **Publish website** buttons in
the top-right. You never touch Git, the terminal, or GitHub's website beyond one sign-in.

**1. Connect GitHub (once).** Click **Connect GitHub**. It walks you through creating a
*personal access token* — a private key GitHub gives you:

- Click the link to open GitHub's token page (sign in / create a free account if needed).
- Set **Repository access** to **All repositories** *(required so the editor can create
  your site the first time)*.
- Under **Repository permissions**, set these three to **Read and write**:
  **Administration** (create your site's repository), **Contents** (upload your text and
  images), and **Pages** (turn the website on).
- Click **Generate token**, copy it, and paste it back into the editor.

**2. Publish.** Click **Publish website**, pick a name for your site the first time
(this becomes part of the address), and watch the progress. When it finishes you get a
live link like `https://YOUR-USERNAME.github.io/YOUR-SITE-NAME`. A brand-new site takes a
minute to build — refresh if it isn't up yet.

**3. Edit and publish again.** Change anything and click **Publish website** again — it
**updates the same site** (new images added, deleted ones removed). No new repository is
created.

> **About your token (please read).** The token is stored only in your own browser and is
> sent nowhere except GitHub; **Sign out** deletes it. Because a fresh site can't be
> created by a token limited to one repository, the first token needs access to *all*
> repositories. **Once your site exists**, you can make it safer: create a new
> fine-grained token scoped to **only your portfolio repository** with just **Contents**
> and **Pages** = Read and write, then Sign out and reconnect with it. Future publishes
> only need those two.

### Option B — Publish by hand

Prefer to set it up yourself (or not use a token)?

1. **Create a free GitHub account** at https://github.com if you don't have one.
2. **Create a new repository** (a home for your project's files) on GitHub. Note your username and the repository name.
3. **Tell the site its web address.** Open **`astro.config.mjs`** and change these two lines to match your GitHub username and repository name:

   ```js
   site: 'https://YOUR-USERNAME.github.io',
   base: '/YOUR-REPO-NAME',
   ```

4. **Upload this project** to that repository (in GitHub's terms, "push" it).
5. **Turn on Pages:** in your repository on GitHub, go to **Settings → Pages**, and under **Build and deployment → Source**, choose **GitHub Actions**.

That's it. A minute or two after each upload, your site is live at:

```
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME
```

(The automatic deploy is already set up for you in `.github/workflows/deploy.yml` — you don't need to touch it. The one-click publisher in Option A does exactly these steps for you.)

> **Using your own domain name?** In `astro.config.mjs`, set `site` to your domain and delete the `base` line, then set up the domain under **Settings → Pages** on GitHub.

---

## Troubleshooting

- **My image doesn't show up.** Check it's in the correct folder and its type is one of `.jpg .jpeg .png .gif .webp`. If the site is running, save any file to refresh.
- **The page is blank / says "no images yet."** That folder is empty — add at least one image.
- **Links or images are broken on the live site.** Double-check `base` in `astro.config.mjs` exactly matches your repository name (with a leading slash, e.g. `/my-portfolio`).
- **I want to start the site again.** Run `npm run dev` in the terminal from this folder.

## Commands reference

| Command           | What it does                                         |
| ----------------- | ---------------------------------------------------- |
| `npm install`     | Downloads what the site needs (run once, first time) |
| `npm run dev`     | Runs the site on your computer for editing           |
| `npm run build`   | Builds the final site into the `dist/` folder        |
| `npm run preview` | Previews that finished build before publishing       |

Built with [Astro](https://astro.build).
