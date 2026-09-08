/**
 * Live data for the Open Graph card.
 *
 * Pulled fresh on every render (the response is only edge-cached for ~90s), from
 * the same sources the site itself uses:
 *
 *   Lanyard  — Discord presence + avatar        (public, no key, most real-time)
 *   Worker   — Spotify / osu! / Steam           (jayjayzzzzzz.me API proxy)
 *
 * Every lookup is best-effort: anything that fails or times out is dropped and
 * the card still renders with whatever came back (at minimum: name + local time).
 */

const DISCORD_USER_ID = process.env.DISCORD_USER_ID || "483999801034145793";
const WORKER =
  process.env.WORKER_ENDPOINT ||
  "https://profile-me-proxy.jayjayzzzzzz.workers.dev";
const LANYARD = `https://api.lanyard.rest/v1/users/${DISCORD_USER_ID}`;
const TIMEZONE = "Europe/Berlin";
const CITY = "Wiesbaden";

export type Status = "online" | "idle" | "dnd" | "offline";

export interface CardData {
  name: string;
  city: string;
  status: Status;
  avatar: string | null; // data: URI, or null → fall back to the monogram disc
  music: { title: string; artist: string; live: boolean } | null;
  osu: { rank: number; pp: number } | null;
  steam: { playing: string } | { level: number } | null;
  time: string; // "02:25"
  tz: string; // "UTC+2"
}

const TIMEOUT_MS = 2500;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function getDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const type = res.headers.get("content-type") || "image/png";
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function localTime(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

function localTz(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  return raw.replace("GMT", "UTC");
}

export async function getData(): Promise<CardData> {
  const now = new Date();
  const data: CardData = {
    name: "jayjayzzzzzz",
    city: CITY,
    status: "offline",
    avatar: null,
    music: null,
    osu: null,
    steam: null,
    time: localTime(now),
    tz: localTz(now),
  };

  const [lanyard, spotify, osu, steam] = await Promise.allSettled([
    getJson(LANYARD),
    getJson(`${WORKER}/spotify`),
    getJson(`${WORKER}/osu`),
    getJson(`${WORKER}/steam`),
  ]);

  if (lanyard.status === "fulfilled" && lanyard.value?.data) {
    const d = lanyard.value.data;
    const s = d.discord_status as string | undefined;
    if (s === "online" || s === "idle" || s === "dnd") data.status = s;

    const user = d.discord_user ?? {};
    if (user.avatar && user.id) {
      // .png resolves for animated (a_…) avatars too — we only need a still frame.
      data.avatar = await getDataUri(
        `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=160`,
      );
    }
  }

  if (spotify.status === "fulfilled" && spotify.value) {
    const sp = spotify.value;
    const np = sp.now_playing;
    const last = Array.isArray(sp.recent) ? sp.recent[0] : null;
    if (np?.name) {
      data.music = { title: np.name, artist: np.artist ?? "", live: !!np.is_playing };
    } else if (last?.name) {
      data.music = { title: last.name, artist: last.artist ?? "", live: false };
    }
  }

  if (osu.status === "fulfilled" && osu.value) {
    const rank = osu.value.global_rank;
    if (typeof rank === "number" && rank > 0) {
      data.osu = { rank, pp: Math.round(osu.value.pp ?? 0) };
    }
  }

  if (steam.status === "fulfilled" && steam.value) {
    const st = steam.value;
    if (typeof st.playing === "string" && st.playing) {
      data.steam = { playing: st.playing };
    } else if (typeof st.steam_level === "number") {
      data.steam = { level: st.steam_level };
    }
  }

  return data;
}
