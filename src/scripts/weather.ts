/** Fills `#weather` with the current conditions at LOCATION (Open-Meteo, no key). */
import { LOCATION } from "../config";

const CONDITIONS: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "in freezing fog",
  51: "drizzling",
  53: "drizzling",
  55: "drizzling",
  56: "in freezing drizzle",
  57: "in freezing drizzle",
  61: "raining",
  63: "raining",
  65: "pouring",
  66: "in freezing rain",
  67: "in freezing rain",
  71: "snowing",
  73: "snowing",
  75: "snowing hard",
  77: "spitting snow",
  80: "showery",
  81: "showery",
  82: "in heavy showers",
  85: "in snow showers",
  86: "in snow showers",
  95: "storming",
  96: "storming with hail",
  99: "storming with hail",
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
      el.innerHTML = ` It's <b>${temp}°C</b>${condition ? ` and ${condition}` : ""} right now.`;
      el.hidden = false;
    })
    .catch(() => {
      /* leave the sentence as-is */
    });
}
