# profile.me

My personal landing page — [github.com/JayJayzzzzzz](https://github.com/JayJayzzzzzz).

Built with [Astro](https://astro.build) (no UI framework). The look is a deliberate
homage to [osumatrix.me](https://osumatrix.me/): dark `#060606` background, neon
`#ff0052` accent, blend-mode circle cursor with a WebGL shader trail, and a hover
"unfold" where a tilted card slides out from behind the profile photo.

## Features

- **Live Discord avatar** pulled client-side via [Lanyard](https://github.com/Phineas/lanyard),
  with an SVG fallback
- **Live clock** and an **age counter** derived from a single birthdate in config
- Social links with inline brand icons
- Respects `prefers-reduced-motion` (disables the float animation and shader)

## Project structure

```text
src/
├── config.ts              # DISCORD_USER_ID, BIRTHDATE, ageFrom()
├── data/social-links.ts   # links + brand icon SVG paths
├── components/ProfileCard.astro
├── pages/index.astro
├── styles/                # global.css (tokens/reset) + profile.css (UI + unfold)
└── scripts/               # pointer, clock, age, discord-avatar + main.ts orchestrator
public/
└── cursor-trail/          # WebGL trail (effect.js + GLSL), loads after three.js r88
```

## Configuration

Set `DISCORD_USER_ID` and `BIRTHDATE` in [src/config.ts](src/config.ts). The live
avatar also requires joining [discord.gg/lanyard](https://discord.gg/lanyard).

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
