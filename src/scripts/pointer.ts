/**
 * Circular blend-mode cursor that trails the real pointer with an eased delay.
 * Removed entirely on touch devices, where it would just be dead weight.
 */
export function initPointer(): void {
  const pointer = document.getElementById("pointer");
  if (!pointer) return;

  if (matchMedia("(pointer: coarse)").matches) {
    pointer.remove();
    return;
  }

  addEventListener("pointermove", (event) => {
    const x = event.clientX - innerWidth / 2;
    const y = event.clientY - innerHeight / 2;
    pointer.style.transform = `translate(${x}px, ${y}px)`;
  });
}
