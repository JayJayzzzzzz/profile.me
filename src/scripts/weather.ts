/** Fills `#weather` with the current conditions at LOCATION (Open-Meteo, no key). */
import { LOCATION } from "../config";

/** WMO weather codes → an adjective that reads after "…, 20°C, ___ for me…". */
const CONDITIONS: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "foggy",
  51: "drizzly",
  53: "drizzly",
  55: "drizzly",
  56: "sleeting",
  57: "sleeting",
  61: "rainy",
  63: "rainy",
  65: "pouring",
  66: "sleeting",
  67: "sleeting",
  71: "snowy",
  73: "snowy",
  75: "snowy",
  77: "flurrying",
  80: "showery",
  81: "showery",
  82: "stormy",
  85: "snowy",
  86: "snowy",
  95: "stormy",
  96: "stormy",
  99: "stormy",
};

export function initWeather(): void {
  const el = document.getElementById("weather");
  if (!el) return;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}` +
    "&current=temperature_2m,weather_code&timezone=auto";

  fetch(url)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((body: { current?: { temperature_2m?: number; weather_code?: number } }) => {
      const temp = Math.round(body.current?.temperature_2m ?? NaN);
      if (Number.isNaN(temp)) return;
      const condition = CONDITIONS[body.current?.weather_code ?? -1];
      // Woven into "It is <clock><weather> for me in …" — a parenthetical, so it
      // never leaves an orphaned word at a line break.
      el.innerHTML = ` and <b>${temp}°C</b>${condition ? `, ${condition},` : ""}`;
      el.hidden = false;
    })
    .catch(() => {
      /* leave the sentence as-is */
    });
}
