/**
 * Run a DOM update inside a View Transition when the browser supports it and the
 * visitor hasn't asked for reduced motion. Everywhere else it's a plain call.
 */
export function withViewTransition(update: () => void): void {
  const start = (
    document as Document & { startViewTransition?: (cb: () => void) => unknown }
  ).startViewTransition;

  if (
    typeof start === "function" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    start.call(document, update);
  } else {
    update();
  }
}
