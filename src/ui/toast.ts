import { el } from './el'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. Defaults to 3500. */
  duration?: number
}

const FADE_MS = 300

let container: HTMLDivElement | null = null

/** Mounts the single toast container (idempotent) and returns it. */
export function mountToastContainer(): HTMLDivElement {
  if (container?.isConnected) return container
  container = el('div', { class: 'toast toast-top toast-end', 'aria-live': 'polite' })
  document.body.append(container)
  return container
}

/** Shows a DaisyUI alert inside the toast container and auto-dismisses it. */
export function notify(message: string, kind: ToastKind = 'info', options: ToastOptions = {}): HTMLDivElement {
  const host = mountToastContainer()
  const alert = el(
    'div',
    {
      class: `alert alert-${kind} cursor-pointer shadow-lg transition-opacity duration-300`,
      role: kind === 'error' ? 'alert' : 'status',
    },
    message,
  )
  host.append(alert)

  let removed = false
  const dismiss = () => {
    if (removed) return
    removed = true
    window.clearTimeout(timer)
    alert.classList.add('opacity-0')
    window.setTimeout(() => alert.remove(), FADE_MS)
  }

  const timer = window.setTimeout(dismiss, options.duration ?? 3500)
  alert.addEventListener('click', dismiss)

  return alert
}
