/**
 * ↑ ↑ ↓ ↓ ← → ← → B A toggles a "party mode": the photo and card cycle hue, the
 * trail goes rainbow (via a `pm:konami` event that cursor.ts listens for), the
 * whole stage does one barrel roll, and a hidden panel unfolds from behind the
 * photo. Enter it again to switch everything back off.
 */
import { showToast } from "./toast";

const SEQUENCE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];

export function initKonami(): void {
  let index = 0;

  addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === SEQUENCE[index]) {
      index += 1;
      if (index === SEQUENCE.length) {
        index = 0;
        toggle();
      }
    } else {
      index = key === SEQUENCE[0] ? 1 : 0;
    }
  });
}

/** Flip party mode on/off — also reachable from the command palette. */
export function toggleParty(): void {
  toggle();
}

function toggle(): void {
  const on = document.body.classList.toggle("konami");
  dispatchEvent(new CustomEvent("pm:konami", { detail: on }));

  // Restart the one-shot barrel roll.
  document.body.classList.remove("konami-roll");
  void document.body.offsetWidth;
  document.body.classList.add("konami-roll");

  showToast(on ? "party mode on — ↑↑↓↓←→←→ B A again to stop" : "back to normal");
}
