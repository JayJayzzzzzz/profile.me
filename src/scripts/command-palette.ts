/**
 * ⌘K / Ctrl+K (or "/") command palette — a searchable list of everything you
 * can do on the page: open any link or its panel, copy the email or the page
 * URL, drop into the terminal, toggle party mode. Commands that mirror a link
 * are discovered from the DOM so this never drifts from the icon row.
 */
import { links } from "../data/social-links";
import { openTerminal } from "./terminal";
import { openGuestbook } from "./guestbook";
import { openShortcuts } from "./shortcuts";
import { toggleParty } from "./konami";
import { canInstallPwa, promptPwaInstall } from "./pwa";
import { showToast } from "./toast";

interface Command {
  title: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

let overlay: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let items: Command[] = [];
let active = 0;
let lastTrigger: HTMLElement | null = null;

export function initCommandPalette(): void {
  addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const openCombo = (event.metaKey || event.ctrlKey) && key === "k";
    const slash =
      key === "/" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTyping(event.target);

    if (openCombo || slash) {
      event.preventDefault();
      toggle();
      return;
    }
    if (!overlay) return;

    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      items[active]?.run();
    }
  });
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}

function toggle(): void {
  if (overlay) close();
  else open();
}

function open(): void {
  if (overlay) return;
  if (
    ["panel-open", "dp-open", "term-open"].some((c) =>
      document.body.classList.contains(c),
    )
  ) {
    return;
  }
  lastTrigger = document.activeElement as HTMLElement | null;

  overlay = document.createElement("div");
  overlay.className = "cmdk-overlay";
  overlay.innerHTML = `
    <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <input class="cmdk-input" type="text" placeholder="Type a command or search…"
             autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
             role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" />
      <ul class="cmdk-list" id="cmdk-list" role="listbox"></ul>
    </div>`;

  inputEl = overlay.querySelector(".cmdk-input");
  listEl = overlay.querySelector(".cmdk-list");

  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  inputEl!.addEventListener("input", filter);

  document.body.appendChild(overlay);
  document.body.classList.add("cmdk-open");
  filter();
  inputEl!.focus();
}

function close(): void {
  const node = overlay;
  overlay = null;
  inputEl = null;
  listEl = null;
  document.body.classList.remove("cmdk-open");
  node?.remove();
  lastTrigger?.focus?.();
}

function allCommands(): Command[] {
  const list: Command[] = [];

  for (const link of links) {
    const anchor = document.querySelector<HTMLAnchorElement>(
      `.link a[aria-label="${CSS.escape(link.name)}"]`,
    );
    if (!anchor) continue;
    list.push({
      title: `Open ${link.name}`,
      hint: link.action ? "panel" : "link",
      keywords: `${link.icon} ${link.href}`,
      run: () => {
        close();
        anchor.click();
      },
    });
  }

  const email = links.find((l) => l.icon === "email")?.href.replace("mailto:", "");
  if (email) {
    list.push({
      title: "Copy email address",
      hint: email,
      keywords: "clipboard contact mail",
      run: () => {
        close();
        copy(email, "Email address copied");
      },
    });
  }

  list.push(
    {
      title: "Copy link to this page",
      hint: location.host,
      keywords: "share url clipboard",
      run: () => {
        close();
        copy(location.href, "Page link copied");
      },
    },
    {
      title: "Sign the guestbook",
      keywords: "message comment leave note hello",
      run: () => {
        close();
        openGuestbook(lastTrigger);
      },
    },
    {
      title: "Open the terminal",
      hint: "`",
      keywords: "shell console command line pm-sh",
      run: () => {
        close();
        openTerminal(lastTrigger);
      },
    },
    {
      title: "Keyboard shortcuts",
      hint: "?",
      keywords: "keys help cheatsheet",
      run: () => {
        close();
        openShortcuts();
      },
    },
    {
      title: "Toggle party mode",
      hint: "↑↑↓↓←→←→ B A",
      keywords: "konami rainbow disco fun",
      run: () => {
        close();
        toggleParty();
      },
    },
  );

  if (canInstallPwa()) {
    list.push({
      title: "Install this site as an app",
      hint: "PWA",
      keywords: "pwa add home screen standalone install",
      run: () => {
        close();
        void promptPwaInstall();
      },
    });
  }

  return list;
}

function filter(): void {
  if (!listEl || !inputEl) return;
  const query = inputEl.value.trim().toLowerCase();
  const all = allCommands();

  items = query
    ? all
        .map((cmd) => ({ cmd, score: score(query, `${cmd.title} ${cmd.keywords ?? ""}`.toLowerCase()) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.cmd)
    : all;

  active = 0;
  listEl.innerHTML = items.length
    ? items
        .map(
          (cmd, i) => `
      <li role="option" data-i="${i}" aria-selected="${i === 0}">
        <span class="cmdk-title">${escape(cmd.title)}</span>
        ${cmd.hint ? `<span class="cmdk-hint">${escape(cmd.hint)}</span>` : ""}
      </li>`,
        )
        .join("")
    : `<li class="cmdk-empty">No matches</li>`;

  listEl.querySelectorAll<HTMLElement>("li[data-i]").forEach((li) => {
    li.addEventListener("mousemove", () => setActive(Number(li.dataset.i)));
    li.addEventListener("click", () => items[Number(li.dataset.i)]?.run());
  });
}

function move(delta: number): void {
  if (!items.length) return;
  setActive((active + delta + items.length) % items.length);
}

function setActive(index: number): void {
  active = index;
  listEl?.querySelectorAll<HTMLElement>("li[data-i]").forEach((li) => {
    const on = Number(li.dataset.i) === index;
    li.setAttribute("aria-selected", String(on));
    if (on) li.scrollIntoView({ block: "nearest" });
  });
}

/** Subsequence match: every query char must appear in order. Contiguous runs
 *  and a word-start hit score higher. */
function score(query: string, text: string): number {
  let ti = 0;
  let points = 0;
  let streak = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, ti);
    if (found === -1) return 0;
    streak = found === ti ? streak + 1 : 0;
    points += 1 + streak * 2 + (found === 0 || text[found - 1] === " " ? 3 : 0);
    ti = found + 1;
  }
  return points;
}

function copy(text: string, toast: string): void {
  navigator.clipboard?.writeText(text).then(
    () => showToast(toast),
    () => showToast("Couldn't copy"),
  );
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
