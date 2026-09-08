/**
 * Machine-readable index of every link on the page, generated at build time
 * from src/data/social-links.ts so it can never drift from what's rendered.
 * Served at /links.json.
 */
import type { APIRoute } from "astro";
import { links } from "../data/social-links";
import { ageFrom, LOCATION } from "../config";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin ?? "https://jayjayzzzzzz.me";

  const body = {
    name: "JayJayzzzzzz",
    url: origin,
    description: "JayJayzzzzzz — all my links in one place.",
    location: LOCATION.label,
    age: ageFrom(new Date()),
    generated: new Date().toISOString(),
    links: links.map((link) => ({
      name: link.name,
      url: link.href,
      icon: link.icon,
      // Which links open an in-page panel with live data rather than just
      // navigating away.
      panel: link.action ?? null,
    })),
  };

  return new Response(JSON.stringify(body, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
