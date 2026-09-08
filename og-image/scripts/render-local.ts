/**
 * Local preview: renders the card to og-test.png without Vercel.
 *
 *   node scripts/render-local.ts            # real live data
 *   node scripts/render-local.ts --fixture  # canned data, no network
 *
 * Uses satori + resvg directly (devDependencies); production uses @vercel/og,
 * which wraps the same two libraries.
 */
import { readFile, writeFile } from "node:fs/promises";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { buildCard } from "../lib/card.ts";
import { getData, type CardData } from "../lib/data.ts";

const FIXTURE: CardData = {
  name: "jayjayzzzzzz",
  city: "Wiesbaden",
  status: "online",
  avatar: null,
  music: { title: "505", artist: "Arctic Monkeys", live: true },
  osu: { rank: 258302, pp: 3233 },
  steam: { level: 16 },
  time: "02:25",
  tz: "UTC+2",
};

const fonts = [
  { name: "Roboto", weight: 900, style: "normal", data: await readFile(new URL("../fonts/Roboto-Black.ttf", import.meta.url)) },
  { name: "JetBrains Mono", weight: 400, style: "normal", data: await readFile(new URL("../fonts/JetBrainsMono-Regular.ttf", import.meta.url)) },
  { name: "JetBrains Mono", weight: 700, style: "normal", data: await readFile(new URL("../fonts/JetBrainsMono-Bold.ttf", import.meta.url)) },
];

const data = process.argv.includes("--fixture") ? FIXTURE : await getData();
console.log("data:", JSON.stringify(data, (k, v) => (k === "avatar" && v ? "<data-uri>" : v)));

const svg = await satori(buildCard(data) as never, {
  width: 1200,
  height: 630,
  fonts: fonts as never,
});
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
await writeFile(new URL("../og-test.png", import.meta.url), png);
console.log("wrote og-test.png");
