import { el } from './el'

export interface DialogOptions {
  /** Heading rendered above the content. */
  title?: string
  /** Extra classes appended to the `.modal-box`. */
  className?: string
  /** Called once, after the dialog has been closed and removed. */
  onClose?: () => void
}

export interface DialogHandle {
  dialog: HTMLDialogElement
  box: HTMLDivElement
  content: HTMLDivElement
  close: () => void
}

/**
 * Opens a native `<dialog class="modal">` containing the given content.
 * Closes on backdrop click, Escape, or any `form method="dialog"` control.
 */
export function openDialog(content: Node | string, opts: DialogOptions = {}): DialogHandle {
  const contentEl = el('div', { class: 'flex flex-col gap-4' })
  contentEl.append(content)

  const box = el('div', { class: opts.className ? `modal-box ${opts.className}` : 'modal-box' })
  if (opts.title) box.append(el('h3', { class: 'text-lg font-bold' }, opts.title))
  box.append(contentEl)

  const dialog = el('dialog', { class: 'modal' }, box)

  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    dialog.remove()
    opts.onClose?.()
  }

  dialog.addEventListener('close', cleanup)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog)
  })

  document.body.append(dialog)
  dialog.showModal()

  return { dialog, box, content: contentEl, close: () => closeDialog(dialog) }
}

/** Closes an open dialog; removal from the DOM happens in the `close` handler. */
export function closeDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close()
  else dialog.remove()
}
