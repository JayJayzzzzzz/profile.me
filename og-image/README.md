# profile.me — live Open Graph card

The link preview for **jayjayzzzzzz.me**, rendered on demand instead of at build
time so a freshly shared link unfurls with data from the last minute or two.

```
GET /og.png   →   1200×630 PNG   (rewritten from /api/og)
GET /og.png?debug=1   →   the resolved data as JSON
```

## How it works

```
scraper ──▶ /og.png ──┬─▶ Lanyard          discord status + avatar   (no key, ~realtime)
   (Discord,          ├─▶ worker /spotify   now playing / last track
    Slack, …)         ├─▶ worker /osu       global rank + pp
                      └─▶ worker /steam     level or current game
                              │
                      satori + resvg (via @vercel/og) ──▶ PNG
                              │
              Cache-Control: s-maxage=90, stale-while-revalidate=600
```

* Rendered **only when something scrapes the link**, at most once every ~90s
  (Vercel edge cache). No cron, no idle cost.
* Every upstream is best-effort — anything that fails or times out (2.5s) is
  dropped and the card still renders (at minimum: name + local time). See
  [`lib/data.ts`](lib/data.ts).
* "Live" means **live at share time**. A link pasted now is current; an embed
  already sitting in a channel only updates when that platform re-crawls it
  (hours–days, not controllable by us).

## Deploy (one time)

This folder is its own Vercel project, separate from the GitHub Pages site.

1. **Import** the repo at [vercel.com/new](https://vercel.com/new).
   * **Root Directory:** `og-image`
   * **Framework Preset:** Other
   * Build/Output/Install: leave as defaults (`npm install`, no build step).
2. Deploy. Note the URL, e.g. `https://jayjayzzzzzz-og.vercel.app`.
3. Point the site at it — [`../src/config.ts`](../src/config.ts):
   ```ts
   export const OG_IMAGE_URL = "https://<your-project>.vercel.app/og.png?v=1";
   ```
   (or add a custom domain like `og.jayjayzzzzzz.me` in the Vercel project and
   use that). Commit → GitHub Pages picks it up on the next build.
4. Check it: open `…/og.png` and `…/og.png?debug=1`.

### Optional env vars (Vercel → Settings → Environment Variables)

| Var                | Default                                              |
| :----------------- | :-------------------------------------------------- |
| `DISCORD_USER_ID`  | `483999801034145793`                                |
| `WORKER_ENDPOINT`  | `https://profile-me-proxy.jayjayzzzzzz.workers.dev` |

## Changing the design

Edit [`lib/card.ts`](lib/card.ts), then preview locally without deploying:

```sh
npm install
npm run test:render            # real live data  → og-test.png
npm run test:render:fixture    # canned data, offline
```

`test:render` uses `satori` + `@resvg/resvg-js` directly (devDependencies);
production uses `@vercel/og`, which wraps the same two libraries.

When the card's **look** changes, bump `?v=` in `OG_IMAGE_URL` so scrapers that
already cached the old image fetch the new one.

## Layout

| File                     | Role                                             |
| :----------------------- | :---------------------------------------------- |
| `api/og.ts`              | Vercel edge handler — fonts, cache headers      |
| `lib/data.ts`            | fetch + normalise the live data                 |
| `lib/card.ts`            | the card as a Satori element tree               |
| `fonts/`                 | Roboto Black + JetBrains Mono (subsetted TTF)   |
| `scripts/render-local.ts`| local preview                                    |
