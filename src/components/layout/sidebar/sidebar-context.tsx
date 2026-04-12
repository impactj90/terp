'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'

const STORAGE_SECTIONS = 'sidebar-sections'
const STORAGE_FAVORITES = 'sidebar-favorites'

/** Default: only 'main' section expanded */
const DEFAULT_SECTIONS: Record<string, boolean> = { main: true }

/**
 * Sidebar extras context — manages favorites and section accordion state.
 * Core open/collapsed state is handled by shadcn's SidebarProvider.
 */
export interface SidebarExtrasContextValue {
  /** Section accordion state */
  isSectionExpanded: (key: string) => boolean
  toggleSection: (key: string) => void

  /** Favorites */
  favorites: string[]
  addFavorite: (href: string) => void
  removeFavorite: (href: string) => void
  isFavorite: (href: string) => boolean
}

const SidebarExtrasContext = createContext<SidebarExtrasContextValue | null>(null)

interface SidebarExtrasProviderProps {
  children: React.ReactNode
}

/**
 * Provider for sidebar extras (favorites + section accordion state).
 * Persists to localStorage.
 */
export function SidebarExtrasProvider({ children }: SidebarExtrasProviderProps) {
  const [expandedSections, setExpandedSections] =
    useState<Record<string, boolean>>(DEFAULT_SECTIONS)
  const [favorites, setFavorites] = useState<string[]>([])
  const isInitialized = useRef(false)

  // Load persisted state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedSections = localStorage.getItem(STORAGE_SECTIONS)
    if (storedSections) {
      try {
        setExpandedSections(JSON.parse(storedSections))
      } catch {
        // ignore corrupt data
      }
    }

    const storedFavorites = localStorage.getItem(STORAGE_FAVORITES)
    if (storedFavorites) {
      try {
        setFavorites(JSON.parse(storedFavorites))
      } catch {
        // ignore corrupt data
      }
    }

    isInitialized.current = true
  }, [])

  // Persist section state
  useEffect(() => {
    if (isInitialized.current && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_SECTIONS, JSON.stringify(expandedSections))
    }
  }, [expandedSections])

  // Persist favorites
  useEffect(() => {
    if (isInitialized.current && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(favorites))
    }
  }, [favorites])

  const isSectionExpanded = useCallback(
    (key: string) => expandedSections[key] ?? false,
    [expandedSections]
  )

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  const addFavorite = useCallback((href: string) => {
    setFavorites((prev) => {
      if (prev.includes(href)) return prev
      return [...prev, href].slice(0, 8) // max 8 favorites
    })
  }, [])

  const removeFavorite = useCallback((href: string) => {
    setFavorites((prev) => prev.filter((f) => f !== href))
  }, [])

  const isFavorite = useCallback(
    (href: string) => favoritesSet.has(href),
    [favoritesSet]
  )

  const value = useMemo<SidebarExtrasContextValue>(
    () => ({
      isSectionExpanded,
      toggleSection,
      favorites,
      addFavorite,
      removeFavorite,
      isFavorite,
    }),
    [
      isSectionExpanded,
      toggleSection,
      favorites,
      addFavorite,
      removeFavorite,
      isFavorite,
    ]
  )

  return (
    <SidebarExtrasContext.Provider value={value}>
      {children}
    </SidebarExtrasContext.Provider>
  )
}

/**
 * Hook to access sidebar extras (favorites + section state).
 */
export function useSidebarExtras(): SidebarExtrasContextValue {
  const context = useContext(SidebarExtrasContext)

  if (!context) {
    throw new Error('useSidebarExtras must be used within a SidebarExtrasProvider')
  }

  return context
}
