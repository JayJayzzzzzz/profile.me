/**
 * profile.me API proxy — Cloudflare Worker.
 *
 * Fronts the three APIs that need a secret credential and so cannot be called
 * from the static site directly:
 *
 *   GET    /osu       → osu! v2 user statistics       (OSU_CLIENT_ID / OSU_CLIENT_SECRET)
 *   GET    /steam     → Steam summary + recent games  (STEAM_API_KEY / STEAM_ID)
 *   GET    /spotify   → recently played tracks        (SPOTIFY_CLIENT_ID /
 *                                                      SPOTIFY_CLIENT_SECRET /
 *                                                      SPOTIFY_REFRESH_TOKEN)
 *   GET    /guestbook → recent guestbook entries      (D1 binding DB)
 *   POST   /guestbook → leave an entry                (D1 binding DB)
 *   DELETE /guestbook?id=… → remove one               (GUESTBOOK_ADMIN_TOKEN)
 *
 * The read-only proxy responses are small, public JSON and edge-cached for
 * CACHE_SECONDS (default 300); the guestbook is never cached. ALLOWED_ORIGIN
 * locks CORS to the site and defaults to "*". See worker/README.md for setup.
 */

export interface Env {
  OSU_CLIENT_ID?: string;
  OSU_CLIENT_SECRET?: string;
  OSU_USER_ID?: string;
  STEAM_API_KEY?: string;
  STEAM_ID?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_REFRESH_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
  CACHE_SECONDS?: string;
  DB?: D1Database;
  GUESTBOOK_ADMIN_TOKEN?: string;
}

/** osu! guest tokens last ~24h; cache one per isolate. */
let osuToken: { value: string; expires: number } | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ALLOWED_ORIGIN is a comma-separated allowlist. A matching request Origin is
    // echoed back; anything else falls through to the first entry (so an unknown
    // site's browser blocks the response). "*" allows everyone.
    const allowlist = (env.ALLOWED_ORIGIN || "*").split(",").map((s) => s.trim());
    const requestOrigin = request.headers.get("Origin") || "";
    const cors: Record<string, string> = {
      "Access-Control-Allow-Origin": allowlist.includes("*")
        ? "*"
        : allowlist.includes(requestOrigin)
          ? requestOrigin
          : allowlist[0],
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const route = url.pathname.replace(/\/+$/, "") || "/";

    // Guestbook — its own read/write handling, never edge-cached.
    if (route === "/guestbook") return guestbook(request, env, cors);

    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);

    if (route === "/") {
      return json({ ok: true, routes: ["/osu", "/steam", "/spotify", "/guestbook"] }, 200, cors);
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    // A second, long-lived copy of the last good payload — served if the
    // upstream is briefly down or rate-limiting us (osu! OAuth loves a 429).
    const staleKey = new Request(`${url.origin}${url.pathname}/__last_good`, { method: "GET" });

    const hit = await cache.match(cacheKey);
    if (hit) return withCors(hit, cors);

    let payload: unknown;
    try {
      if (route === "/osu") payload = await osu(env);
      else if (route === "/steam") payload = await steam(env);
      else if (route === "/spotify") payload = await spotify(env);
      else return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      const stale = await cache.match(staleKey);
      if (stale) {
        const body = await stale.text();
        return new Response(body, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...cors,
            "Cache-Control": "public, max-age=30",
            "X-Stale": "1",
          },
        });
      }
      return json({ error: "upstream_failed", detail: String(err) }, 502, cors);
    }

    // Spotify carries "now playing", so keep it fresher than the rest.
    const ttl = route === "/spotify" ? 45 : Number(env.CACHE_SECONDS) || 300;
    const body = JSON.stringify(payload);
    const response = new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...cors,
        "Cache-Control": `public, max-age=${ttl}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    ctx.waitUntil(
      cache.put(
        staleKey,
        new Response(body, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        }),
      ),
    );
    return response;
  },
};

/* --- Guestbook --------------------------------------------------------- */

const GB_MAX_NAME = 40;
const GB_MAX_MESSAGE = 500;
const GB_MIN_FILL_MS = 2500; // a human takes at least this long to write something
const GB_WINDOW_MS = 60 * 60 * 1000;
const GB_WINDOW_MAX = 3; // entries per IP per hour
const GB_LINK_RE =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|ru|xyz|top|link|shop|info|biz)\b)/i;

interface GbEntry {
  name: string;
  message: string;
  country: string | null;
  created_at: string;
}

async function guestbook(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const headers = { ...cors, "Cache-Control": "no-store" };
  if (!env.DB) return json({ error: "guestbook_not_configured" }, 503, headers);

  try {
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT name, message, country, created_at
           FROM guestbook ORDER BY created_at DESC LIMIT 100`,
      ).all<GbEntry>();
      return json({ entries: results ?? [] }, 200, headers);
    }

    if (request.method === "DELETE") {
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.GUESTBOOK_ADMIN_TOKEN || token !== env.GUESTBOOK_ADMIN_TOKEN) {
        return json({ error: "unauthorized" }, 401, headers);
      }
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return json({ error: "missing_id" }, 400, headers);
      const res = await env.DB.prepare(`DELETE FROM guestbook WHERE id = ?`).bind(id).run();
      return json({ deleted: res.meta.changes ?? 0 }, 200, headers);
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; message?: unknown; website?: unknown; elapsed?: unknown }
      | null;
    if (!body) return json({ error: "bad_json" }, 400, headers);

    // Honeypot + fill-time — bots complete hidden fields and submit instantly.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return json({ error: "rejected" }, 422, headers);
    }
    if (
      typeof body.elapsed === "number" &&
      body.elapsed >= 0 &&
      body.elapsed < GB_MIN_FILL_MS
    ) {
      return json({ error: "rejected" }, 422, headers);
    }

    const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
    const message = String(body.message ?? "").replace(/\r\n/g, "\n").trim();
    if (!name || !message) return json({ error: "empty" }, 422, headers);
    if (name.length > GB_MAX_NAME || message.length > GB_MAX_MESSAGE) {
      return json({ error: "too_long" }, 422, headers);
    }
    if (GB_LINK_RE.test(name) || GB_LINK_RE.test(message)) {
      return json({ error: "contains_link" }, 422, headers);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const iphash = await sha256(`${ip}|${env.GUESTBOOK_ADMIN_TOKEN ?? "pm"}`);
    const since = new Date(Date.now() - GB_WINDOW_MS).toISOString();
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM guestbook WHERE iphash = ? AND created_at > ?`,
    )
      .bind(iphash, since)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= GB_WINDOW_MAX) {
      return json({ error: "rate_limited" }, 429, headers);
    }

    const country = (request.headers.get("CF-IPCountry") || "").toUpperCase();
    const entry: GbEntry = {
      name,
      message,
      country: /^[A-Z]{2}$/.test(country) ? country : null,
      created_at: new Date().toISOString(),
    };
    await env.DB.prepare(
      `INSERT INTO guestbook (id, name, message, country, iphash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), entry.name, entry.message, entry.country, iphash, entry.created_at)
      .run();

    return json({ entry }, 201, headers);
  } catch (err) {
    return json({ error: "guestbook_failed", detail: String(err) }, 500, headers);
  }
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* --- osu! ---------------------------------------------------------------- */

async function osu(env: Env): Promise<unknown> {
  const id = env.OSU_USER_ID;
  if (!env.OSU_CLIENT_ID || !env.OSU_CLIENT_SECRET || !id) throw new Error("osu_not_configured");

  const token = await osuAccessToken(env);
  const auth = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const user = (await fetch(`https://osu.ppy.sh/api/v2/users/${id}/osu?key=id`, {
    headers: auth,
  }).then(expectJson)) as any;

  const best = (await fetch(
    `https://osu.ppy.sh/api/v2/users/${id}/scores/best?mode=osu&limit=1`,
    { headers: auth },
  )
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])) as any[];

  const s = user.statistics ?? {};
  const top = best[0];

  return {
    username: user.username,
    avatar_url: user.avatar_url,
    country_code: user.country_code,
    is_online: user.is_online ?? false,
    join_date: user.join_date ?? null,
    pp: Math.round(s.pp ?? 0),
    global_rank: s.global_rank ?? null,
    country_rank: s.country_rank ?? null,
    accuracy: s.hit_accuracy ?? null,
    play_count: s.play_count ?? 0,
    play_time: s.play_time ?? 0,
    max_combo: s.maximum_combo ?? 0,
    ranked_score: s.ranked_score ?? 0,
    level: s.level ?? { current: 0, progress: 0 },
    grade_counts: s.grade_counts ?? null,
    top_play: top
      ? {
          title: `${top.beatmapset?.artist ?? ""} - ${top.beatmapset?.title ?? ""} [${
            top.beatmap?.version ?? ""
          }]`,
          pp: Math.round(top.pp ?? 0),
          accuracy: top.accuracy ?? 0,
          mods: top.mods ?? [],
          rank: top.rank ?? null,
          url: top.beatmap?.url ?? null,
        }
      : null,
  };
}

/** Shared across isolates so we hit osu!'s heavily rate-limited token
 *  endpoint about once a day, not once per cold isolate.
 *
 *  This can't use `caches.default` — that's a no-op on workers.dev
 *  subdomains (only custom domains get a functional edge cache), which was
 *  silently forcing a fresh token request — and a 429 from osu! — on almost
 *  every call. D1 is durable regardless of domain. */
const OSU_TOKEN_KV_KEY = "osu_token";

async function osuAccessToken(env: Env): Promise<string> {
  if (osuToken && osuToken.expires > Date.now() + 60_000) return osuToken.value;

  const saved = await kvGet(env, OSU_TOKEN_KV_KEY);
  if (saved && saved.expires > Date.now() + 60_000) {
    osuToken = saved;
    return saved.value;
  }

  const res = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.OSU_CLIENT_ID,
      client_secret: env.OSU_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "public",
    }),
  });
  if (!res.ok) throw new Error(`osu_token_${res.status}`);

  const body = (await res.json()) as any;
  const lifetime = body.expires_in ?? 3600;
  osuToken = { value: body.access_token, expires: Date.now() + lifetime * 1000 };
  await kvPut(env, OSU_TOKEN_KV_KEY, osuToken, osuToken.expires);
  return osuToken.value;
}

/** Minimal durable key/value cache backed by D1's `kv_cache` table — a
 *  stand-in for `caches.default`, which doesn't work on workers.dev. */
async function kvGet(env: Env, key: string): Promise<{ value: string; expires: number } | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(`SELECT value, expires FROM kv_cache WHERE key = ?`)
    .bind(key)
    .first<{ value: string; expires: number }>();
  if (!row) return null;
  return JSON.parse(row.value);
}

async function kvPut(env: Env, key: string, value: unknown, expires: number): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO kv_cache (key, value, expires) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires`,
  )
    .bind(key, JSON.stringify(value), expires)
    .run();
}

/* --- Steam ------------------------------------------------------------- */

async function steam(env: Env): Promise<unknown> {
  const key = env.STEAM_API_KEY;
  let id = env.STEAM_ID;
  if (!key || !id) throw new Error("steam_not_configured");

  if (!/^\d{17}$/.test(id)) {
    const resolved = (await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(
        id,
      )}`,
    ).then(expectJson)) as any;
    if (resolved?.response?.steamid) id = resolved.response.steamid;
    else throw new Error("steam_vanity_unresolved");
  }

  const [summary, recent, owned, level, badges] = await Promise.all([
    fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${id}`,
    ).then(expectJson) as Promise<any>,
    fetch(
      `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${id}&count=8`,
    ).then(expectJson) as Promise<any>,
    fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${id}&include_played_free_games=1&include_appinfo=1`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<any>,
    fetch(
      `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${id}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<any>,
    fetch(
      `https://api.steampowered.com/IPlayerService/GetBadges/v1/?key=${key}&steamid=${id}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<any>,
  ]);

  const p = summary?.response?.players?.[0] ?? {};

  const shape = (g: any) => ({
    appid: g.appid,
    name: g.name,
    icon: g.img_icon_url
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
      : null,
    header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
    playtime_2weeks: g.playtime_2weeks ?? 0,
    playtime_forever: g.playtime_forever ?? 0,
  });

  const ownedGames: any[] = owned?.response?.games ?? [];
  const mostPlayed = [...ownedGames]
    .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
    .slice(0, 5)
    .map(shape);
  const totalMinutes = ownedGames.reduce(
    (sum, g) => sum + (g.playtime_forever ?? 0),
    0,
  );

  return {
    persona: p.personaname ?? null,
    realname: p.realname ?? null,
    avatar: p.avatarfull ?? null,
    profile_url: p.profileurl ?? null,
    country: p.loccountrycode ?? null,
    created: p.timecreated ?? null,
    state: p.personastate ?? 0,
    playing: p.gameextrainfo ?? null,
    playing_id: p.gameid ?? null,
    playing_header: p.gameid
      ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${p.gameid}/header.jpg`
      : null,
    last_logoff: p.lastlogoff ?? null,
    steam_level: level?.response?.player_level ?? badges?.response?.player_level ?? null,
    badge_count: Array.isArray(badges?.response?.badges)
      ? badges.response.badges.length
      : null,
    game_count: owned?.response?.game_count ?? ownedGames.length ?? null,
    total_minutes: totalMinutes || null,
    recent: (recent?.response?.games ?? []).map(shape),
    most_played: mostPlayed,
  };
}

/* --- Spotify --------------------------------------------------------- */

async function spotify(env: Env): Promise<unknown> {
  const cid = env.SPOTIFY_CLIENT_ID;
  const secret = env.SPOTIFY_CLIENT_SECRET;
  const refresh = env.SPOTIFY_REFRESH_TOKEN;
  if (!cid || !secret || !refresh) throw new Error("spotify_not_configured");

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${cid}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  if (!tokenRes.ok) throw new Error(`spotify_token_${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as any;
  const auth = { Authorization: `Bearer ${access_token}` };

  const get = (path: string): Promise<any> =>
    fetch(`https://api.spotify.com/v1${path}`, { headers: auth }).then((r) =>
      r.ok ? (r.json() as Promise<any>) : null,
    );

  // Each call may 403 if its scope wasn't granted — tolerate that individually.
  const [meRaw, nowRaw, recentRaw, topTracksRaw, topArtistsRaw] = await Promise.all([
    get("/me").catch(() => null),
    get("/me/player/currently-playing").catch(() => null),
    get("/me/player/recently-played?limit=12").catch(() => null),
    get("/me/top/tracks?limit=5&time_range=medium_term").catch(() => null),
    get("/me/top/artists?limit=6&time_range=medium_term").catch(() => null),
  ]);

  const smallArt = (images: any[]) =>
    images?.slice(-1)[0]?.url ?? images?.[0]?.url ?? null;
  const trackOf = (t: any) =>
    t
      ? {
          name: t.name ?? null,
          artist: (t.artists ?? []).map((a: any) => a.name).join(", "),
          album: t.album?.name ?? null,
          art: smallArt(t.album?.images),
          url: t.external_urls?.spotify ?? null,
          duration_ms: t.duration_ms ?? null,
        }
      : null;

  const now =
    nowRaw && nowRaw.item
      ? {
          ...trackOf(nowRaw.item),
          is_playing: !!nowRaw.is_playing,
          progress_ms: nowRaw.progress_ms ?? 0,
        }
      : null;

  const recent = (recentRaw?.items ?? []).map((it: any) => ({
    ...trackOf(it.track),
    played_at: it.played_at ?? null,
  }));

  const top_tracks = (topTracksRaw?.items ?? []).map(trackOf);

  const top_artists = (topArtistsRaw?.items ?? []).map((a: any) => ({
    name: a.name ?? null,
    image: smallArt(a.images),
    url: a.external_urls?.spotify ?? null,
    genre: (a.genres ?? [])[0] ?? null,
  }));

  return {
    display_name: meRaw?.display_name ?? null,
    profile_url: meRaw?.external_urls?.spotify ?? null,
    avatar: smallArt(meRaw?.images),
    followers: meRaw?.followers?.total ?? null,
    now_playing: now,
    recent,
    top_tracks,
    top_artists,
  };
}

/* --- helpers ------------------------------------------------------- */

async function expectJson(res: Response): Promise<unknown> {
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
