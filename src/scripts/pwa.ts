/**
 * Holds onto the `beforeinstallprompt` event (Chromium only — it fires when the
 * site meets the installable-PWA bar) so the command palette can offer an
 * "Install as an app" entry that triggers the native prompt on demand.
 */
import { showToast } from "./toast";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;

export function initPwaInstall(): void {
  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
  });
  addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    showToast("Installed — find it with your other apps");
  });
}

/** True when the browser has offered an install prompt we can still replay. */
export function canInstallPwa(): boolean {
  return !installed && deferred !== null;
}

export async function promptPwaInstall(): Promise<void> {
  if (!deferred) {
    showToast("Use your browser's menu to install this site");
    return;
  }
  const event = deferred;
  deferred = null;
  await event.prompt();
  await event.userChoice;
}
