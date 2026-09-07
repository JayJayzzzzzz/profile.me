/** Build-time Open Graph image (1200×630) rendered to /og/index.png. */
import { OGImageRoute } from "astro-og-canvas";

export const { getStaticPaths, GET } = await OGImageRoute({
  pages: {
    index: {
      title: "JayJayzzzzzz",
      description: "IT apprentice · application development · Wiesbaden, Germany",
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
