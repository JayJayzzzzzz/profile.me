/**
 * Drives the site accent (`--highlight` / `--highlight-glow`) from the live
 * Discord profile theme colour. The last value is cached in localStorage so it
 * applies instantly on the next visit; a fresh fetch then updates it. Very dark
 * theme colours are ignored so the UI never loses contrast.
 */
import { DISCORD_USER_ID, DISCORD_PROFILE } from "../config";

const PROFILE_ENDPOINT = "https://dcdn.dstn.to/profile";
const CACHE_KEY = "pm-accent";

export function initAccent(): void {
  if (!DISCORD_PROFILE.accentFromTheme) return;
  if (!/^\d{17,20}$/.test(DISCORD_USER_ID)) return;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) apply(cached);
  } catch {
    /* storage unavailable */
  }

  fetch(`${PROFILE_ENDPOINT}/${DISCORD_USER_ID}`)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((body: { user_profile?: { theme_colors?: number[] } }) => {
      const primary = body.user_profile?.theme_colors?.[0];
      if (primary == null) return;
      const hex = toHex(primary);
      if (!bright(primary)) return;
      apply(hex);
      try {
        localStorage.setItem(CACHE_KEY, hex);
      } catch {
        /* ignore */
      }
    })
    .catch(() => {
      /* keep whatever is already applied */
    });
}

function apply(hex: string): void {
  const { r, g, b } = channels(hex);
  const root = document.documentElement.style;
  root.setProperty("--highlight", hex);
  root.setProperty("--highlight-glow", `rgba(${r}, ${g}, ${b}, 0.55)`);
  dispatchEvent(new Event("pm:accent"));
}

function toHex(value: number): string {
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}

function channels(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Reject colours that would be unreadable as an accent on the near-black bg. */
function bright(value: number): boolean {
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 55;
}
