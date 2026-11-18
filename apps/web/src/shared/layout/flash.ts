/** Class of an element that was just updated; the page styles it (see BookReader). */
export const FLASH_CLASS = 'flash-update'

/** How long an updated element stays highlighted. */
export const FLASH_MS = 2000

/** Highlight an element that was just updated, fading out over about two seconds. */
export function flashElement(el: Element, ms = FLASH_MS): void {
  el.classList.remove(FLASH_CLASS)
  // Restart the animation when the same element flashes again.
  void (el as HTMLElement).offsetWidth
  el.classList.add(FLASH_CLASS)
  window.setTimeout(() => el.classList.remove(FLASH_CLASS), ms)
}
