# GitHub OAuth token-exchange proxy (+ hangwork.art subdomains)

The one small server-side piece the editor needs. Two jobs:

1. **OAuth token exchange** — swaps the short-lived OAuth `code` for a user access token
   using the OAuth App's client secret (which can't live in the browser). No database,
   no per-user cost, no subscription.
2. **Subdomain grants** — creates the DNS record that gives every new published site its
   default address, `[name].hangwork.art` → `[user].github.io`. The DNS record itself is
   the ownership ledger (its CNAME target says whose it is), so still no database.

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
