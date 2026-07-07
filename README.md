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

### Change your name / the logo

The name shown at the top of the site lives in one place: open **`src/layouts/Layout.astro`** and edit this line near the top:

```js
const SITE_NAME = 'Your Name';
```

### Change the page titles (the browser tab text)

Each page file in `src/pages/` has a line like `title="Art — Your Name"`. Change the text inside the quotes.

### Change the About page

Open **`src/pages/bio.astro`** and edit the text between the `<p class="bio-text">` tags — your name, city, and email.

### Change the menu (add, remove, or rename pages)

Open **`src/components/Navigation.astro`**. Near the top is the menu list:

```js
const navItems = [
	{ path: '', label: 'Home' },
	{ path: 'art', label: 'Art' },
	{ path: 'photography', label: 'Photography' },
	{ path: 'bio', label: 'About' },
];
```

- **Rename** a menu item: change its `label`.
- **Remove** a page: delete its line here, and delete the matching file in `src/pages/`.
- **Add** a page: copy `src/pages/art.astro` to a new name (e.g. `src/pages/paintings.astro`), point it at a new folder, then add a line here where `path` is the new file's name without `.astro`.

### Change the favicon (the little icon in the browser tab)

Replace **`public/favicon.svg`** with your own icon (keep the same file name).

---

## Part 3 — Publish it online for free (GitHub Pages)

This template can deploy itself automatically using **GitHub Pages**. Every time you upload changes, your live site updates.

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

(The automatic deploy is already set up for you in `.github/workflows/deploy.yml` — you don't need to touch it.)

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
