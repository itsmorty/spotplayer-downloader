/**
 * Decorative inline SVG icons.
 *
 * Stroke-based, sized in CSS pixels and inheriting `currentColor`, so callers
 * colour them with a text utility (for example `text-info`). Always hidden
 * from assistive technology: adjacent text carries the meaning.
 */

const ICON_PATHS = {
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />',
  shield:
    '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" />',
} as const

export type IconName = keyof typeof ICON_PATHS

export function createIcon(name: IconName, size = 20): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}
