/**
 * GET /og.png  (rewritten from /api/og)
 *
 * Renders the live Open Graph card for jayjayzzzzzz.me on demand and returns a
 * PNG. Edge-cached ~90s, so a freshly shared link unfurls with data from the
 * last minute or two; every source is best-effort (see ../lib/data.ts).
 *
 * ?debug=1 returns the resolved data as JSON instead of the image.
 */
import { ImageResponse } from "@vercel/og";
import { getData } from "../lib/data.ts";
import { buildCard } from "../lib/card.ts";

export const config = { runtime: "edge" };

const FONTS = [
  { name: "Roboto", weight: 900, file: "../fonts/Roboto-Black.ttf" },
  { name: "JetBrains Mono", weight: 400, file: "../fonts/JetBrainsMono-Regular.ttf" },
  { name: "JetBrains Mono", weight: 700, file: "../fonts/JetBrainsMono-Bold.ttf" },
] as const;

const CACHE = "public, s-maxage=90, stale-while-revalidate=600";

export default async function handler(req: Request): Promise<Response> {
  const debug = new URL(req.url).searchParams.has("debug");

  const [data, fonts] = await Promise.all([
    getData(),
    Promise.all(
      FONTS.map(async (f) => ({
        name: f.name,
        weight: f.weight as 400 | 700 | 900,
        style: "normal" as const,
        data: await fetch(new URL(f.file, import.meta.url)).then((r) => r.arrayBuffer()),
      })),
    ),
  ]);

  if (debug) {
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json", "cache-control": CACHE },
    });
  }

  return new ImageResponse(buildCard(data) as unknown as any, {
    width: 1200,
    height: 630,
    fonts,
    headers: { "cache-control": CACHE },
  });
}
