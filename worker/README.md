# profile.me API proxy

A tiny Cloudflare Worker that fronts the three APIs the landing page can't call
directly, because each needs a secret credential that must not ship in a static
site:

| Route        | Upstream                                   | Credentials                                                        |
| :----------- | :----------------------------------------- | :---------------------------------------------------------------- |
| `/osu`       | osu! API v2 (`users`, `scores/best`)       | `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`                              |
| `/steam`     | Steam Web API (summary + recent + owned)   | `STEAM_API_KEY`                                                    |
| `/spotify`   | Spotify `recently-played`                  | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` |
| `/guestbook` | Cloudflare D1 (`GET` list / `POST` sign / `DELETE` admin) | `DB` binding, `GUESTBOOK_ADMIN_TOKEN` (delete only) |

The proxy routes return small, public, read-only JSON, edge-cached for
`CACHE_SECONDS` (default 300). If a route's credentials are missing it returns
`502` and the site quietly falls back to a plain outbound link — so you can ship
one integration at a time. The guestbook is never cached and returns `503` until
its D1 database is wired up (below).

GitHub stats and the weather readout need no key and are fetched by the browser
directly; they are not part of this worker.

## Deploy

```sh
cd worker
npm install
npx wrangler login          # once
npx wrangler deploy
```

Copy the printed `https://profile-me-proxy.<subdomain>.workers.dev` URL into
[`../src/config.ts`](../src/config.ts) → `WORKER_ENDPOINT`, commit, and the site
picks the panels up on the next Pages build.

Edit non-secret values (`ALLOWED_ORIGIN`, `OSU_USER_ID`, `STEAM_ID`, …) in
[`wrangler.toml`](./wrangler.toml). Keep `ALLOWED_ORIGIN` pointed at the real
site origin so the endpoint isn't usable from anywhere else.

## Secrets

### osu!

1. <https://osu.ppy.sh/home/account/edit> → **OAuth** → *New OAuth application*
   (any name, callback URL can be `http://localhost`).
2. ```sh
   npx wrangler secret put OSU_CLIENT_ID
   npx wrangler secret put OSU_CLIENT_SECRET
   ```

The worker uses the client-credentials ("guest") grant — no user login, public
data only.

### Steam

1. Get a key at <https://steamcommunity.com/dev/apikey>.
2. ```sh
   npx wrangler secret put STEAM_API_KEY
   ```
3. Set `STEAM_ID` in `wrangler.toml` to your 64-bit id **or** vanity name. Your
   profile must have **Game details** set to *Public* for recent games to show.

### Spotify

1. Create an app at <https://developer.spotify.com/dashboard>.
2. In its settings add the redirect URI `http://127.0.0.1:8888/callback`.
3. Run the helper to complete the one-time OAuth and print a refresh token:
   ```sh
   # PowerShell
   $env:SPOTIFY_CLIENT_ID="..."; $env:SPOTIFY_CLIENT_SECRET="..."
   npm run spotify-auth
   ```
4. ```sh
   npx wrangler secret put SPOTIFY_CLIENT_ID
   npx wrangler secret put SPOTIFY_CLIENT_SECRET
   npx wrangler secret put SPOTIFY_REFRESH_TOKEN
   ```

The refresh token does not expire; you only redo this if you revoke access.

### Guestbook (Cloudflare D1)

1. Create the database and copy the printed `database_id` into
   [`wrangler.toml`](./wrangler.toml) → `[[d1_databases]]`:
   ```sh
   npx wrangler d1 create profile-me-guestbook
   ```
2. Apply the schema:
   ```sh
   npx wrangler d1 migrations apply profile-me-guestbook --remote   # add --local for `wrangler dev`
   ```
3. Set an admin token (any long random string) so you can remove entries:
   ```sh
   npx wrangler secret put GUESTBOOK_ADMIN_TOKEN
   ```
4. `npx wrangler deploy`.

Spam defence lives in the worker: a honeypot field, a minimum fill time, a
per-IP rate limit (3/hour — IPs are stored only as a salted hash), a length cap
and a link block. Remove an entry with:

```sh
curl -X DELETE "$WORKER/guestbook?id=<uuid>" -H "Authorization: Bearer <GUESTBOOK_ADMIN_TOKEN>"
```

(The `id` isn't returned by the public `GET`; read it with
`npx wrangler d1 execute profile-me-guestbook --remote --command \
"SELECT id, name, created_at FROM guestbook ORDER BY created_at DESC LIMIT 20"`.)

## Local development

```sh
cp .dev.vars.example .dev.vars   # then fill in real values
npx wrangler dev
```

`.dev.vars` is gitignored. Test with `curl http://localhost:8787/osu`.
