/**
 * Build-time Open Graph image (1200×630) rendered to /og/index.png.
 *
 * This is the *fallback* card. The live one is served by the `og-image/` Vercel
 * project and wired up via OG_IMAGE_URL in src/config.ts; this static image is
 * only used when that URL is cleared or the endpoint is unreachable.
 */
import { OGImageRoute } from "astro-og-canvas";

export const { getStaticPaths, GET } = await OGImageRoute({
  pages: {
    index: {
      title: "JayJayzzzzzz",
      description: "all my links in one place · jayjayzzzzzz.me",
    },
  },
  getImageOptions: (_path, page: { title: string; description: string }) => ({
    title: page.title,
    description: page.description,
    padding: 80,
    bgGradient: [
      [6, 6, 6],
      [17, 12, 28],
    ],
    border: { color: [124, 58, 237], width: 16, side: "inline-start" },
    font: {
      title: {
        color: [255, 255, 255],
        size: 76,
        weight: "ExtraBold",
        lineHeight: 1.1,
      },
      description: { color: [176, 176, 188], size: 30, lineHeight: 1.4 },
    },
  }),
});
