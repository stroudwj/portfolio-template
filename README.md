# Hangwork

A **hosted portfolio builder for visual artists**. Build your site in the browser at
**[hangwork.art/editor](https://hangwork.art/editor/)**, preview it fully, and publish when
it's ready. One payment, no subscription — your published site lives in a free **Hangwork
account you own**, at `yourname.hangwork.art` (or your own domain), and you can download the
whole thing as plain files anytime. Nothing to install; you only pay when you publish.

## This repository

One Astro + React codebase that is the entire product:

- **Marketing site** — `src/pages/`, `src/components/Landing.astro` (hangwork.art).
- **Visual editor** — `src/editor/` (the browser site builder at `/editor`).
- **Portfolio renderer** — `src/portfolio/` (how the editor preview and every published site draw).
- **Server** — two Cloudflare Workers: `oauth-proxy/` (accounts + publish API) and
  `site-server/` (serves published sites).

Publishing is hosted: the editor signs you into a Hangwork account and uploads your built site
to Cloudflare. (Earlier versions published to GitHub Pages; that path is retired.)

## Run it locally

```sh
npm install
npm run dev
```

Open **http://localhost:4321/portfolio-template** (editor at `/portfolio-template/editor`).
The site rebuilds as you save; stop with **Ctrl + C**.

## Docs

- **[CLAUDE.md](CLAUDE.md)** — architecture, the publishing flow, and the runtime-release
  process. Start here to work on the code.
- **[DESIGN.md](DESIGN.md)** — the design system (color, type, voice). Every UI change follows it.
- **[oauth-proxy/README.md](oauth-proxy/README.md)** — the account/publish API Worker + hosting setup.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the site locally for editing |
| `npm run build:product` | Build the production site (hangwork.art) |
| `npm run build` | Build the portfolio runtime/template |
| `npm run check` | Type-check Astro, React, scripts, and tests |
| `npm test` | Run migration, integrity, and publish-preflight tests |
| `npm run runtime:generate` | Regenerate the runtime integrity manifest |

Built with [Astro](https://astro.build) and [React](https://react.dev). Hosted on Cloudflare.
