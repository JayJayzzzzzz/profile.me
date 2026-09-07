/** Public configuration for the landing page. */

/** Discord user ID — resolved to a live avatar through the Lanyard API. */
export const DISCORD_USER_ID = "483999801034145793";

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
