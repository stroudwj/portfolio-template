# CLAUDE.md — Hangwork

Hangwork is a **hosted portfolio builder for visual artists**. One payment (Polar),
no subscription; a published site lives in a free **Hangwork account** the artist owns, at
`[name].hangwork.art` or their own domain. The product is **hangwork.art**. This repo is the
whole thing: the marketing site, the visual editor, the portfolio renderer, and the two
Cloudflare Workers that run accounts + hosting.

UI/brand rules live in **[DESIGN.md](DESIGN.md)**. End-to-end verification + the runtime
release/tag process live in the **`verify` skill** (`.agents/skills/verify/SKILL.md`). This
file is the architecture + publishing map.

## The two builds

One Astro codebase, two outputs, switched by `PUBLIC_HANGWORK_IS_PRODUCT_SITE` (read via
[src/lib/productSite.ts](src/lib/productSite.ts) → `IS_PRODUCT_SITE`):

- `npm run build:product` (`astro.config.product.mjs`, flag = `true`) → **hangwork.art**:
  landing, `/editor`, `/learn/*`, `/faq`, `/guide`, `/examples`, legal pages. Production
  deploys this.
- `npm run build` (`astro.config.mjs`, flag from `.hangwork/project.json`) → the **portfolio
  runtime/template** a published user site is built from. Product-only pages emit no routes
  when the flag is off.

`npm run dev` serves under base `/portfolio-template`; the editor is at `/portfolio-template/editor`.

## Layout (what matters)

- `src/pages/` — product-site pages (Astro). `learn/[slug].astro` + `src/lib/seoArticles.ts`
  = SEO articles; `faq/`, `guide/`, `terms/`, `privacy/` are product-only rest routes.
- `src/components/Landing.astro` — the hangwork.art sales page.
- `src/portfolio/` — the **renderer** shared by the editor preview and every published site
  (PortfolioPage, Products/Shop, Embed, lightbox). Editing this changes how published sites look.
- `src/editor/` — the **React visual builder** (SPA at `/editor`). State: `store.tsx`. Doc
  schema: `lib/doc-schema.ts`. Static-site generation: `lib/staticgen/`. Publish/account UI:
  `components/Publish*.tsx`, `components/*Modal.tsx`, `components/useAccount.ts`.
- `src/editor/lib/account/` — the **accounts + publishing client** (the current path):
  sign-in session, publish, site store, license binding.
- `oauth-proxy/worker.js` — the **API Worker**: accounts, publish, export, site status,
  custom domains, Polar checkout/webhook. Setup in [oauth-proxy/README.md](oauth-proxy/README.md).
- `site-server/worker.js` — the **serving Worker**: serves every published site from R2 via a
  KV `host → {siteId,status}` lookup; enforces visibility + a per-site request ceiling.
- `scripts/` — `generate-runtime-release.mjs` (integrity manifest), `build-hydration-runtime.mjs`,
  `gh-publish-dryrun.mts`.
- `.hangwork/` — `runtime-release.json` + `project.json`: the runtime integrity manifest
  (below). Generated; commit alongside source.
- `src/lib/pricing.ts` — single source of the $99 lifetime price (`currentPriceText`).
  Never hardcode a price in a component.

## How publishing works (current — Cloudflare accounts, NOT GitHub)

In the editor's 🚀 Publish tab ([PublishPanel.tsx](src/editor/components/PublishPanel.tsx)):

1. **Sign in** to a Hangwork account — magic-link email or Google, no passwords
   ([account/config.ts](src/editor/lib/account/config.ts), `SignInModal`).
2. **License** — pay-once gate (Polar). Built and unlocked can happen in either
   order; built-but-unpaid hits the gate, paid-but-empty just waits for content.
3. **Publish** — `staticgen/` builds the static site in the browser and uploads it to the API
   Worker (`/publish`, `/upload`) straight into **R2** under the site's stable id; KV is
   updated so the serving Worker can route it.
4. Live at **`[name].hangwork.art`** (naming helper: [github/subdomain.ts](src/editor/lib/github/subdomain.ts),
   `SITES_ROOT_DOMAIN`). Custom domains via Cloudflare-for-SaaS (`CustomDomainModal`).
5. **Own it forever** — "Download my site (zip)" hits `/site/export`; the Worker zips the
   served files, portable to any host. Visibility (live / under construction / offline) and
   delete are D1 rows mirrored to KV — the row is the kill switch.

Two Cloudflare Workers back this: `oauth-proxy/` (the API, at `ACCOUNT_API_URL`) and
`site-server/` (serves `*.hangwork.art`). They share **D1** (source of truth) + **KV**
(hot-path mirror) + **R2** (site files).

## Deploying the product site (hangwork.art)

Cloudflare Pages is connected to `origin/main` and builds with `npm run build:product`.
**To go live: commit + push to `main`.** `prebuild:product` runs `runtime:check` (fails on a
stale manifest) + `runtime:hydration`. The `.github/workflows/deploy.yml` GitHub Action is a
*separate* legacy demo deploy to github.io — it is **not** the product.

## Runtime integrity manifest (`.hangwork/`)

`generate-runtime-release.mjs` hashes essentially every `.astro/.ts/.tsx/.css/.d.ts` under
`src/` (excluding `src/data`, `src/assets`) plus a few fixed files. A published site pins the
exact renderer commit; a publish migrates content and reinstalls the renderer from that commit.
**Any edit to a hashed source file makes the manifest stale** → run `npm run runtime:generate`
and commit `.hangwork/runtime-release.json` + `.hangwork/project.json` with your change.
`build` and `build:product` fail on a stale manifest. Cutting a *versioned* runtime release
(bump `version`, tag `runtime-v*`) is a deliberate, user-authorized step — see the `verify` skill.

## Store & license

- **Store** — Stripe **Payment Links** (strict `buy.stripe.com`), the artist's own Stripe
  account, no Hangwork cut. `StoreEditor`, [src/portfolio/Products.tsx](src/portfolio/Products.tsx),
  `src/lib/stripe-payment-link.ts`. No cart / inventory sync / order dashboard, by design.
- **License** — Polar, pay-once; server ledger via the API Worker's `/webhooks/polar`.

## Legacy / dead code — ignore unless explicitly asked

Publishing was GitHub-Pages-based before Direction D (2026-07). Retired, but still in-tree as
unused mirror code:

- `src/editor/lib/oauth/` + `components/ConnectGitHubModal.tsx` — GitHub OAuth; not wired into
  the live publish flow.
- `src/editor/lib/github/` — GitHub mirror; only `subdomain.ts` survives (the
  `[name].hangwork.art` naming helper).
- `.github/workflows/deploy.yml` and the `github.io` fields in `.hangwork/project.json` — the
  separate template demo, not the product.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server (base `/portfolio-template`, editor at `/editor`) |
| `npm run build:product` | Build hangwork.art (production) |
| `npm run build` | Build the portfolio runtime/template |
| `npm run check` | Type-check Astro, React, scripts, tests |
| `npm test` | Migration, integrity, and publish-preflight tests |
| `npm run runtime:generate` | Regenerate the integrity manifest (after editing hashed source) |
