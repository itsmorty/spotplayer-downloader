// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fa } from '../../i18n/fa'

const DOC_LINKS = [
  {
    href: 'https://support.google.com/chrome/answer/188842?hl=fa',
    label: fa.help.guide.docsChrome,
  },
  {
    href: 'https://support.mozilla.org/fa/kb/bookmarklets-perform-common-web-page-tasks',
    label: fa.help.guide.docsFirefoxBookmarklets,
  },
  {
    href: 'https://support.mozilla.org/fa/kb/bookmarks-firefox',
    label: fa.help.guide.docsFirefoxBookmarks,
  },
] as const

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

afterEach(() => {
  document.body.replaceChildren()
})

async function openGuide(): Promise<{ dialog: HTMLDialogElement; box: HTMLElement }> {
  const { openBookmarkletGuide } = await import('../bookmarklet-guide')
  openBookmarkletGuide()

  const dialog = document.querySelector<HTMLDialogElement>('dialog.modal')
  if (!dialog) throw new Error('missing dialog')
  const box = dialog.querySelector<HTMLElement>('.modal-box')
  if (!box) throw new Error('missing modal box')

  return { dialog, box }
}

describe('openBookmarkletGuide', () => {
  it('opens a scrollable modal with the intro, both browser sections and every step', async () => {
    const { dialog, box } = await openGuide()

    expect(dialog.open).toBe(true)
    expect(box.className).toContain('max-h-[85vh]')
    expect(box.className).toContain('max-w-2xl')
    expect(box.className).toContain('overflow-y-auto')
    expect(box.textContent).toContain(fa.help.guide.title)
    expect(box.textContent).toContain(fa.help.guide.intro)

    expect(box.textContent).toContain(fa.help.guide.chromeTitle)
    expect(box.textContent).toContain(fa.help.guide.firefoxTitle)
    for (const step of [...fa.help.guide.chromeSteps, ...fa.help.guide.firefoxSteps]) {
      expect(box.textContent).toContain(step)
    }

    expect(box.textContent).toContain(fa.help.guide.tipsTitle)
    for (const tip of fa.help.guide.tips) expect(box.textContent).toContain(tip)

    const badgeNumbers = [...box.querySelectorAll('.badge')].map((badge) => badge.textContent)
    expect(badgeNumbers).toEqual(['1', '2', '3', '4', '5', '6', '1', '2', '3', '4', '5', '6'])
    expect(box.querySelectorAll('kbd').length).toBeGreaterThan(0)

    expect(box.textContent).toContain(fa.common.close)
    expect(box.querySelector('form[method="dialog"]')).not.toBeNull()
  })

  it('lists the official documentation links and opens them safely in a new tab', async () => {
    const { box } = await openGuide()

    const links = [...box.querySelectorAll<HTMLAnchorElement>('a[href]')]
    expect(links).toHaveLength(DOC_LINKS.length)

    for (const [index, doc] of DOC_LINKS.entries()) {
      const link = links[index]
      expect(link.getAttribute('href')).toBe(doc.href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')?.split(/\s+/)).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer']),
      )
      expect(link.textContent).toContain(doc.label)
    }
  })

  it('closes and removes itself when the dialog closes', async () => {
    const { dialog } = await openGuide()

    dialog.close()
    expect(dialog.open).toBe(false)
    expect(document.querySelector('dialog.modal')).toBeNull()
  })
})
