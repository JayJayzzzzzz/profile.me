/**
 * In-page GitHub panel, opened from the GitHub icon. Everything here is public
 * and fetched straight from the browser: the REST API for the profile and
 * repos, and github-contributions-api for the calendar. Falls back to the plain
 * profile link on any failure.
 */
import { GITHUB_USER } from "../config";
import { createPanel, escapeHtml, type Panel } from "./panel";

interface GhUser {
  name: string | null;
  login: string;
  avatar_url: string;
  bio: string | null;
  followers: number;
  following: number;
  public_repos: number;
}

interface GhRepo {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
}

interface Contributions {
  contributions: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[];
}

const PROFILE_URL = `https://github.com/${GITHUB_USER}`;
let cache: string | null = null;

export function initGithub(): void {
  const trigger = document.querySelector<HTMLAnchorElement>('.link a[data-action="github"]');
  if (!trigger) return;

  const panel = createPanel({ label: "GitHub profile", onOpen: load });
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    panel.open(trigger);
  });
}

function load(panel: Panel): void {
  if (cache) {
    panel.setBody(cache);
    return;
  }
  panel.setBody('<p class="panel-note">Loading GitHub…</p>');

  Promise.all([
    fetch(`https://api.github.com/users/${GITHUB_USER}`).then(json<GhUser>),
    fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`)
      .then(json<GhRepo[]>)
      .catch(() => [] as GhRepo[]),
    fetch(`https://github-contributions-api.jogruber.de/v4/${GITHUB_USER}?y=last`)
      .then(json<Contributions>)
      .catch(() => null),
  ])
    .then(([user, repos, contrib]) => {
      cache = render(user, repos, contrib);
      if (panel.isOpen()) panel.setBody(cache);
    })
    .catch(() => {
      if (panel.isOpen()) {
        panel.setBody(
          `<p class="panel-note">Couldn't load GitHub. <a href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">Open profile ↗</a></p>`,
        );
      }
    });
}

function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

function render(user: GhUser, repos: GhRepo[], contrib: Contributions | null): string {
  const top = repos
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 4);

  const calendar = contrib ? renderCalendar(contrib) : "";

  const repoList = top.length
    ? `<div class="panel-section">
         <h3>Popular repositories</h3>
         ${top
           .map(
             (r) => `
           <a class="panel-row" href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener noreferrer">
             <span class="panel-row-main">
               <b>${escapeHtml(r.name)}</b>
               <span>${r.description ? escapeHtml(r.description) : "—"}</span>
             </span>
             <span class="panel-row-meta">${r.language ? `${escapeHtml(r.language)} · ` : ""}★ ${r.stargazers_count}</span>
           </a>`,
           )
           .join("")}
       </div>`
    : "";

  return `
    <div class="panel-head">
      <img class="panel-avatar" alt="${escapeHtml(user.login)}" src="${escapeHtml(user.avatar_url)}">
      <div class="panel-id">
        <b>${escapeHtml(user.name ?? user.login)}</b>
        <span>@${escapeHtml(user.login)}</span>
      </div>
    </div>

    ${user.bio ? `<p class="panel-bio">${escapeHtml(user.bio)}</p>` : ""}

    <div class="panel-stats">
      <div class="stat"><b>${user.public_repos}</b><span>repos</span></div>
      <div class="stat"><b>${user.followers}</b><span>followers</span></div>
      <div class="stat"><b>${user.following}</b><span>following</span></div>
    </div>

    ${calendar}
    ${repoList}

    <a class="panel-link" href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">View full profile ↗</a>`;
}

function renderCalendar(contrib: Contributions): string {
  const days = contrib.contributions.slice(-140);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const cells = days
    .map(
      (day) =>
        `<i data-level="${day.level}" title="${day.count} on ${day.date}"></i>`,
    )
    .join("");
  return `
    <div class="panel-section">
      <h3>${total.toLocaleString()} contributions · 20 weeks</h3>
      <div class="gh-calendar">${cells}</div>
    </div>`;
}
