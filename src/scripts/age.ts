import { ageFrom } from "../config";

/**
 * Recomputes `#age` on load. The server already renders the right number, but
 * a statically cached page could be served across a birthday, so refresh it.
 */
export function initAge(): void {
  const age = document.getElementById("age");
  if (age) age.textContent = String(ageFrom(new Date()));
}
