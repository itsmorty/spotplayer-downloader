// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createProgress } from '../progress'
import { fa } from '../../i18n/fa'

function q<T extends Element>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`missing ${selector}`)
  return found
}

describe('createProgress', () => {
  it('starts hidden and shows the single-video mode', () => {
    const progress = createProgress()
    expect(progress.element.style.display).toBe('none')

    progress.show('single')

    expect(progress.element.style.display).toBe('')
    expect(progress.element.getAttribute('data-mode')).toBe('single')
    expect(q(progress.element, 'h2').textContent).toBe(fa.progress.title)
    expect(q<HTMLElement>(progress.element, '[data-progress-overall]').style.display).toBe('none')
  })

  it('reveals the overall bar in queue mode', () => {
    const progress = createProgress()
    progress.show('queue')

    expect(progress.element.getAttribute('data-mode')).toBe('queue')
    expect(q(progress.element, 'h2').textContent).toBe(fa.progress.titleQueue)
    expect(q<HTMLElement>(progress.element, '[data-progress-overall]').style.display).toBe('')
  })

  it('updates the phase badge and hides it again', () => {
    const progress = createProgress()
    const badge = q<HTMLElement>(progress.element, '[data-progress-phase]')

    progress.setPhase('decrypt')
    expect(badge.textContent).toBe(fa.progress.phase.decrypt)
    expect(badge.style.display).toBe('')
    expect(badge.className).toContain('badge-info')

    progress.setPhase(null)
    expect(badge.style.display).toBe('none')
  })

  it('turns current-item progress into a bar, percent and count', () => {
    const progress = createProgress()
    const bar = q<HTMLProgressElement>(progress.element, '[data-progress-item-bar]')

    progress.setItemProgress(2, 4)

    expect(bar.value).toBe(50)
    expect(bar.getAttribute('aria-valuetext')).toBe('50%')
    expect(q(progress.element, '[data-progress-item-percent]').textContent).toBe('50%')
    expect(q(progress.element, '[data-progress-item-count]').textContent).toBe('2 / 4')
  })

  it('supports fractional overall progress and direct percentages', () => {
    const progress = createProgress()
    const bar = q<HTMLProgressElement>(progress.element, '[data-progress-overall-bar]')

    progress.setOverallProgress(1, 4)
    expect(bar.value).toBe(25)
    expect(q(progress.element, '[data-progress-overall-percent]').textContent).toBe('25%')

    progress.setOverallPercent(42.6)
    expect(bar.value).toBe(42.6)
    expect(q(progress.element, '[data-progress-overall-percent]').textContent).toBe('43%')

    progress.setOverallLabel('ویدیوی 2 از 4')
    expect(q(progress.element, '[data-progress-overall-label]').textContent).toBe('ویدیوی 2 از 4')
  })

  it('shows status and semantic alerts', () => {
    const progress = createProgress()
    const status = q<HTMLElement>(progress.element, '[data-progress-status]')
    const alert = q<HTMLElement>(progress.element, '[data-progress-alert]')

    progress.setStatus(fa.progress.saving)
    expect(status.textContent).toBe(fa.progress.saving)

    progress.showAlert('error', fa.errors.network)
    expect(alert.className).toContain('border-error/30')
    expect(alert.className).toContain('bg-error/10')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toBe(fa.errors.network)
    expect(alert.style.display).toBe('')

    progress.showAlert('success', fa.progress.singleSuccess)
    expect(alert.className).toContain('border-success/30')
    expect(alert.className).toContain('bg-success/10')
    expect(alert.getAttribute('role')).toBe('status')

    progress.hideAlert()
    expect(alert.style.display).toBe('none')
  })

  it('wires cancel handlers and honors the enabled state', () => {
    const progress = createProgress()
    const button = q<HTMLButtonElement>(progress.element, '[data-progress-cancel]')
    const handler = vi.fn()
    const unsubscribe = progress.onCancel(handler)

    button.click()
    expect(handler).toHaveBeenCalledTimes(1)

    progress.setCancelEnabled(false)
    expect(button.disabled).toBe(true)
    button.click()
    expect(handler).toHaveBeenCalledTimes(1)

    progress.setCancelEnabled(true)
    unsubscribe()
    button.click()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('hides the card', () => {
    const progress = createProgress()
    progress.show('single')
    progress.hide()
    expect(progress.element.style.display).toBe('none')
  })
})
