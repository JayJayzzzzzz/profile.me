/**
 * In-page Steam panel, opened from the Steam icon. Data comes from the worker's
 * `/steam` route; without a configured worker the icon stays a plain link.
 */
import { createPanel, escapeHtml, timeAgo, type Panel } from "./panel";
import { workerFetch, workerReady } from "./worker-api";

interface SteamGame {
  appid: number;
  name: string;
  icon: string | null;
  header: string;
  playtime_2weeks: number;
  playtime_forever: number;
}

interface SteamData {
  persona: string | null;
  realname: string | null;
  avatar: string | null;
  profile_url: string | null;
  country: string | null;
  created: number | null;
  state: number;
  playing: string | null;
  playing_id: string | null;
  playing_header: string | null;
  last_logoff: number | null;
  steam_level: number | null;
  badge_count: number | null;
  game_count: number | null;
  total_minutes: number | null;
  recent: SteamGame[];
  most_played: SteamGame[];
}

const STATES = ["offline", "online", "busy", "away", "snooze", "trading", "playing"];
const FALLBACK = "https://steamcommunity.com/id/jayjayzzzzzz/";

export function initSteam(): void {
  const trigger = document.querySelector<HTMLAnchorElement>('.link a[data-action="steam"]');
  if (!trigger || !workerReady()) return;

  const panel = createPanel({ label: "Steam profile", onOpen: load });
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    panel.open(trigger);
  });
}

function load(panel: Panel): void {
  panel.setBody('<p class="panel-note">Loading Steam profile…</p>');
  workerFetch<SteamData>("/steam")
    .then((data) => {
      if (panel.isOpen()) panel.setBody(render(data));
    })
    .catch(() => {
      if (panel.isOpen()) {
        panel.setBody(
          `<p class="panel-note">Couldn't load Steam data. <a href="${FALLBACK}" target="_blank" rel="noopener noreferrer">Open profile ↗</a></p>`,
        );
      }
    });
}

function hrs(minutes: number): string {
  if (minutes >= 6000) return `${Math.round(minutes / 60).toLocaleString()}h`;
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`;
}

function gameRows(games: SteamGame[], recent: boolean): string {
  return games
    .map(
      (g) => `
      <a class="panel-row" href="https://store.steampowered.com/app/${g.appid}" target="_blank" rel="noopener noreferrer">
        ${g.icon ? `<img class="panel-row-icon" alt="" src="${escapeHtml(g.icon)}">` : '<span class="panel-row-icon"></span>'}
        <span class="panel-row-main">
          <b>${escapeHtml(g.name)}</b>
          <span>${
            recent
              ? `${hrs(g.playtime_2weeks)} recently · ${hrs(g.playtime_forever)} total`
              : `${hrs(g.playtime_forever)} total`
          }</span>
        </span>
      </a>`,
    )
    .join("");
}

function render(d: SteamData): string {
  const profileUrl = d.profile_url || FALLBACK;

  const status = d.playing
    ? `▶ playing <b>${escapeHtml(d.playing)}</b>`
    : d.state === 0
      ? d.last_logoff
        ? `○ last online ${timeAgo(d.last_logoff * 1000)}`
        : "○ offline"
      : `● ${STATES[d.state] ?? "online"}`;

  const flag = d.country
    ? `<img class="panel-flag" alt="${escapeHtml(d.country)}" src="https://flagcdn.com/24x18/${d.country.toLowerCase()}.png">`
    : "";

  const nowPlaying =
    d.playing && d.playing_header
      ? `<a class="sp-now playing" href="https://store.steampowered.com/app/${d.playing_id}" target="_blank" rel="noopener noreferrer">
           <img class="steam-hero" alt="" src="${escapeHtml(d.playing_header)}">
           <div class="sp-now-info">
             <span class="sp-now-label">In game</span>
             <b>${escapeHtml(d.playing)}</b>
           </div>
         </a>`
      : "";

  const twoWeeks = d.recent.reduce((n, g) => n + g.playtime_2weeks, 0);

  const stats = `
    <div class="panel-stats">
      ${d.steam_level != null ? `<div class="stat"><b>${d.steam_level}</b><span>level</span></div>` : ""}
      ${d.game_count != null ? `<div class="stat"><b>${d.game_count.toLocaleString()}</b><span>games</span></div>` : ""}
      ${d.total_minutes ? `<div class="stat"><b>${hrs(d.total_minutes)}</b><span>all time</span></div>` : ""}
      <div class="stat"><b>${hrs(twoWeeks)}</b><span>2 weeks</span></div>
      ${d.badge_count != null ? `<div class="stat"><b>${d.badge_count}</b><span>badges</span></div>` : ""}
      ${d.created ? `<div class="stat"><b>${new Date(d.created * 1000).getFullYear()}</b><span>joined</span></div>` : ""}
    </div>`;

  const recent = d.recent.length
    ? `<div class="panel-section"><h3>Last two weeks</h3>${gameRows(d.recent, true)}</div>`
    : '<p class="panel-note">No games played in the last two weeks.</p>';

  const mostPlayed = d.most_played.length
    ? `<div class="panel-section"><h3>Most played</h3>${gameRows(d.most_played, false)}</div>`
    : "";

  return `
    <div class="panel-head">
      ${d.avatar ? `<img class="panel-avatar" alt="${escapeHtml(d.persona ?? "")}" src="${escapeHtml(d.avatar)}">` : ""}
      <div class="panel-id">
        <b>${escapeHtml(d.persona ?? "Steam")} ${flag}</b>
        <span>${d.realname ? `${escapeHtml(d.realname)} · ` : ""}${status}</span>
      </div>
    </div>

    ${nowPlaying}
    ${stats}
    ${recent}
    ${mostPlayed}

    <a class="panel-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">View full profile ↗</a>`;
}
