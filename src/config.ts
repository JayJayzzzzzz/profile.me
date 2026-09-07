/** Public configuration for the landing page. */

/** Discord user ID — resolved to a live avatar through the Lanyard API. */
export const DISCORD_USER_ID = "483999801034145793";

/** GitHub login — drives the in-page GitHub panel (public API, no key). */
export const GITHUB_USER = "JayJayzzzzzz";

/** osu! user ID — the in-page osu! panel reads stats for it through the worker. */
export const OSU_USER_ID = "20094442";

/**
 * Base URL of the Cloudflare Worker that proxies the APIs needing a secret key
 * (osu!, Steam, Spotify history). Leave empty to disable those panels — their
 * icons then behave as plain outbound links. See worker/README.md.
 *
 * e.g. "https://profile-me-proxy.jayjay.workers.dev"
 */
export const WORKER_ENDPOINT = "https://profile-me-proxy.jayjayzzzzzz.workers.dev";

/** Cookieless analytics. Set to your GoatCounter site code, e.g. "jayjay". */
export const GOATCOUNTER_CODE = "";

/** Home location — the clock, the inline weather readout and copy all use it. */
export const LOCATION = {
  label: "Wiesbaden, Germany",
  timeZone: "Europe/Berlin",
  latitude: 50.0826,
  longitude: 8.24,
} as const;

/**
 * The in-page Discord profile popout (opened from the Discord icon).
 *
 * Live data is stitched together from public, auth-free endpoints at runtime —
 * Lanyard (status / activity / avatar decoration / name styling), dstn.to's
 * profile proxy (banner, bio, pronouns, badges, profile-effect SKU, theme
 * colours), and Discord's store listing for that SKU. The values below are only
 * fallbacks / switches. "Member since" is derived from the user-ID snowflake.
 */
export const DISCORD_PROFILE: {
  /** Banner strip colour shown until (or instead of) the live banner. */
  bannerColor: string;
  /** Popout background shown until the live profile theme colours load. */
  themeColor: string;
  /** Set false to skip fetching and rendering the animated profile effect. */
  profileEffect: boolean;
  /** Drive the site accent (`--highlight`) from the live Discord theme colour. */
  accentFromTheme: boolean;
} = {
  bannerColor: "#18191c",
  themeColor: "#1e1a24",
  profileEffect: true,
  accentFromTheme: true,
};

/** Date of birth, used to render and auto-roll the displayed age. */
export const BIRTHDATE = { year: 2005, month: 9, day: 8 } as const;

/** Whole years elapsed between {@link BIRTHDATE} and `on`. */
export function ageFrom(on: Date): number {
  const years = on.getFullYear() - BIRTHDATE.year;
  const month = on.getMonth() + 1;
  const beforeBirthday =
    month < BIRTHDATE.month ||
    (month === BIRTHDATE.month && on.getDate() < BIRTHDATE.day);
  return beforeBirthday ? years - 1 : years;
}
