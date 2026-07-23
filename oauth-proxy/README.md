# Hangwork API Worker (accounts + hosting + the legacy GitHub proxy)

The product's server side, as one Cloudflare Worker (plus its sibling serving Worker in
`../site-server/`). Since Direction D it owns:

1. **Accounts** (`/auth/*`) — passwordless sign-in: magic-link email (Resend) and
   optional Google OAuth. Sessions are 30-day HS256 JWTs signed with `SESSION_SECRET`;
   users/licenses/sites live in **D1** (schema in `migrations/`).
2. **Publishing** (`/publish`, `/upload`, `/publish/complete`) — authz + license gate +
   quotas + manifest diff; browser-built static sites upload straight into **R2** under
   the site's stable id prefix. **KV** mirrors `hostname → { siteId, status }` for the
   serving Worker's hot path.
3. **Site management** (`/site/*`) — subdomain claims (a D1 row + KV write; the wildcard
   DNS record does the routing), Cloudflare-for-SaaS custom hostnames, and the
   `/site/export` zip (the ownership guarantee).
4. **Lemon Squeezy webhook** (`/webhooks/lemonsqueezy`) — the robust license ledger:
   orders create entitlements matched by buyer email; refunds revoke them.

## Direction D setup (accounts + hosting)

```sh
# create the resources once, then paste the ids into wrangler.toml (BOTH workers)
wrangler d1 create hangwork
wrangler kv namespace create hangwork-kv
wrangler r2 bucket create hangwork-sites
wrangler d1 migrations apply hangwork --remote

# secrets
wrangler secret put SESSION_SECRET        # long random string (JWTs + upload tickets)
wrangler secret put LS_WEBHOOK_SECRET     # Lemon Squeezy → Settings → Webhooks
wrangler secret put GOOGLE_CLIENT_SECRET  # optional: Google OAuth client
wrangler secret put CF_SAAS_TOKEN         # optional: custom hostnames (SSL and Certificates:Edit)

wrangler deploy                 # this worker
cd ../site-server && wrangler deploy   # the serving worker (*.hangwork.art)
```

Dashboard steps (one-time, see also `../site-server/wrangler.toml`):
- **DNS**: proxied wildcard `*.hangwork.art` → `100::` (AAAA placeholder; the Worker
  route serves everything).
- **Cache Rules**: cache-eligible on `*.hangwork.art`, respect origin Cache-Control —
  repeat hits then never touch Worker/R2.
- **Lemon Squeezy → Webhooks**: point at `https://<this-worker>/webhooks/lemonsqueezy`,
  events `order_created`, `order_refunded`, `license_key_created`.
- **Google Cloud Console** (optional): OAuth client (Web), redirect URI = the editor URL
  (`https://hangwork.art/editor/`); set `GOOGLE_CLIENT_ID` here + in
  `src/editor/lib/account/config.ts`.
- **Cloudflare for SaaS** (optional, custom domains): enable on the zone; fallback
  origin = a proxied hostname covered by the serving Worker's route.
- **Guardrails before the first real user**: Cloudflare Notifications on Workers/R2
  usage + spend; enable the CSAM Scanning Tool for user images; publish abuse@/DMCA
  contact + acceptable-use terms. The `sites.status` row (mirrored to KV) is the
  kill switch: one write suspends/takes down a site.

Local dev: `wrangler dev --local --persist-to ../.wrangler-local` (+ the same for
`../site-server` with `--var LOCAL_DEV:true`, which lets `X-Forwarded-Host` pick the
site). Apply migrations with `--local` first. NOTE: run the two workers one at a time
against the shared persist dir — Miniflare doesn't share KV state across two live
processes.

---

# Legacy: GitHub OAuth token-exchange proxy (+ subdomains + handoff email)

The original three jobs, kept for the optional GitHub mirror flow and the handoff email:

1. **OAuth token exchange** — swaps the short-lived OAuth `code` for a user access token
   using the OAuth App's client secret (which can't live in the browser). No database,
   no per-user cost, no subscription.
2. **Subdomain grants** — creates the DNS record that gives every new published site its
   default address, `[name].hangwork.art` → `[user].github.io`. The DNS record itself is
   the ownership ledger (its CNAME target says whose it is), so still no database.
3. **Handoff email** (`/handoff`) — phones can browse and buy but not build, so the
   editor offers to email the person their editor link to open on a computer. Buyers
   (identified by their Lemon Squeezy license key) get the post-purchase email at the
   address on their purchase, with an auto-unlock link; everyone else gets a plain link
   at the address they typed. Content is fixed server-side.

If you don't deploy this, the editor still works — it falls back to the manual
personal-access-token flow, and new sites publish to `[user].github.io/[name]`.

## One-time setup

### 1. Register a GitHub OAuth App
GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:

- **Application name:** anything (e.g. "Portfolio Publisher")
- **Homepage URL:** your editor URL, e.g. `https://hangwork.art/`
- **Authorization callback URL:** the editor page exactly —
  `https://hangwork.art/editor/`

Click **Register**, then **Generate a new client secret**. Note the **Client ID** and the
**secret**.

### 2. Deploy the Worker
Requires the free [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/):

```sh
cd oauth-proxy
# Put your OAuth App client id + editor origin into wrangler.toml ([vars]).
wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret when prompted
wrangler deploy
```

### 2b. Enable hangwork.art subdomains (optional but recommended)

New sites then default to `[name].hangwork.art` instead of the github.io address.

1. In the Cloudflare dashboard → the **hangwork.art** zone → Overview, copy the
   **Zone ID** into `CF_ZONE_ID` in `wrangler.toml`.
2. Create an API token (My Profile → API Tokens → Create Token) with a single
   permission: **Zone → DNS → Edit**, scoped to the hangwork.art zone only. Then:

```sh
wrangler secret put CF_DNS_TOKEN   # paste the DNS token when prompted
wrangler deploy
```

Until both are set, the `/subdomain/*` routes answer 503 and the editor quietly falls
back to publishing at `[user].github.io/[name]`. Records are created DNS-only (grey
cloud) on purpose — GitHub Pages must see the CNAME directly to route the domain and
issue its HTTPS certificate (which takes a few minutes on a brand-new address).

### 2c. Enable the handoff email (optional but recommended)

Powers "Send me the link" on phones and the post-purchase "You own Hangwork now" email.

1. Create a free [Resend](https://resend.com) account and **verify the hangwork.art
   domain** (Resend shows the DNS records to add in Cloudflare).
2. Check `EMAIL_FROM` in `wrangler.toml` matches an address on that domain. Then:

```sh
wrangler secret put RESEND_API_KEY   # paste the Resend API key when prompted
wrangler deploy
```

Until both are set, `/handoff` answers 503 and the editor quietly offers a
copy-the-link flow instead of sending email. The endpoint is origin-locked and
lightly rate-limited per isolate; if it ever sees real abuse, add a Cloudflare
rate-limiting rule on `/handoff` (e.g. 5 requests / 10 minutes per IP).

Also worth doing in the Lemon Squeezy dashboard: mention the 14-day refund in the
product description so it's visible on the checkout page itself.

Wrangler prints the Worker URL, e.g. `https://portfolio-oauth-proxy.<you>.workers.dev`.

### 3. Point the editor at it
In [`src/editor/lib/oauth/config.ts`](../src/editor/lib/oauth/config.ts) set:

- `OAUTH_CLIENT_ID` — the OAuth App **Client ID**
- `WORKER_TOKEN_URL` — the deployed Worker URL (its `POST /` endpoint)

Rebuild/redeploy the site. The editor's **Authorize with GitHub** button now lights up; if
these are left blank, the editor shows the token flow instead.

## Local testing

```sh
wrangler dev            # serves the Worker at http://localhost:8787
```

Because an OAuth App has a single registered callback (your github.io editor), the redirect
round-trip only completes on the deployed editor. For local editor work, use the
personal-access-token fallback (or register a separate throwaway OAuth App whose callback is
`http://localhost:4321/portfolio-template/editor/` and point a local build at it).
