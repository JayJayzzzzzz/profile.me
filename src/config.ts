/** Public configuration for the landing page. */

/** Discord user ID — resolved to a live avatar through the Lanyard API. */
export const DISCORD_USER_ID = "483999801034145793";

/**
 * The in-page Discord profile popout (opened from the Discord icon).
 *
 * Live data is stitched together from three public, auth-free endpoints at
 * runtime — Lanyard (status / activity / avatar decoration / name styling),
 * dstn.to's profile proxy (banner, bio, pronouns, badges, profile-effect SKU),
 * and Discord's store listing for that SKU (the animated effect's layers). The
 * values below are only fallbacks / switches. "Member since" is derived from
 * the user-ID snowflake.
 */
export const DISCORD_PROFILE: {
  /** Banner strip colour shown until (or instead of) the live banner. */
  bannerColor: string;
  /** Popout background shown until the live profile theme colours load. */
  themeColor: string;
  /** Set false to skip fetching and rendering the animated profile effect. */
  profileEffect: boolean;
} = {
  bannerColor: "#18191c",
  themeColor: "#1e1a24",
  profileEffect: true,
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
