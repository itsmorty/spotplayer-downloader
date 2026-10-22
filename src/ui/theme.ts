export type Theme = 'light' | 'dark'

export const THEME_KEY = 'sp-theme'

function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

function prefersDark(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** Saved choice wins; otherwise follow the OS preference, defaulting to light. */
export function resolveInitialTheme(): Theme {
  return savedTheme() ?? (prefersDark() ? 'dark' : 'light')
}

/** Applies the theme to `<html data-theme>` and remembers the choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode, quota); the theme still applies.
  }
}

/** Flips the current `data-theme` value and returns the new theme. */
export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
