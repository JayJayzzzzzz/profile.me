/**
 * GET /og.png  (rewritten from /api/og)
 *
 * Renders the live Open Graph card for jayjayzzzzzz.me on demand and returns a
 * PNG. Edge-cached ~90s, so a freshly shared link unfurls with data from the
 * last minute or two; every source is best-effort (see ../lib/data.ts).
 *
 * ?debug=1 returns the resolved data as JSON instead of the image.
 *
 * Renderer is `workers-og` (satori + resvg-wasm) — `@vercel/og` pulls in
 * `node:module` and is rejected by Vercel's Edge Function bundler.
 */
import { ImageResponse } from "workers-og";
import { getData } from "../lib/data";
import { buildCard } from "../lib/card";

export const config = { runtime: "edge" };

const FONTS = [
  { name: "Roboto", weight: 900, url: "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-900-normal.ttf" },
  { name: "JetBrains Mono", weight: 400, url: "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.ttf" },
  { name: "JetBrains Mono", weight: 700, url: "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-700-normal.ttf" },
] as const;

const CACHE = "public, s-maxage=90, stale-while-revalidate=600";

type Font = { name: string; weight: 400 | 700 | 900; style: "normal"; data: ArrayBuffer };
let fontCache: Font[] | null = null;

async function fonts(): Promise<Font[]> {
  if (!fontCache) {
    fontCache = await Promise.all(
      FONTS.map(async (f) => ({
        name: f.name,
        weight: f.weight as 400 | 700 | 900,
        style: "normal" as const,
        data: await fetch(f.url, { signal: AbortSignal.timeout(4000) }).then((r) => {
          if (!r.ok) throw new Error(`font ${f.url} → ${r.status}`);
          return r.arrayBuffer();
        }),
      })),
    );
  }
  return fontCache;
}

export default async function handler(req: Request): Promise<Response> {
  const debug = new URL(req.url).searchParams.has("debug");
  const [data, loadedFonts] = await Promise.all([getData(), fonts()]);

  if (debug) {
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json", "cache-control": CACHE },
    });
  }

  // buildCard returns a Satori element tree (React-element-shaped); workers-og
  // passes non-string elements straight to satori.
  return new ImageResponse(buildCard(data) as never, {
    width: 1200,
    height: 630,
    fonts: loadedFonts,
    headers: { "cache-control": CACHE },
  });
}
