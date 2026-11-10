export const HUD_SLIDE_LAYER: boolean = !(typeof location !== 'undefined' && /[?&]oldhud(?:[=&]|$)/.test(location.search));

export function hudSlideLayer(el: HTMLElement, moving: boolean, layered: boolean): boolean {
  if (!HUD_SLIDE_LAYER || moving === layered) return layered;
  el.style.willChange = moving ? 'transform' : '';
  return moving;
}
