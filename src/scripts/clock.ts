/** Keeps `#clock` showing the current wall-clock time where JayJayzzzzzz lives. */
import { LOCATION } from "../config";

const TIME_ZONE = LOCATION.timeZone;
const REFRESH_MS = 15_000;

export function initClock(): void {
  const clock = document.getElementById("clock");
  if (!clock) return;

  const render = () => {
    clock.textContent = new Date().toLocaleTimeString("en-GB", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  render();
  setInterval(render, REFRESH_MS);
}
