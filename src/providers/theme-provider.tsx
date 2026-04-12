'use client'

import * as React from 'react'

type Appearance = 'light' | 'dark' | 'system'
type ColorTheme = 'default' | 'modern'

interface ThemeContextValue {
  appearance: Appearance
  resolvedAppearance: 'light' | 'dark'
  setAppearance: (appearance: Appearance) => void
  colorTheme: ColorTheme
  setColorTheme: (colorTheme: ColorTheme) => void
  /** @deprecated Use `appearance` instead */
  theme: Appearance
  /** @deprecated Use `resolvedAppearance` instead */
  resolvedTheme: 'light' | 'dark'
  /** @deprecated Use `setAppearance` instead */
  setTheme: (theme: Appearance) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const COLOR_THEME_CLASSES: Record<ColorTheme, string | null> = {
  default: null,
  modern: 'theme-modern',
}

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Appearance
  defaultColorTheme?: ColorTheme
  storageKey?: string
  colorThemeStorageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  defaultColorTheme = 'default',
  storageKey = 'terp-theme',
  colorThemeStorageKey = 'terp-color-theme',
}: ThemeProviderProps) {
  const [appearance, setAppearanceState] = React.useState<Appearance>(defaultTheme)
  const [resolvedAppearance, setResolvedAppearance] = React.useState<'light' | 'dark'>('light')
  const [colorTheme, setColorThemeState] = React.useState<ColorTheme>(defaultColorTheme)

  // Initialize from localStorage on mount
  React.useEffect(() => {
    // One-time migration: reset existing users to the new defaults (light + modern).
    // Bumping THEME_RESET_VERSION will re-trigger this for everyone.
    const THEME_RESET_VERSION = '2026-04-09-light-modern'
    const resetKey = 'terp-theme-reset-version'
    const appliedReset = localStorage.getItem(resetKey)
    if (appliedReset !== THEME_RESET_VERSION) {
      localStorage.setItem(storageKey, defaultTheme)
      localStorage.setItem(colorThemeStorageKey, defaultColorTheme)
      localStorage.setItem(resetKey, THEME_RESET_VERSION)
      setAppearanceState(defaultTheme)
      setColorThemeState(defaultColorTheme)
      return
    }

    const storedAppearance = localStorage.getItem(storageKey) as Appearance | null
    if (storedAppearance && ['light', 'dark', 'system'].includes(storedAppearance)) {
      setAppearanceState(storedAppearance)
    }

    const storedColorTheme = localStorage.getItem(colorThemeStorageKey) as ColorTheme | null
    if (storedColorTheme && ['default', 'modern'].includes(storedColorTheme)) {
      setColorThemeState(storedColorTheme)
    }
  }, [storageKey, colorThemeStorageKey, defaultTheme, defaultColorTheme])

  // Update resolved appearance and DOM classes
  React.useEffect(() => {
    const root = document.documentElement
    const resolved = appearance === 'system' ? getSystemTheme() : appearance
    setResolvedAppearance(resolved)

    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [appearance])

  // Update color theme DOM class
  React.useEffect(() => {
    const root = document.documentElement
    // Remove all color theme classes
    Object.values(COLOR_THEME_CLASSES).forEach((cls) => {
      if (cls) root.classList.remove(cls)
    })
    // Add active color theme class
    const cls = COLOR_THEME_CLASSES[colorTheme]
    if (cls) root.classList.add(cls)
  }, [colorTheme])

  // Listen for system theme changes
  React.useEffect(() => {
    if (appearance !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const resolved = getSystemTheme()
      setResolvedAppearance(resolved)
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(resolved)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [appearance])

  const setAppearance = React.useCallback(
    (newAppearance: Appearance) => {
      localStorage.setItem(storageKey, newAppearance)
      setAppearanceState(newAppearance)
    },
    [storageKey]
  )

  const setColorTheme = React.useCallback(
    (newColorTheme: ColorTheme) => {
      localStorage.setItem(colorThemeStorageKey, newColorTheme)
      setColorThemeState(newColorTheme)
    },
    [colorThemeStorageKey]
  )

  const value = React.useMemo(
    () => ({
      appearance,
      resolvedAppearance,
      setAppearance,
      colorTheme,
      setColorTheme,
      // Backwards compat aliases
      theme: appearance,
      resolvedTheme: resolvedAppearance,
      setTheme: setAppearance,
    }),
    [appearance, resolvedAppearance, setAppearance, colorTheme, setColorTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
