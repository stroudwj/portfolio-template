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

## Handoff email (`/handoff`) — current

Phones can browse and buy but not build, so the editor offers to email the person their
editor link to open on a computer; buyers (matched by Lemon Squeezy license key) get a
post-purchase "You own Hangwork now" email with an auto-unlock link. Content is fixed
server-side. Powered by [Resend](https://resend.com):

```sh
# In Resend, verify the hangwork.art domain (add the DNS records it shows in Cloudflare).
# EMAIL_FROM in wrangler.toml must be an address on that domain, then:
wrangler secret put RESEND_API_KEY
wrangler deploy
```

Until set, `/handoff` answers 503 and the editor falls back to a copy-the-link flow. The
endpoint is origin-locked and lightly rate-limited per isolate; add a Cloudflare rate-limit
rule on `/handoff` (e.g. 5 requests / 10 min per IP) if it ever sees real abuse.

## Legacy (retired): GitHub OAuth + github.io subdomains

Before Direction D this Worker also did GitHub OAuth token exchange and created
`[name].hangwork.art → [user].github.io` DNS grants, so sites could publish to GitHub Pages.
**That path is retired** — publishing is now Hangwork accounts (top of this file). The client
code lingers **unused** in `src/editor/lib/oauth/`, `src/editor/components/ConnectGitHubModal.tsx`,
and `src/editor/lib/github/` (only `subdomain.ts` is still used, for the `[name].hangwork.art`
naming). You do not need to deploy or configure any of it.
