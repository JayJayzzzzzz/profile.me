/**
 * In-page osu! panel, opened from the osu! icon. Stats come from the worker's
 * `/osu` route; without a configured worker the icon stays a plain link.
 */
import { OSU_USER_ID } from "../config";
import { createPanel, escapeHtml, type Panel } from "./panel";
import { workerFetch, workerReady } from "./worker-api";

interface OsuStats {
  username: string;
  avatar_url: string;
  country_code: string;
  is_online: boolean;
  pp: number;
  global_rank: number | null;
  country_rank: number | null;
  accuracy: number | null;
  play_count: number;
  play_time: number;
  max_combo: number;
  ranked_score: number;
  level: { current: number; progress: number };
  grade_counts: Record<string, number> | null;
  top_plays: {
    title: string;
    pp: number;
    accuracy: number;
    mods: string[];
    rank: string | null;
    url: string | null;
  }[];
}

const PROFILE_URL = `https://osu.ppy.sh/users/${OSU_USER_ID}`;

export function initOsu(): void {
  const trigger = document.querySelector<HTMLAnchorElement>('.link a[data-action="osu"]');
  if (!trigger || !workerReady()) return;

  const panel = createPanel({ label: "osu! profile", onOpen: load });
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    panel.open(trigger);
  });
}

function load(panel: Panel): void {
  panel.setBody('<p class="panel-note">Loading osu! stats…</p>');
  workerFetch<OsuStats>("/osu")
    .then((data) => {
      if (panel.isOpen()) panel.setBody(render(data));
    })
    .catch(() => {
      if (panel.isOpen()) {
        panel.setBody(
          `<p class="panel-note">Couldn't load osu! stats. <a href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">Open profile ↗</a></p>`,
        );
      }
    });
}

function render(d: OsuStats): string {
  const flag = d.country_code
    ? `<img class="panel-flag" alt="${escapeHtml(d.country_code)}" src="https://flagcdn.com/24x18/${d.country_code.toLowerCase()}.png">`
    : "";
  const acc = d.accuracy != null ? `${d.accuracy.toFixed(2)}%` : "—";
  const levelPct = Math.min(100, Math.max(0, d.level.progress));

  const grades = d.grade_counts
    ? `<div class="panel-grades">${(["ssh", "ss", "sh", "s", "a"] as const)
        .filter((g) => (d.grade_counts?.[g] ?? 0) > 0)
        .map(
          (g) =>
            `<span class="grade grade-${g}">${g.toUpperCase().replace("H", "+")}</span><span class="grade-n">${d.grade_counts?.[g]}</span>`,
        )
        .join("")}</div>`
    : "";

  const top = d.top_plays.length
    ? `<div class="panel-section">
         <h3>Top plays</h3>
         ${d.top_plays
           .map(
             (play) => `<a class="panel-row" ${play.url ? `href="${play.url}" target="_blank" rel="noopener noreferrer"` : ""}>
           <span class="panel-row-rank">${escapeHtml(play.rank ?? "")}</span>
           <span class="panel-row-main">
             <b>${escapeHtml(play.title)}</b>
             <span>${play.pp} pp · ${(play.accuracy * 100).toFixed(2)}%${
               play.mods.length ? ` · +${play.mods.join("")}` : ""
             }</span>
           </span>
         </a>`,
           )
           .join("")}
       </div>`
    : "";

  return `
    <div class="panel-head">
      <img class="panel-avatar" alt="${escapeHtml(d.username)}" src="${escapeHtml(d.avatar_url)}">
      <div class="panel-id">
        <b>${escapeHtml(d.username)} ${flag}</b>
        <span>${d.is_online ? "● online" : "○ offline"} · osu!standard</span>
      </div>
    </div>

    <div class="panel-stats">
      <div class="stat"><b>${d.pp.toLocaleString()}<i>pp</i></b><span>performance</span></div>
      <div class="stat"><b>#${d.global_rank?.toLocaleString() ?? "—"}</b><span>global</span></div>
      <div class="stat"><b>#${d.country_rank?.toLocaleString() ?? "—"}</b><span>${escapeHtml(d.country_code || "country")}</span></div>
      <div class="stat"><b>${acc}</b><span>accuracy</span></div>
      <div class="stat"><b>${d.play_count.toLocaleString()}</b><span>play count</span></div>
      <div class="stat"><b>${Math.round(d.play_time / 3600).toLocaleString()}h</b><span>play time</span></div>
    </div>

    <div class="panel-level">
      <span>Lv ${d.level.current}</span>
      <div class="bar"><i style="width:${levelPct}%"></i></div>
      <span>${Math.round(levelPct)}%</span>
    </div>

    ${grades}
    ${top}

    <a class="panel-link" href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">View full profile ↗</a>`;
}
