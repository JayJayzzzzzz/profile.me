/**
 * Keyboard shortcuts. Single keys jump to a link (opening its in-page panel
 * where there is one); `?` toggles a cheatsheet overlay; Escape closes it.
 */
import { withViewTransition } from "./view-transition";

interface Shortcut {
  keys: string[];
  label: string;
  action: string; // matches data-action, or a link aria-label
  byLabel?: boolean;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["g"], label: "GitHub", action: "github" },
  { keys: ["d"], label: "Discord", action: "discord" },
  { keys: ["p"], label: "Spotify", action: "spotify" },
  { keys: ["o"], label: "osu!", action: "osu" },
  { keys: ["s"], label: "Steam", action: "steam" },
  { keys: ["b"], label: "Guestbook", action: "guestbook" },
  { keys: ["e"], label: "Email", action: "Email", byLabel: true },
  { keys: ["r"], label: "Reddit", action: "Reddit", byLabel: true },
  { keys: ["x"], label: "X / Twitter", action: "X", byLabel: true },
];

let overlay: HTMLElement | null = null;

export function initShortcuts(): void {
  addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return;
    }

    if (event.key === "?") {
      event.preventDefault();
      toggleOverlay();
      return;
    }
    if (event.key === "Escape" && overlay) {
      closeOverlay();
      return;
    }

    // A panel/dialog/overlay is open — let it own the keyboard.
    if (
      overlay ||
      document.body.classList.contains("panel-open") ||
      document.body.classList.contains("dp-open")
    ) {
      return;
    }

    const match = SHORTCUTS.find((s) => s.keys.includes(event.key.toLowerCase()));
    if (!match) return;

    const selector = match.byLabel
      ? `.link a[aria-label="${match.action}"]`
      : `.link a[data-action="${match.action}"]`;
    const link = document.querySelector<HTMLAnchorElement>(selector);
    if (link) {
      event.preventDefault();
      link.click();
    }
  });
}

function toggleOverlay(): void {
  if (overlay) closeOverlay();
  else openOverlay();
}

/** Open the shortcuts cheatsheet — also reachable from the command palette. */
export function openShortcuts(): void {
  if (!overlay) openOverlay();
}

function openOverlay(): void {
  overlay = document.createElement("div");
  overlay.className = "sc-overlay";
  overlay.innerHTML = `
    <div class="sc-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1">
      <h2>Shortcuts</h2>
      <dl>
        ${SHORTCUTS.map(
          (s) =>
            `<div><dt>${s.keys.map((k) => `<kbd>${k}</kbd>`).join("")}</dt><dd>${s.label}</dd></div>`,
        ).join("")}
        <div><dt><kbd>⌘</kbd><kbd>K</kbd></dt><dd>Command palette</dd></div>
        <div><dt><kbd>\`</kbd><kbd>&lt;</kbd></dt><dd>Terminal (console key, or ⌘K)</dd></div>
        <div><dt><kbd>?</kbd></dt><dd>This menu</dd></div>
        <div><dt><kbd>Esc</kbd></dt><dd>Close</dd></div>
      </dl>
      <p class="sc-hint">psst — ↑↑↓↓←→←→ B A</p>
    </div>`;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });

  withViewTransition(() => document.body.appendChild(overlay!));
  (overlay.querySelector(".sc-card") as HTMLElement).focus();
}

function closeOverlay(): void {
  const node = overlay;
  overlay = null;
  if (!node) return;
  withViewTransition(() => node.remove());
}
