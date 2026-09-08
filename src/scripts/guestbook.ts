/**
 * Guestbook — a short message anyone can leave, stored in a Cloudflare D1 table
 * behind the worker (GET/POST /guestbook). Reachable three ways: the book icon
 * in the link row (opens a panel), the command palette / terminal, and its own
 * no-JS page at /guestbook which calls renderGuestbookInto() directly.
 *
 * Spam defence is mostly the worker's job (honeypot, timing, rate limit, link
 * block); the client just forwards the honeypot field and how long the form was
 * on screen.
 */
import { WORKER_ENDPOINT } from "../config";
import { createPanel, escapeHtml, timeAgo, type Panel } from "./panel";
import { showToast } from "./toast";

interface Entry {
  name: string;
  message: string;
  country: string | null;
  created_at: string;
}

const endpoint = WORKER_ENDPOINT.replace(/\/$/, "");
const workerReady = /^https?:\/\//.test(endpoint);

let panelApi: { open: (trigger?: HTMLElement | null) => void } | null = null;

export function initGuestbook(): void {
  const trigger = document.querySelector<HTMLAnchorElement>('.link a[data-action="guestbook"]');
  if (!trigger) return;
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openGuestbook(trigger);
  });
}

export function openGuestbook(trigger?: HTMLElement | null): void {
  if (!panelApi) {
    panelApi = createPanel({
      label: "Guestbook",
      onOpen: (panel: Panel) => renderGuestbookInto(panel.body),
    });
  }
  panelApi.open(trigger ?? null);
}

/** Fill `host` with the guestbook UI. Used by the panel and the /guestbook page. */
export function renderGuestbookInto(host: HTMLElement): void {
  if (!workerReady) {
    host.innerHTML = `<p class="panel-note">The guestbook is offline right now.</p>`;
    return;
  }

  const renderedAt = Date.now();
  host.innerHTML = `
    <div class="gb">
      <h3 class="gb-title">Guestbook</h3>
      <p class="gb-lead">Say hi, drop a thought — no account, no links, 500 characters.</p>
      <form class="gb-form" novalidate>
        <div class="gb-fields">
          <input class="gb-name" name="name" maxlength="40" required placeholder="Name" autocomplete="nickname" />
          <textarea class="gb-message" name="message" maxlength="500" required rows="3" placeholder="Message"></textarea>
        </div>
        <label class="gb-hp" aria-hidden="true">
          Website <input tabindex="-1" autocomplete="off" name="website" />
        </label>
        <div class="gb-actions">
          <span class="gb-count">0 / 500</span>
          <button class="gb-submit" type="submit">Sign</button>
        </div>
        <p class="gb-error" role="alert" hidden></p>
      </form>
      <div class="gb-list"><p class="panel-note">Loading…</p></div>
    </div>`;

  const form = host.querySelector<HTMLFormElement>(".gb-form")!;
  const message = host.querySelector<HTMLTextAreaElement>(".gb-message")!;
  const count = host.querySelector<HTMLElement>(".gb-count")!;
  const errorEl = host.querySelector<HTMLElement>(".gb-error")!;
  const submit = host.querySelector<HTMLButtonElement>(".gb-submit")!;
  const list = host.querySelector<HTMLElement>(".gb-list")!;

  message.addEventListener("input", () => {
    count.textContent = `${message.value.length} / 500`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const body = String(data.get("message") ?? "").trim();
    if (!name || !body) {
      fail("Name and message are both required.");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Signing…";
    try {
      const res = await fetch(`${endpoint}/guestbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          message: body,
          website: data.get("website") ?? "",
          elapsed: Date.now() - renderedAt,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        entry?: Entry;
        error?: string;
      };
      if (!res.ok || !payload.entry) {
        fail(errorText(payload.error, res.status));
        return;
      }
      form.reset();
      count.textContent = "0 / 500";
      prepend(list, payload.entry);
      showToast("Signed the guestbook — thanks!");
    } catch {
      fail("Couldn't reach the guestbook. Try again in a moment.");
    } finally {
      submit.disabled = false;
      submit.textContent = "Sign";
    }
  });

  function fail(text: string): void {
    errorEl.textContent = text;
    errorEl.hidden = false;
    submit.disabled = false;
    submit.textContent = "Sign";
  }

  fetch(`${endpoint}/guestbook`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data: { entries?: Entry[] }) => {
      const entries = data.entries ?? [];
      list.innerHTML = entries.length
        ? entries.map(entryHtml).join("")
        : `<p class="panel-note">No messages yet — be the first.</p>`;
    })
    .catch(() => {
      list.innerHTML = `<p class="panel-note">Couldn't load messages.</p>`;
    });
}

function prepend(list: HTMLElement, entry: Entry): void {
  const note = list.querySelector(".panel-note");
  if (note) list.innerHTML = "";
  list.insertAdjacentHTML("afterbegin", entryHtml(entry));
}

function entryHtml(entry: Entry): string {
  const flag = entry.country
    ? ` <span class="gb-flag" title="${escapeHtml(entry.country)}">${flagEmoji(entry.country)}</span>`
    : "";
  return `
    <div class="gb-entry">
      <div class="gb-entry-head">
        <b>${escapeHtml(entry.name)}</b>${flag}
        <time datetime="${escapeHtml(entry.created_at)}">${escapeHtml(timeAgo(entry.created_at))}</time>
      </div>
      <p>${escapeHtml(entry.message)}</p>
    </div>`;
}

function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

function errorText(error: string | undefined, status: number): string {
  switch (error) {
    case "rate_limited":
      return "You've signed recently — give it a few minutes.";
    case "too_long":
      return "That's over the length limit.";
    case "empty":
      return "Name and message are both required.";
    case "contains_link":
      return "Links aren't allowed in the guestbook.";
    case "rejected":
      return "That message was flagged as spam.";
    default:
      return `Something went wrong (${status}).`;
  }
}
