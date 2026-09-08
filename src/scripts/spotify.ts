/**
 * In-page Spotify panel, opened from the Spotify icon. Now-playing, top tracks
 * and artists (medium term), and recent history — all from the worker's
 * `/spotify` route. Without a configured worker the icon stays a plain link.
 */
import { createPanel, escapeHtml, timeAgo, type Panel } from "./panel";
import { workerFetch, workerReady } from "./worker-api";

interface Track {
  name: string | null;
  artist: string;
  album: string | null;
  art: string | null;
  url: string | null;
  duration_ms: number | null;
}
interface NowPlaying extends Track {
  is_playing: boolean;
  progress_ms: number;
}
interface Artist {
  name: string | null;
  image: string | null;
  url: string | null;
  genre: string | null;
}
interface SpotifyData {
  display_name: string | null;
  profile_url: string | null;
  avatar: string | null;
  followers: number | null;
  now_playing: NowPlaying | null;
  recent: (Track & { played_at: string | null })[];
  top_tracks: Track[];
  top_artists: Artist[];
}

const FALLBACK = "https://open.spotify.com/user/31ulvtbj2ik64vq3mn2hkgwhfqta";
let ticker = 0;

export function initSpotify(): void {
  const trigger = document.querySelector<HTMLAnchorElement>('.link a[data-action="spotify"]');
  if (!trigger || !workerReady()) return;

  const panel = createPanel({
    label: "Spotify",
    onOpen: (p) => {
      load(p);
    },
  });
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    panel.open(trigger);
  });
}

function load(panel: Panel): void {
  window.clearInterval(ticker);
  panel.setBody('<p class="panel-note">Loading Spotify…</p>');

  workerFetch<SpotifyData>("/spotify")
    .then((data) => {
      if (!panel.isOpen()) return;
      panel.setBody(render(data));
      if (data.now_playing?.is_playing) startProgress(panel, data.now_playing);
    })
    .catch(() => {
      if (panel.isOpen()) {
        panel.setBody(
          `<p class="panel-note">Couldn't load Spotify. <a href="${FALLBACK}" target="_blank" rel="noopener noreferrer">Open Spotify ↗</a></p>`,
        );
      }
    });
}

function ms(duration: number | null): string {
  if (!duration) return "";
  const total = Math.round(duration / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function trackRow(t: Track | null, trailing = ""): string {
  if (!t) return "";
  return `
    <a class="panel-row"${t.url ? ` href="${t.url}" target="_blank" rel="noopener noreferrer"` : ""}>
      ${t.art ? `<img class="panel-row-icon" alt="" src="${escapeHtml(t.art)}">` : '<span class="panel-row-icon"></span>'}
      <span class="panel-row-main">
        <b>${escapeHtml(t.name ?? "")}</b>
        <span>${escapeHtml(t.artist)}${t.duration_ms ? ` · ${ms(t.duration_ms)}` : ""}</span>
      </span>
      ${trailing ? `<span class="panel-row-meta">${trailing}</span>` : ""}
    </a>`;
}

function render(d: SpotifyData): string {
  const now = d.now_playing;
  const nowBlock = now
    ? `<div class="sp-now${now.is_playing ? " playing" : ""}">
         ${now.art ? `<img alt="" src="${escapeHtml(now.art)}">` : ""}
         <div class="sp-now-info">
           <span class="sp-now-label">${now.is_playing ? "Now playing" : "Paused"}</span>
           <b>${escapeHtml(now.name ?? "")}</b>
           <span>${escapeHtml(now.artist)}</span>
           <div class="bar"><i id="sp-progress" style="width:${
             now.duration_ms ? (now.progress_ms / now.duration_ms) * 100 : 0
           }%"></i></div>
         </div>
       </div>`
    : "";

  const artists = d.top_artists.length
    ? `<div class="panel-section">
         <h3>Top artists · 6 months</h3>
         <div class="sp-artists">
           ${d.top_artists
             .map(
               (a) => `
             <a class="sp-artist"${a.url ? ` href="${a.url}" target="_blank" rel="noopener noreferrer"` : ""}>
               ${a.image ? `<img alt="" src="${escapeHtml(a.image)}">` : '<span class="sp-artist-img"></span>'}
               <span>${escapeHtml(a.name ?? "")}</span>
             </a>`,
             )
             .join("")}
         </div>
       </div>`
    : "";

  const topTracks = d.top_tracks.length
    ? `<div class="panel-section">
         <h3>Top tracks · 6 months</h3>
         ${d.top_tracks.map((t, i) => trackRow(t, `#${i + 1}`)).join("")}
       </div>`
    : "";

  const recent = d.recent.length
    ? `<div class="panel-section">
         <h3>Recently played</h3>
         ${d.recent.slice(0, 10).map((t) => trackRow(t, timeAgo(t.played_at))).join("")}
       </div>`
    : "";

  const empty =
    !artists && !topTracks && !now
      ? '<p class="panel-note">Top tracks &amp; now-playing need the wider Spotify scopes — re-run <code>npm run spotify-auth</code>.</p>'
      : "";

  return `
    <div class="panel-head">
      ${d.avatar ? `<img class="panel-avatar" alt="" src="${escapeHtml(d.avatar)}">` : ""}
      <div class="panel-id">
        <b>${escapeHtml(d.display_name ?? "Spotify")}</b>
        <span>${d.followers != null ? `${d.followers.toLocaleString()} followers` : "on Spotify"}</span>
      </div>
    </div>

    ${nowBlock}
    ${empty}
    ${artists}
    ${topTracks}
    ${recent}

    <a class="panel-link" href="${d.profile_url || FALLBACK}" target="_blank" rel="noopener noreferrer">Open in Spotify ↗</a>`;
}

function startProgress(panel: Panel, now: NowPlaying): void {
  if (!now.duration_ms) return;
  let progress = now.progress_ms;
  ticker = window.setInterval(() => {
    const bar = panel.body.querySelector<HTMLElement>("#sp-progress");
    if (!bar || !panel.isOpen()) {
      window.clearInterval(ticker);
      return;
    }
    progress = Math.min(now.duration_ms as number, progress + 1000);
    bar.style.width = `${(progress / (now.duration_ms as number)) * 100}%`;
  }, 1000);
}
