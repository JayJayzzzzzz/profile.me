/**
 * Generic modal panel used by the osu!, Steam, Spotify and GitHub link icons.
 * One shell, a `.panel-*` vocabulary the callers fill with markup, plus the
 * usual modal plumbing: backdrop click, Escape, focus return, body scroll-lock.
 *
 * Open state is tracked as a plain boolean, set synchronously — never read back
 * off the DOM — so a caller's `onOpen` callback that resolves instantly (a
 * memoised fetch) still sees the panel as open.
 */

export interface Panel {
  /** Replace the panel body with a markup string. */
  setBody(html: string): void;
  /** The live body element, for wiring up listeners after `setBody`. */
  readonly body: HTMLElement;
  close(): void;
  isOpen(): boolean;
}

interface PanelOptions {
  /** Accessible name for the dialog. */
  label: string;
  /** Called every time the panel opens. */
  onOpen: (panel: Panel) => void;
}

let openCount = 0;

export function createPanel(options: PanelOptions): {
  open: (trigger?: HTMLElement | null) => void;
} {
  let backdrop: HTMLDivElement | null = null;
  let lastTrigger: HTMLElement | null = null;
  let opened = false;
  let removeTimer = 0;

  const api: Panel = {
    get body() {
      return backdrop!.querySelector(".panel-body") as HTMLElement;
    },
    setBody(html: string) {
      api.body.innerHTML = html;
    },
    isOpen: () => opened,
    close,
  };

  function build(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "panel-backdrop";
    el.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-label="${escapeAttr(
        options.label,
      )}" tabindex="-1">
        <button class="panel-close" type="button" aria-label="Close">&times;</button>
        <div class="panel-body"></div>
      </div>`;

    el.addEventListener("click", (event) => {
      if (event.target === el) close();
    });
    el.querySelector(".panel-close")?.addEventListener("click", close);
    return el;
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && opened) close();
  }

  function open(trigger?: HTMLElement | null): void {
    if (opened) return;
    opened = true;
    window.clearTimeout(removeTimer);
    lastTrigger = trigger ?? null;
    if (!backdrop) backdrop = build();
    if (!backdrop.isConnected) document.body.appendChild(backdrop);

    openCount += 1;
    document.body.classList.add("panel-open");
    backdrop.getBoundingClientRect(); // flush before transitioning
    backdrop.setAttribute("data-open", "");

    (backdrop.querySelector(".panel") as HTMLElement | null)?.focus();
    document.addEventListener("keydown", onKeydown);
    options.onOpen(api);
  }

  function close(): void {
    if (!opened || !backdrop) return;
    opened = false;
    document.removeEventListener("keydown", onKeydown);
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.classList.remove("panel-open");

    const node = backdrop;
    node.removeAttribute("data-open");
    window.clearTimeout(removeTimer);
    removeTimer = window.setTimeout(() => {
      if (!opened) node.remove();
    }, 260);
    lastTrigger?.focus();
  }

  return { open };
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[character],
  );
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/** Compact "3d ago" / "2h ago" formatting for timestamps. */
export function timeAgo(iso: string | number | null): string {
  if (iso == null) return "";
  const then = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.35, "w"],
    [12, "mo"],
    [Number.POSITIVE_INFINITY, "y"],
  ];
  let value = seconds;
  for (const [step, label] of units) {
    if (value < step) return `${Math.max(1, Math.floor(value))}${label} ago`;
    value /= step;
  }
  return "";
}
