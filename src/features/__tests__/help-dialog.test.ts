// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fa } from '../../i18n/fa'

vi.mock('../bookmarklet', () => ({
  createBookmarkletSection: () => {
    const section = document.createElement('section')
    section.dataset.testid = 'bookmarklet'
    return section
  },
}))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    },
  })
})

describe('openHelpDialog', () => {
  it('opens a scrollable RTL-native modal with steps, bookmarklet and privacy note', async () => {
    const { openHelpDialog } = await import('../help-dialog')
    openHelpDialog()

    const dialog = document.querySelector<HTMLDialogElement>('dialog.modal')
    if (!dialog) throw new Error('missing dialog')
    const box = dialog.querySelector('.modal-box')
    if (!box) throw new Error('missing modal box')

    expect(dialog.open).toBe(true)
    expect(box.className).toContain('max-h-[85vh]')
    expect(box.textContent).toContain(fa.help.title)
    expect(box.textContent).toContain(fa.help.intro)
    expect(box.textContent).toContain(fa.help.stepsTitle)
    for (const step of fa.help.steps) expect(box.textContent).toContain(step)
    expect(box.querySelector('[data-testid="bookmarklet"]')).not.toBeNull()
    expect(box.textContent).toContain(fa.help.privacy)

    const privacy = box.querySelector('[role="note"]')
    if (!privacy) throw new Error('missing privacy note')
    expect(privacy.className).toContain('bg-info/10')
    expect(privacy.className).toContain('border-info/30')
    expect(privacy.className).not.toContain('alert-info')
    expect(privacy.querySelector('svg[aria-hidden="true"]')).not.toBeNull()

    expect(box.textContent).toContain(fa.common.close)

    const closeForm = box.querySelector('form[method="dialog"]')
    expect(closeForm).not.toBeNull()

    const badgeNumbers = [...box.querySelectorAll('.badge')].map((badge) => badge.textContent)
    expect(badgeNumbers).toEqual(['1', '2', '3', '4'])

    dialog.close()
  })
})
