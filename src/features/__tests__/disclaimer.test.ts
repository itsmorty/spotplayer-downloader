// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDisclaimer, DISCLAIMER_KEY, isDisclaimerAcknowledged } from '../disclaimer'
import { fa } from '../../i18n/fa'

beforeEach(() => {
  localStorage.clear()
  document.body.replaceChildren()
})

afterEach(() => {
  localStorage.clear()
  document.body.replaceChildren()
})

describe('createDisclaimer', () => {
  it('renders the first-run banner with title, body and accept button', () => {
    const banner = createDisclaimer()
    if (!banner) throw new Error('expected a banner')

    expect(banner.textContent).toContain(fa.disclaimer.title)
    expect(banner.textContent).toContain(fa.disclaimer.body)
    expect(banner.textContent).toContain(fa.disclaimer.accept)
    expect(banner.className).toContain('alert-info')
  })

  it('hides immediately and persists acceptance under a stable key', () => {
    const banner = createDisclaimer()
    if (!banner) throw new Error('expected a banner')
    document.body.append(banner)

    const accept = [...banner.querySelectorAll('button')].find(
      (button) => button.textContent === fa.disclaimer.accept,
    )
    accept?.click()

    expect(banner.isConnected).toBe(false)
    expect(localStorage.getItem(DISCLAIMER_KEY)).toBe('1')
    expect(isDisclaimerAcknowledged()).toBe(true)
    expect(createDisclaimer()).toBeNull()
  })

  it('does not render when the acknowledgement already exists', () => {
    localStorage.setItem(DISCLAIMER_KEY, '1')
    expect(createDisclaimer()).toBeNull()
  })

  it('opens the help dialog from the banner and keeps the banner visible', () => {
    const onOpenHelp = vi.fn()
    const banner = createDisclaimer({ onOpenHelp })
    if (!banner) throw new Error('expected a banner')
    document.body.append(banner)

    const help = [...banner.querySelectorAll('button')].find(
      (button) => button.textContent === fa.nav.help,
    )
    help?.click()

    expect(onOpenHelp).toHaveBeenCalledTimes(1)
    // The banner stays until the user accepts.
    expect(banner.isConnected).toBe(true)
  })
})
