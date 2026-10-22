// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, resolveInitialTheme, THEME_KEY, toggleTheme } from '../../ui/theme'

const store = new Map<string, string>()

const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key)
  }),
  clear: vi.fn(() => store.clear()),
}

let osPrefersDark = false

function matchMediaMock(query: string) {
  return {
    matches: query === '(prefers-color-scheme: dark)' ? osPrefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }
}

vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('matchMedia', vi.fn(matchMediaMock))

beforeEach(() => {
  store.clear()
  osPrefersDark = false
  vi.clearAllMocks()
  localStorageMock.getItem.mockImplementation((key: string) => store.get(key) ?? null)
  document.documentElement.removeAttribute('data-theme')
})

describe('resolveInitialTheme', () => {
  it('uses a saved value over the OS preference', () => {
    store.set(THEME_KEY, 'dark')
    osPrefersDark = false
    expect(resolveInitialTheme()).toBe('dark')

    store.set(THEME_KEY, 'light')
    osPrefersDark = true
    expect(resolveInitialTheme()).toBe('light')
  })

  it('falls back to prefers-color-scheme when nothing is saved', () => {
    osPrefersDark = true
    expect(resolveInitialTheme()).toBe('dark')

    osPrefersDark = false
    expect(resolveInitialTheme()).toBe('light')
  })

  it('ignores invalid saved values', () => {
    store.set(THEME_KEY, 'solarized')
    osPrefersDark = true
    expect(resolveInitialTheme()).toBe('dark')
  })

  it('survives a throwing localStorage', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('denied')
    })
    osPrefersDark = true
    expect(resolveInitialTheme()).toBe('dark')
  })
})

describe('applyTheme / toggleTheme', () => {
  it('applies the theme to <html> and persists it', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(store.get(THEME_KEY)).toBe('dark')
  })

  it('toggles data-theme and persists the new value', () => {
    applyTheme('light')
    expect(toggleTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(store.get(THEME_KEY)).toBe('dark')

    expect(toggleTheme()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(store.get(THEME_KEY)).toBe('light')
  })

  it('still applies the theme when persistence fails', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota')
    })
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
