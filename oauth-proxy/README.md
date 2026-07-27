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
5. **Operator console** (`/admin/*`) — allowlisted account, license, and site inspection
   plus audited manual grants and reversible site suspensions. It uses the normal signed
   account session plus a second server-side operator allowlist and never returns full
   license keys or mutates Lemon Squeezy purchase records.

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
wrangler secret put ADMIN_EMAILS          # comma-separated operator account emails
# or: wrangler secret put ADMIN_GOOGLE_SUBS  # comma-separated Google subject ids

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
- **Polar → Settings → Webhooks**: point at `https://<this-worker>/webhooks/polar`,
  events `order.paid`, `order.refunded`, and `benefit_grant.revoked`. Create the
  Organization Access Token with only `checkouts:read` and `checkouts:write`, then store
  both credentials as Worker secrets:

  ```sh
  wrangler secret put POLAR_ACCESS_TOKEN
  wrangler secret put POLAR_WEBHOOK_SECRET
  ```

  Sandbox and production are isolated. Keep `POLAR_SERVER`, `POLAR_PRODUCT_ID`,
  `POLAR_ORGANIZATION_ID`, and `POLAR_BENEFIT_ID` in `wrangler.toml` aligned with the
  environment that issued those two secrets.
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

## Operator console

The product build includes `/admin/`. The page contains no account data until the browser
presents a valid Hangwork session and the Worker confirms that account against
`ADMIN_EMAILS` or `ADMIN_GOOGLE_SUBS`. Configure at least one as a Worker secret:

```sh
wrangler secret put ADMIN_EMAILS
# Enter one or more comma-separated Hangwork account emails.
wrangler deploy
```

Sign in through `/editor/` in another tab, then open `/admin/`. The console lists every
account 25 at a time, supports filtering, and can sort by combined recent activity,
last sign-in, last publish, or account update. Historical sign-in dates begin being
recorded after migration `0003`; older accounts show no sign-in date until their next
successful login. Operators can inspect license/site metadata, add or revoke manual
access, and suspend or restore published sites. Every mutation requires a reason and
writes its actor, target, before/after state, and timestamp to `admin_audit_log`. Site
suspension remembers the owner's previous visibility. Paid Lemon Squeezy rows are never
edited by manual controls, full license keys are masked, and the route is excluded from
the sitemap with `noindex`, `nofollow`, and `noarchive`.

Before deploying a Worker version that imports these controls, apply the D1 migration:

```sh
wrangler d1 migrations apply hangwork --remote
wrangler deploy
```

## Tester access code

For product testing, configure one reusable code as a Worker secret:

```sh
wrangler secret put TEST_ACCESS_CODE
wrangler deploy
```

A tester signs in, opens the publishing license prompt, chooses **Enter a tester access
code**, and redeems it. The code may be shared with multiple testers; each account receives
its own manual entitlement. Those grants appear in the operator console and can be revoked
individually without changing Lemon Squeezy purchases. A revoked tester account cannot
redeem the shared code again unless an operator restores access with a new manual grant.
Rotate the Worker secret to stop future redemptions without affecting existing testers.

## Legacy (retired): GitHub OAuth + github.io subdomains

Before Direction D this Worker also did GitHub OAuth token exchange and created
`[name].hangwork.art → [user].github.io` DNS grants, so sites could publish to GitHub Pages.
**That path is retired** — publishing is now Hangwork accounts (top of this file). The client
code lingers **unused** in `src/editor/lib/oauth/`, `src/editor/components/ConnectGitHubModal.tsx`,
and `src/editor/lib/github/` (only `subdomain.ts` is still used, for the `[name].hangwork.art`
naming). You do not need to deploy or configure any of it.
