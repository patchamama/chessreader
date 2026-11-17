/** Keep the move being played (or narrated) in view: centred, scrolling smoothly. Off = never scroll. */
export function followActiveMove(el: HTMLElement, autoscroll: boolean) {
  if (autoscroll) el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}
