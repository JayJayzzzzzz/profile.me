# profile.me

My personal landing page — [github.com/JayJayzzzzzz](https://github.com/JayJayzzzzzz).

Built with [Astro](https://astro.build) (no UI framework). The look is a deliberate
homage to [osumatrix.me](https://osumatrix.me/): dark `#060606` background, neon
`#ff0052` accent, blend-mode circle cursor with a WebGL shader trail, and a hover
"unfold" where a tilted card slides out from behind the profile photo.

## Features

- **Live Discord avatar** pulled client-side via [Lanyard](https://github.com/Phineas/lanyard),
  with an SVG fallback
- **Live Discord profile popout** (Discord icon) — status, activity, Spotify,
  badges, animated profile effect, and an optional **Recently played** list
- **In-page GitHub panel** (GitHub icon) — profile, contribution calendar,
  popular repos; public API, no key
- **In-page osu! and Steam panels** (osu! / Steam icons) — stats, recent plays
  and games, served through the [worker](./worker) proxy
- **Live clock**, an **inline weather readout** for Wiesbaden ([Open-Meteo](https://open-meteo.com)),
  and an **age counter** derived from a single birthdate in config
- **Site accent follows the live Discord theme colour** (`--highlight`)
- **Cursor + trail switcher** — a picker in the top-right corner swaps between 8
  cursor heads (blend circle, dot & ring, crosshair, glow orb, inkblot,
  spotlight, velocity blade, halo) and 8 trails (the original WebGL shader, neon
  ribbon, ember, sparks, light streak, ripple wake, aurora, none). The choice is
  remembered per visitor; the default is the original blend circle + shader.
- **Keyboard shortcuts** — `?` for the cheatsheet, single keys to jump to a link
- **Konami code** (`↑↑↓↓←→←→ B A`) — a hue-cycling trail, a barrel roll and a
  hidden panel
- Click ripple on the cursor, toast notifications, View Transitions on panel open
- Dynamic **Open Graph image** at `/og/index.png` ([astro-og-canvas](https://github.com/delucis/astro-og-canvas))
- Optional cookieless analytics ([GoatCounter](https://www.goatcounter.com/))
- **Offline fallback** via a service worker (production only)
- Respects `prefers-reduced-motion`, `prefers-reduced-transparency` and
  `prefers-contrast`

## Project structure

```text
src/
├── config.ts              # user IDs, WORKER_ENDPOINT, GOATCOUNTER_CODE, LOCATION, BIRTHDATE
├── data/social-links.ts   # links + brand icon SVG paths
├── components/ProfileCard.astro
├── pages/
│   ├── index.astro
│   └── og/[...route].ts    # build-time Open Graph image → /og/index.png
├── styles/                # global.css, profile.css, discord-profile.css, panel.css, extras.css
└── scripts/               # main.ts orchestrator + one module per feature
│                          #   panel.ts / worker-api.ts / view-transition.ts / toast.ts (shared)
│                          #   github.ts / osu.ts / steam.ts / spotify.ts / discord-profile.ts (link panels)
│                          #   cursor.ts (cursor + trail switcher) / weather.ts / accent.ts / shortcuts.ts / konami.ts …
public/
├── sw.js                  # offline service worker
└── cursor-trail/          # WebGL shader trail (effect.js + GLSL); one of the trail options
worker/                    # Cloudflare Worker proxy for osu! / Steam / Spotify — see worker/README.md
```

## Configuration

Everything lives in [src/config.ts](src/config.ts):

| Key                             | Purpose                                                                    |
| :------------------------------ | :------------------------------------------------------------------------ |
| `DISCORD_USER_ID`               | live avatar + profile popout + site accent (join [discord.gg/lanyard](https://discord.gg/lanyard)) |
| `GITHUB_USER`, `OSU_USER_ID`    | which accounts the GitHub / osu! panels read                              |
| `WORKER_ENDPOINT`               | deployed [worker](./worker) URL — empty leaves osu!/Steam as plain links   |
| `GOATCOUNTER_CODE`              | GoatCounter site code — empty renders no analytics                        |
| `LOCATION`                      | coordinates + time zone for the clock and weather                         |
| `BIRTHDATE`                     | drives the age counter                                                    |
| `DISCORD_PROFILE.*`             | popout fallbacks, `accentFromTheme`, `recentlyPlayed`                     |

The GitHub panel and weather need no keys. The osu!, Steam and Spotify-history
panels need the worker — follow [worker/README.md](worker/README.md), then set
`WORKER_ENDPOINT`. Each worker route degrades independently, so you can wire up
one integration at a time.

## Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start the dev server at `localhost:4321`    |
| `npm run build`   | Build the production site to `./dist/`      |
| `npm run preview` | Preview the build locally                   |

Requires Node `>=22.12.0`.

## Deployment

Every push to `main` is built and deployed to GitHub Pages by
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) (Astro's official
`withastro/action`). The site is served from the custom domain
[jayjayzzzzzz.me](https://jayjayzzzzzz.me) via [public/CNAME](public/CNAME).

One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. **Settings → Pages → Custom domain: `jayjayzzzzzz.me`** (enable "Enforce HTTPS"
   once the certificate is issued)
3. DNS at the registrar for the apex domain `jayjayzzzzzz.me`:
   - `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`

`site` in [astro.config.mjs](astro.config.mjs) is set to the custom domain; `base`
stays `/`.
