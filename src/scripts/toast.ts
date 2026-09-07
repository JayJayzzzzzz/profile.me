/** Transient bottom-centre notifications ("Copied", easter-egg hints, …). */

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (host) return host;
  host = document.createElement("div");
  host.className = "toast-host";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

export function showToast(message: string, ms = 2200): void {
  if (!message) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  ensureHost().appendChild(toast);

  requestAnimationFrame(() => toast.setAttribute("data-show", ""));
  window.setTimeout(() => {
    toast.removeAttribute("data-show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, ms);
}
