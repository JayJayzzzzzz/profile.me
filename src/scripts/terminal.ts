/**
 * A toy shell that drops down when you press the backtick key. It knows a
 * handful of commands — enough to poke around, read a few "files", jump to any
 * link, and run `neofetch`. No history persistence, no real filesystem; every
 * answer is baked in here or read back off the page's own DOM.
 *
 * `openTerminal()` is also wired into the command palette.
 */
import { LOCATION, ageFrom, GITHUB_USER } from "../config";
import { links } from "../data/social-links";
import { openGuestbook } from "./guestbook";

let root: HTMLElement | null = null;
let output: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let lastTrigger: HTMLElement | null = null;

const history: string[] = [];
let historyAt = 0;

const FILES: Record<string, () => string> = {
  "about.txt": () =>
    [
      "Julian Schaefers — 'JayJayzzzzzz'.",
      "",
      `IT apprentice (application development) at Datagraphis, based in`,
      `${LOCATION.label}. ${ageFrom(new Date())} years old.`,
      "",
      "This page is a hand-built homage to osumatrix.me: Astro, no UI",
      "framework, a WebGL cursor trail, and a pile of live integrations",
      "(Discord, Spotify, GitHub, osu!, Steam).",
    ].join("\n"),
  "links.txt": () => links.map((l) => `${l.name.padEnd(10)} ${l.href}`).join("\n"),
  "uses.txt": () =>
    [
      "editor    VS Code",
      "shell     zsh + this thing, apparently",
      "framework Astro",
      "host      GitHub Pages + a Cloudflare Worker",
      "keyboard  whatever's plugged in",
    ].join("\n"),
  "contact.txt": () =>
    "Email:   julian.schaefers05@gmail.com\nDiscord: discord.com/users/483999801034145793",
};

const COMMANDS: Record<string, (args: string[]) => string | void> = {
  help: () =>
    [
      "available commands:",
      "  help              this text",
      "  whoami            the short version",
      "  about             the longer version",
      "  ls                list files",
      "  cat <file>        print a file",
      "  socials           list every link",
      "  open <name>       jump to a link (github, discord, guestbook, …)",
      "  neofetch          the obligatory",
      "  date              time in " + LOCATION.label,
      "  echo <text>       …",
      "  clear             wipe the screen",
      "  exit              close the shell (or the console key again)",
      "",
      "  Tab completes commands and cat/open arguments. ↑/↓ walk history.",
    ].join("\n"),
  whoami: () => "julian — IT apprentice, application development @ Datagraphis",
  about: () => FILES["about.txt"](),
  ls: () => Object.keys(FILES).join("   ") + "   secret/",
  cat: (args) => {
    const name = args[0];
    if (!name) return "usage: cat <file>";
    if (name === "secret/" || name === "secret") return "cat: secret/: Is a directory";
    if (name.startsWith("secret/"))
      return "cat: permission denied (nice try — the konami code is friendlier)";
    const file = FILES[name];
    return file ? file() : `cat: ${name}: No such file or directory`;
  },
  socials: () => FILES["links.txt"](),
  links: () => FILES["links.txt"](),
  open: (args) => {
    const target = (args[0] || "").toLowerCase();
    if (!target) return "usage: open <name>";
    if (target === "guestbook" || target === "gb") {
      close();
      openGuestbook();
      return;
    }
    const link = findLink(target);
    if (!link) return `open: ${target}: unknown link — try 'socials'`;
    close();
    link.click();
    return;
  },
  neofetch: () => neofetch(),
  date: () =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: LOCATION.timeZone,
    }).format(new Date()),
  echo: (args) => args.join(" "),
  clear: () => {
    if (output) output.textContent = "";
  },
  exit: () => close(),
  q: () => close(),
  sudo: () => "we're all just guests here. no sudo for you.",
  "rm -rf /": () => "bold. denied.",
};

export function initTerminal(): void {
  addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // The "console key" varies by layout: US ANSI puts backtick at `Backquote`
    // (left of "1"); German/ISO keyboards emit `IntlBackslash` (the <>| key) or
    // a dead-key backtick. Accept the physical slots and the literal chars.
    // (The command palette's "Open the terminal" is the layout-proof way in.)
    const isConsoleKey =
      event.code === "Backquote" ||
      event.code === "IntlBackslash" ||
      event.key === "`" ||
      event.key === "~";
    if (!isConsoleKey) return;

    const el = event.target as HTMLElement | null;
    const typingElsewhere =
      el &&
      el !== input &&
      (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    if (typingElsewhere) return;

    event.preventDefault();
    toggle(el);
  });
}

export function openTerminal(trigger?: HTMLElement | null): void {
  if (!root) build();
  if (root!.hasAttribute("data-open")) return;
  lastTrigger = trigger ?? (document.activeElement as HTMLElement | null);
  root!.setAttribute("data-open", "");
  document.body.classList.add("term-open");
  input!.focus();
  if (!output!.textContent) {
    print(`pm-sh — type 'help'. The console key or 'exit' to close.`);
  }
  scrollToEnd();
}

function toggle(trigger?: HTMLElement | null): void {
  if (root?.hasAttribute("data-open")) close();
  else openTerminal(trigger);
}

function close(): void {
  if (!root?.hasAttribute("data-open")) return;
  root.removeAttribute("data-open");
  document.body.classList.remove("term-open");
  lastTrigger?.focus?.();
}

function build(): void {
  root = document.createElement("div");
  root.className = "term";
  root.innerHTML = `
    <div class="term-window" role="dialog" aria-modal="true" aria-label="Terminal">
      <div class="term-bar">
        <span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span>
        <span class="term-title">pm-sh — jayjayzzzzzz.me</span>
        <button class="term-x" type="button" aria-label="Close">&times;</button>
      </div>
      <pre class="term-out" aria-live="polite"></pre>
      <div class="term-line">
        <span class="term-prompt">~ $</span>
        <input class="term-in" type="text" autocomplete="off" autocapitalize="off"
               autocorrect="off" spellcheck="false" aria-label="Command" />
      </div>
    </div>`;

  output = root.querySelector(".term-out");
  input = root.querySelector(".term-in");

  root.addEventListener("mousedown", (event) => {
    if (event.target === root) close();
  });
  root.querySelector(".term-x")!.addEventListener("click", close);
  root.querySelector(".term-line")!.addEventListener("click", () => input!.focus());

  input!.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      // Keep focus in the shell — never let Tab walk off to the address bar.
      event.preventDefault();
      complete();
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(input!.value);
      input!.value = "";
      historyAt = history.length;
    } else if (event.key === "Escape") {
      close();
    } else if (
      event.code === "Backquote" ||
      event.code === "IntlBackslash" ||
      event.key === "`" ||
      event.key === "~"
    ) {
      // let the window toggle handler own it (and close on the same key)
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (historyAt > 0) input!.value = history[--historyAt] ?? "";
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyAt < history.length - 1) input!.value = history[++historyAt] ?? "";
      else {
        historyAt = history.length;
        input!.value = "";
      }
    }
  });

  document.body.appendChild(root);
}

function run(raw: string): void {
  const line = raw.trim();
  print(`<span class="term-prompt">~ $</span> ${escape(line)}`);
  if (!line) return;
  history.push(line);

  const exact = COMMANDS[line.toLowerCase()];
  const [name, ...args] = line.split(/\s+/);
  const handler = exact ?? COMMANDS[name.toLowerCase()];

  if (!handler) {
    print(`pm-sh: command not found: ${escape(name)} — try 'help'`);
    return;
  }
  const result = handler(args);
  if (typeof result === "string") print(escape(result));
}

/* --- Tab completion --------------------------------------------------- */

const COMMAND_NAMES = Object.keys(COMMANDS)
  .filter((name) => /^[a-z]+$/.test(name))
  .sort();
const TAKES_ARG = new Set(["cat", "open", "echo"]);

/** Complete the token under the caret: command names, or the argument to
 *  `cat` / `open`. One match fills it in; several fill the shared prefix, or
 *  list the options on a second press. */
function complete(): void {
  if (!input) return;
  const tokens = input.value.split(/\s+/);
  const i = tokens.length - 1;
  const token = (tokens[i] ?? "").toLowerCase();
  const first = (tokens[0] ?? "").toLowerCase();

  let pool: string[];
  if (i === 0) pool = COMMAND_NAMES;
  else if (first === "cat") pool = [...Object.keys(FILES), "secret/"];
  else if (first === "open" || first === "o")
    pool = links.map((l) => l.action ?? l.name.toLowerCase());
  else return;

  const matches = pool.filter((c) => c.startsWith(token));
  if (matches.length === 0) return;

  if (matches.length === 1) {
    tokens[i] = matches[0];
    const trailing = i === 0 && TAKES_ARG.has(matches[0]) ? " " : "";
    input.value = tokens.join(" ") + trailing;
    return;
  }

  const shared = commonPrefix(matches);
  if (shared.length > token.length) {
    tokens[i] = shared;
    input.value = tokens.join(" ");
  } else {
    print(escape(matches.join("   ")));
  }
}

function commonPrefix(values: string[]): string {
  let prefix = values[0];
  for (const value of values) {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** `html` is inserted as-is — callers printing user/command text escape it first. */
function print(html: string): void {
  if (!output) return;
  const block = document.createElement("div");
  block.className = "term-block";
  block.innerHTML = html;
  output.appendChild(block);
  scrollToEnd();
}

/** Keep the newest line in view, like a real terminal. `.term-out` is the
 *  scroll container; run it after layout so scrollHeight is up to date. */
function scrollToEnd(): void {
  if (!output) return;
  const el = output;
  const jump = () => (el.scrollTop = el.scrollHeight);
  jump();
  requestAnimationFrame(jump);
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findLink(target: string): HTMLAnchorElement | null {
  const byAction = document.querySelector<HTMLAnchorElement>(
    `.link a[data-action="${CSS.escape(target)}"]`,
  );
  if (byAction) return byAction;
  const aliases: Record<string, string> = { gh: "GitHub", tw: "X", twitter: "X" };
  const label = aliases[target] ?? target;
  const all = document.querySelectorAll<HTMLAnchorElement>(".link a[aria-label]");
  for (const a of all) {
    if (a.getAttribute("aria-label")?.toLowerCase() === label.toLowerCase()) return a;
  }
  return null;
}

function neofetch(): string {
  const clock = document.getElementById("clock")?.textContent?.trim() || "??:??";
  const weather = document.getElementById("weather")?.textContent?.replace(/^\s*and\s*/, "").replace(/,\s*$/, "").trim();
  const art = [
    "        _ _ ",
    "     _ (_) |",
    "    | || | |   julian@jayjayzzzzzz.me",
    " _  | || | |   ----------------------",
    "| |_| || |_|   ",
    " \\___/_/(_)    ",
  ];
  const info = [
    `OS         the web`,
    `Host       jayjayzzzzzz.me`,
    `Kernel     Astro`,
    `Shell      pm-sh 1.0`,
    `Editor     VS Code`,
    `Uptime     ${ageFrom(new Date())} years`,
    `Locale     ${LOCATION.label} — ${clock}${weather ? `, ${weather}` : ""}`,
    `GitHub     github.com/${GITHUB_USER}`,
    `Accent     ${getComputedStyle(document.documentElement).getPropertyValue("--highlight").trim()}`,
  ];
  const lines: string[] = [];
  const width = Math.max(...art.map((l) => l.length)) + 2;
  for (let i = 0; i < Math.max(art.length, info.length); i++) {
    lines.push(((art[i] ?? "").padEnd(width)) + (info[i] ?? ""));
  }
  return lines.join("\n");
}
