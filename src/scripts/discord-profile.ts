/**
 * In-page recreation of JayJayzzzzzz's Discord profile popout, opened from the
 * Discord icon in the link row.
 *
 * Data sources, all public and auth-free, fetched client-side when the popout
 * first opens (then cached for the session):
 *   - Lanyard .............. status, activities, avatar + decoration, name style
 *   - dstn.to profile proxy  banner, bio, pronouns, badges, profile-effect SKU,
 *                            profile theme colours
 *   - Discord store listing  the animated profile effect's image layers
 *
 * The call to action is "Copy username": a raw discord.com/users/<id> link is
 * useless to anyone who shares no server with him.
 */
import { DISCORD_USER_ID, DISCORD_PROFILE } from "../config";

const LANYARD_ENDPOINT = "https://api.lanyard.rest/v1/users";
const PROFILE_ENDPOINT = "https://dcdn.dstn.to/profile";
const SKU_ENDPOINT = "https://discord.com/api/v9/store/published-listings/skus";
const CDN = "https://cdn.discordapp.com";
const DISCORD_EPOCH = 1420070400000;

interface Emoji {
  id?: string;
  name?: string;
  animated?: boolean;
}

interface Activity {
  type: number;
  name: string;
  details?: string;
  state?: string;
  application_id?: string;
  emoji?: Emoji;
  timestamps?: { start?: number; end?: number };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
}

interface LanyardData {
  discord_status: "online" | "idle" | "dnd" | "offline";
  discord_user: {
    id: string;
    username: string;
    global_name: string | null;
    display_name?: string | null;
    discriminator?: string;
    avatar: string | null;
    avatar_decoration_data?: { asset: string } | null;
    display_name_styles?: {
      colors?: number[];
      font_id?: number;
      effect_id?: number;
    } | null;
    primary_guild?: {
      tag?: string | null;
      badge?: string | null;
      identity_guild_id?: string | null;
    } | null;
  };
  activities: Activity[];
  spotify?: {
    song: string;
    artist: string;
    album_art_url: string;
    timestamps?: { start: number; end: number };
  } | null;
  listening_to_spotify?: boolean;
}

interface EffectLayer {
  src: string;
  loop?: boolean;
  start?: number;
  duration?: number;
  loop_delay?: number;
  z_index?: number;
}

interface EffectItem {
  effects: EffectLayer[];
  reduced_motion_src?: string;
  static_frame_src?: string;
}

interface ProfileData {
  banner?: string | null;
  banner_color?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  theme_colors?: number[] | null;
  badges?: { id: string; icon: string; description: string }[] | null;
  profile_effect_sku?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

/** Discord "Display Name Styles" font_id → Google Fonts family. */
const NAME_FONTS: Record<number, string> = {
  1: "Bangers",
  2: "BioRhyme",
  3: "Cherry Bomb One",
  4: "Chicle",
  6: "MuseoModerno",
  8: "Pixelify Sans",
  12: "Zilla Slab",
  13: "Playpen Sans",
  14: "Orbitron",
  15: "New Rocker",
  16: "Kalam",
};

/** display_name_styles effect_id values. */
const EFFECT_GRADIENT = 2;
const EFFECT_NEON = 3;
const EFFECT_GLOW = 6;

let lanyard: LanyardData | null = null;
let profile: ProfileData | null = null;
let effect: EffectItem | null = null;
let loaded = false;
let loading: Promise<void> | null = null;

let backdrop: HTMLDivElement | null = null;
let lastTrigger: HTMLElement | null = null;
let ticker = 0;
let effectTimers: number[] = [];

export function initDiscordProfile(): void {
  if (!/^\d{17,20}$/.test(DISCORD_USER_ID)) return;

  const trigger = document.querySelector<HTMLAnchorElement>(
    '.link a[data-action="discord"]',
  );
  if (!trigger) return;

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    lastTrigger = trigger;
    open();
  });
}

function open(): void {
  if (!backdrop) backdrop = buildShell();
  document.body.appendChild(backdrop);
  document.body.classList.add("dp-open");
  backdrop.getBoundingClientRect(); // flush styles so the transition runs
  backdrop.setAttribute("data-open", "");
  (backdrop.querySelector(".dp-popout") as HTMLElement | null)?.focus();

  if (loaded) {
    render();
  } else {
    showNote("Loading…");
    (loading ??= load()).then(() => {
      if (isOpen()) render();
    });
  }
}

function close(): void {
  if (!backdrop) return;
  backdrop.removeAttribute("data-open");
  document.body.classList.remove("dp-open");
  stopTimers();

  const node = backdrop;
  node.addEventListener(
    "transitionend",
    () => {
      if (!node.hasAttribute("data-open")) node.remove();
    },
    { once: true },
  );
  lastTrigger?.focus();
}

function isOpen(): boolean {
  return !!backdrop?.hasAttribute("data-open");
}

function stopTimers(): void {
  window.clearInterval(ticker);
  effectTimers.forEach((id) => {
    window.clearTimeout(id);
    window.clearInterval(id);
  });
  effectTimers = [];
}

/* --- Data ------------------------------------------------------------------ */

async function load(): Promise<void> {
  const [lanyardResult, profileResult] = await Promise.allSettled([
    fetchLanyard(),
    fetchProfile(),
  ]);

  if (lanyardResult.status === "fulfilled") lanyard = lanyardResult.value;
  if (profileResult.status === "fulfilled") profile = profileResult.value;

  if (DISCORD_PROFILE.profileEffect && profile?.profile_effect_sku) {
    effect = await fetchEffect(profile.profile_effect_sku).catch(() => null);
  }

  loaded = true;
}

async function fetchLanyard(): Promise<LanyardData> {
  const response = await fetch(`${LANYARD_ENDPOINT}/${DISCORD_USER_ID}`);
  const body = (await response.json()) as { success: boolean; data?: LanyardData };
  if (!body.success || !body.data) throw new Error("lanyard");
  return body.data;
}

async function fetchProfile(): Promise<ProfileData> {
  const response = await fetch(`${PROFILE_ENDPOINT}/${DISCORD_USER_ID}`);
  if (!response.ok) throw new Error("profile");
  const body = await response.json();
  return {
    banner: body?.user?.banner ?? null,
    banner_color: body?.user?.banner_color ?? null,
    bio: body?.user_profile?.bio ?? body?.user?.bio ?? null,
    pronouns: body?.user_profile?.pronouns ?? null,
    theme_colors: body?.user_profile?.theme_colors ?? null,
    badges: Array.isArray(body?.badges) ? body.badges : null,
    profile_effect_sku: body?.user_profile?.profile_effect?.sku_id ?? null,
  };
}

async function fetchEffect(sku: string): Promise<EffectItem | null> {
  const response = await fetch(`${SKU_ENDPOINT}/${sku}`);
  if (!response.ok) throw new Error("sku");
  const body = await response.json();
  const item = body?.sku?.tenant_metadata?.collectibles?.item;
  return item?.effects?.length ? (item as EffectItem) : null;
}

/* --- Render -------------------------------------------------------------- */

function content(): HTMLElement {
  return backdrop!.querySelector(".dp-content") as HTMLElement;
}

function popout(): HTMLElement {
  return backdrop!.querySelector(".dp-popout") as HTMLElement;
}

function showNote(text: string): void {
  content().innerHTML = `<p class="dp-note">${escapeHtml(text)}</p>`;
}

function buildShell(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "dp-backdrop";
  el.innerHTML = `
    <div class="dp-popout" role="dialog" aria-modal="true" aria-label="Discord profile" tabindex="-1">
      <div class="dp-banner"></div>
      <button class="dp-close" type="button" aria-label="Close">&times;</button>
      <div class="dp-content"></div>
    </div>`;

  el.addEventListener("click", (event) => {
    if (event.target === el) close();
  });
  el.querySelector(".dp-close")?.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) close();
  });
  return el;
}

function render(): void {
  stopTimers();

  if (!lanyard) {
    showNote("Could not reach Discord right now.");
    return;
  }

  const user = lanyard.discord_user;
  const displayName = user.global_name || user.display_name || user.username;
  const handle =
    user.discriminator && user.discriminator !== "0"
      ? `${user.username}#${user.discriminator}`
      : `@${user.username}`;

  paintTheme();
  paintBanner();

  const avatarExt = user.avatar?.startsWith("a_") ? "gif" : "png";
  const avatar = user.avatar
    ? `${CDN}/avatars/${user.id}/${user.avatar}.${avatarExt}?size=160`
    : `${CDN}/embed/avatars/0.png`;

  const decoration = user.avatar_decoration_data
    ? `<img class="dp-avatar-deco" alt="" src="${CDN}/avatar-decoration-presets/${escapeHtml(
        user.avatar_decoration_data.asset,
      )}.png?size=160">`
    : "";

  const custom = lanyard.activities?.find((entry) => entry.type === 4);
  const rich = renderRichActivity();

  const sections: string[] = [];
  if (rich) sections.push(rich);
  if (profile?.bio) {
    sections.push(
      `<div class="dp-section"><h3>Bio</h3><p class="dp-bio">${escapeHtml(
        profile.bio,
      )}</p></div>`,
    );
  }
  sections.push(
    `<div class="dp-section"><h3>Member Since</h3><p>${memberSince(user.id)}</p></div>`,
  );

  content().innerHTML = `
    <div class="dp-header">
      <div class="dp-avatar-wrap">
        <img class="dp-avatar" alt="${escapeHtml(displayName)}" src="${avatar}">
        ${decoration}
        <span class="dp-status" data-status="${lanyard.discord_status}" title="${
          STATUS_LABEL[lanyard.discord_status] ?? ""
        }"></span>
        ${custom ? renderCustomStatus(custom) : ""}
      </div>
      <div class="dp-display-name">${escapeHtml(displayName)}</div>
      <div class="dp-identity">
        <span>${escapeHtml(handle)}</span>
        ${profile?.pronouns ? `<span class="dp-dot">•</span><span>${escapeHtml(profile.pronouns)}</span>` : ""}
        ${renderServerTag(user.primary_guild)}
      </div>
      ${renderBadges()}
    </div>
    <div class="dp-actions">
      <button class="dp-btn" type="button" data-copy="${escapeHtml(user.username)}">Copy username</button>
      <button class="dp-btn secondary" type="button" data-copy="${escapeHtml(user.id)}">Copy user ID</button>
    </div>
    <div class="dp-card">${sections.join('<div class="dp-divider"></div>')}</div>`;

  paintDisplayNameStyle(user.display_name_styles);

  content()
    .querySelectorAll<HTMLButtonElement>("[data-copy]")
    .forEach((button) => button.addEventListener("click", () => copy(button)));

  if (rich) startTicker();
  if (effect) playEffect(effect);
}

function paintTheme(): void {
  const node = popout();
  const colors = profile?.theme_colors;
  if (colors && colors.length >= 2) {
    node.style.background = `linear-gradient(180deg, ${rgb(colors[0])} 0%, ${rgb(
      colors[1],
      0.35,
    )} 100%)`;
    node.style.setProperty("--dp-ring", rgb(colors[0]));
  } else {
    node.style.background = DISCORD_PROFILE.themeColor;
    node.style.setProperty("--dp-ring", DISCORD_PROFILE.themeColor);
  }
}

function paintBanner(): void {
  const banner = backdrop!.querySelector<HTMLElement>(".dp-banner");
  if (!banner) return;

  const hash = profile?.banner;
  const color =
    profile?.banner_color || DISCORD_PROFILE.bannerColor || "#18191c";

  if (hash) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    const url = `${CDN}/banners/${DISCORD_USER_ID}/${hash}.${ext}?size=600`;
    banner.style.background = `center / cover no-repeat url("${url}"), ${color}`;
  } else {
    banner.style.background = color;
  }
}

function paintDisplayNameStyle(
  styles: LanyardData["discord_user"]["display_name_styles"],
): void {
  const name = content().querySelector<HTMLElement>(".dp-display-name");
  if (!name || !styles) return;

  const family = styles.font_id != null ? NAME_FONTS[styles.font_id] : undefined;
  if (family) {
    ensureFont(family);
    name.style.fontFamily = `"${family}", var(--highlight-font, sans-serif)`;
    name.style.fontWeight = "400";
    name.style.letterSpacing = "0.02em";
  }

  const colors = styles.colors ?? [];
  const effect = styles.effect_id ?? 1;

  if (colors.length >= 2 && (effect === EFFECT_GRADIENT || effect === EFFECT_GLOW)) {
    name.style.background = `linear-gradient(90deg, ${colors
      .map((value) => rgb(value))
      .join(", ")})`;
    name.style.webkitBackgroundClip = "text";
    name.style.backgroundClip = "text";
    name.style.color = "transparent";
  } else if (colors.length) {
    name.style.color = rgb(colors[0]);
  }

  if (colors.length && (effect === EFFECT_NEON || effect === EFFECT_GLOW)) {
    const glow = rgb(colors[0], 1, 0.85);
    name.style.textShadow = `0 0 4px ${glow}, 0 0 12px ${glow}, 0 0 24px ${rgb(
      colors[0],
      1,
      0.55,
    )}`;
  }
}

function ensureFont(family: string): void {
  const id = `dp-font-${family.replace(/\W+/g, "")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(
    / /g,
    "+",
  )}&display=swap`;
  document.head.appendChild(link);
}

function renderBadges(): string {
  const badges = profile?.badges;
  if (!badges?.length) return "";
  const items = badges
    .filter((badge) => badge.icon)
    .map(
      (badge) =>
        `<img class="dp-badge" src="${CDN}/badge-icons/${escapeHtml(
          badge.icon,
        )}.png" alt="${escapeHtml(badge.description)}" title="${escapeHtml(
          badge.description,
        )}" loading="lazy">`,
    )
    .join("");
  return items ? `<div class="dp-badges">${items}</div>` : "";
}

function renderServerTag(
  guild: LanyardData["discord_user"]["primary_guild"],
): string {
  if (!guild?.tag) return "";
  const badge =
    guild.badge && guild.identity_guild_id
      ? `<img alt="" src="${CDN}/clan-badges/${guild.identity_guild_id}/${escapeHtml(
          guild.badge,
        )}.png?size=16" onerror="this.remove()">`
      : "";
  return `<span class="dp-tag">${badge}${escapeHtml(guild.tag)}</span>`;
}

function renderCustomStatus(activity: Activity): string {
  const emoji = activity.emoji;
  let icon = "";
  if (emoji?.id) {
    const ext = emoji.animated ? "gif" : "png";
    icon = `<img alt="" src="${CDN}/emojis/${emoji.id}.${ext}?size=24">`;
  } else if (emoji?.name) {
    icon = `<span>${escapeHtml(emoji.name)}</span>`;
  }
  const text = activity.state ? escapeHtml(activity.state) : "";
  if (!icon && !text) return "";
  return `<div class="dp-custom-status">${icon}<span>${text}</span></div>`;
}

function renderRichActivity(): string {
  if (!lanyard) return "";

  if (lanyard.listening_to_spotify && lanyard.spotify) {
    const spotify = lanyard.spotify;
    const bar = spotify.timestamps
      ? `<div class="dp-progress" data-start="${spotify.timestamps.start}" data-end="${spotify.timestamps.end}"><i></i></div>`
      : "";
    return `
      <div class="dp-section">
        <h3>Listening to Spotify</h3>
        <div class="dp-activity">
          <div class="dp-activity-art">
            <img class="large" alt="" src="${escapeHtml(spotify.album_art_url)}">
          </div>
          <div class="dp-activity-info">
            <span class="name">${escapeHtml(spotify.song)}</span>
            <span class="line">by ${escapeHtml(spotify.artist)}</span>
            ${bar}
          </div>
        </div>
      </div>`;
  }

  const activity = lanyard.activities?.find((entry) => entry.type !== 4);
  if (!activity) return "";

  const header =
    activity.type === 2
      ? "Listening to"
      : activity.type === 3
        ? "Watching"
        : activity.type === 5
          ? "Competing in"
          : "Playing a Game";

  const large = assetUrl(activity.assets?.large_image, activity.application_id);
  const small = assetUrl(activity.assets?.small_image, activity.application_id);
  const art = large
    ? `<div class="dp-activity-art">
         <img class="large" alt="${escapeHtml(activity.assets?.large_text ?? "")}" src="${large}">
         ${small ? `<img class="small" alt="${escapeHtml(activity.assets?.small_text ?? "")}" src="${small}">` : ""}
       </div>`
    : "";

  const lines = [activity.details, activity.state]
    .filter((line): line is string => !!line)
    .map((line) => `<span class="line">${escapeHtml(line)}</span>`)
    .join("");

  const stamp = activity.timestamps?.start
    ? `<span class="line dp-elapsed" data-start="${activity.timestamps.start}"></span>`
    : "";

  return `
    <div class="dp-section">
      <h3>${header}</h3>
      <div class="dp-activity">
        ${art}
        <div class="dp-activity-info">
          <span class="name">${escapeHtml(activity.name)}</span>
          ${lines}
          ${stamp}
        </div>
      </div>
    </div>`;
}

function assetUrl(image: string | undefined, appId?: string): string | null {
  if (!image) return null;
  if (image.startsWith("mp:")) return `https://media.discordapp.net/${image.slice(3)}`;
  if (image.startsWith("spotify:")) return `https://i.scdn.co/image/${image.slice(8)}`;
  if (appId) return `${CDN}/app-assets/${appId}/${image}.png`;
  return null;
}

/* --- Animated profile effect ------------------------------------------- */

function playEffect(item: EffectItem): void {
  const stage = document.createElement("div");
  stage.className = "dp-effect";
  stage.setAttribute("aria-hidden", "true");
  popout().appendChild(stage);

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (item.reduced_motion_src || item.static_frame_src) {
      const still = new Image();
      still.alt = "";
      still.src = (item.reduced_motion_src || item.static_frame_src) as string;
      stage.appendChild(still);
    }
    return;
  }

  item.effects.forEach((layer) => {
    const slot = document.createElement("div");
    slot.className = "dp-effect-slot";
    slot.style.zIndex = String(layer.z_index ?? 100);
    stage.appendChild(slot);

    // Re-mounting a fresh <img> restarts the APNG from its first frame.
    const paint = () => {
      const frame = new Image();
      frame.alt = "";
      slot.replaceChildren(frame);
      frame.src = layer.src;
    };

    const begin = () => {
      paint();
      if (layer.loop) {
        const period = Math.max(
          1000,
          (layer.duration ?? 6000) + (layer.loop_delay ?? 0),
        );
        effectTimers.push(window.setInterval(paint, period));
      }
    };

    if (layer.start && layer.start > 0) {
      effectTimers.push(window.setTimeout(begin, layer.start));
    } else {
      begin();
    }
  });
}

/* --- Live tickers ----------------------------------------------------- */

function startTicker(): void {
  const update = () => {
    const now = Date.now();

    const elapsed = content().querySelector<HTMLElement>(".dp-elapsed");
    if (elapsed?.dataset.start) {
      elapsed.textContent = `${formatDuration(now - Number(elapsed.dataset.start))} elapsed`;
    }

    const bar = content().querySelector<HTMLElement>(".dp-progress");
    if (bar?.dataset.start && bar.dataset.end) {
      const start = Number(bar.dataset.start);
      const end = Number(bar.dataset.end);
      const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
    }
  };

  update();
  ticker = window.setInterval(update, 1000);
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function memberSince(id: string): string {
  const created = Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
  return new Date(created).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* --- Clipboard ------------------------------------------------------- */

function copy(button: HTMLButtonElement): void {
  const value = button.dataset.copy ?? "";
  const original = button.textContent ?? "";
  const done = () => {
    button.textContent = "Copied!";
    button.classList.add("copied");
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove("copied");
    }, 1500);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(done, () => fallbackCopy(value, done));
  } else {
    fallbackCopy(value, done);
  }
}

function fallbackCopy(value: string, done: () => void): void {
  const area = document.createElement("textarea");
  area.value = value;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    /* nothing else we can do */
  }
  area.remove();
}

/* --- Helpers ------------------------------------------------------- */

function rgb(value: number, scale = 1, alpha = 1): string {
  const channel = (shift: number) =>
    Math.round(Math.min(255, Math.max(0, ((value >> shift) & 255) * scale)));
  return `rgba(${channel(16)}, ${channel(8)}, ${channel(0)}, ${alpha})`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );
}
