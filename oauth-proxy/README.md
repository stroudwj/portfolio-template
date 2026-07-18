# GitHub OAuth token-exchange proxy

The one small server-side function the editor's **Authorize with GitHub** flow needs. It
swaps the short-lived OAuth `code` for a user access token using the OAuth App's client
secret (which can't live in the browser). No database, no per-user cost, no subscription.

If you don't deploy this, the editor still works — it falls back to the manual
personal-access-token flow automatically.

## One-time setup

### 1. Register a GitHub OAuth App
GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:

- **Application name:** anything (e.g. "Portfolio Publisher")
- **Homepage URL:** your editor URL, e.g. `https://simpleportfolioeditor.pages.dev/`
- **Authorization callback URL:** the editor page exactly —
  `https://simpleportfolioeditor.pages.dev/editor/`

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
