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

const STORAGE_COLLAPSED = 'sidebar-collapsed'
const STORAGE_SECTIONS = 'sidebar-sections'
const STORAGE_FAVORITES = 'sidebar-favorites'

/** Default: only 'main' section expanded */
const DEFAULT_SECTIONS: Record<string, boolean> = { main: true }

/**
 * Sidebar context value interface
 */
export interface SidebarContextValue {
  /** Whether the sidebar is permanently collapsed */
  isCollapsed: boolean
  /** Toggle sidebar collapsed state */
  toggle: () => void
  /** Collapse the sidebar */
  collapse: () => void
  /** Expand the sidebar */
  expand: () => void

  /** Whether collapsed sidebar is temporarily expanded on hover */
  isHoverExpanded: boolean
  /** Set hover-expand state */
  setHoverExpanded: (value: boolean) => void
  /** Computed: should components render in compact/icon-only mode? */
  isCompact: boolean

  /** Section accordion state */
  isSectionExpanded: (key: string) => boolean
  toggleSection: (key: string) => void

  /** Favorites */
  favorites: string[]
  addFavorite: (href: string) => void
  removeFavorite: (href: string) => void
  isFavorite: (href: string) => boolean
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

interface SidebarProviderProps {
  children: React.ReactNode
  /** Initial collapsed state (default: false) */
  defaultCollapsed?: boolean
}

/**
 * Provider component for sidebar state management.
 * Persists collapsed preference, section states, and favorites to localStorage.
 */
export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [isHoverExpanded, setHoverExpanded] = useState(false)
  const [expandedSections, setExpandedSections] =
    useState<Record<string, boolean>>(DEFAULT_SECTIONS)
  const [favorites, setFavorites] = useState<string[]>([])
  const isInitialized = useRef(false)

  // Load persisted state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedCollapsed = localStorage.getItem(STORAGE_COLLAPSED)
    if (storedCollapsed !== null) {
      setIsCollapsed(storedCollapsed === 'true')
    }

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

  // Persist collapsed state
  useEffect(() => {
    if (isInitialized.current && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_COLLAPSED, String(isCollapsed))
    }
  }, [isCollapsed])

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

  const isCompact = isCollapsed && !isHoverExpanded

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => !prev)
    setHoverExpanded(false)
  }, [])

  const collapse = useCallback(() => {
    setIsCollapsed(true)
    setHoverExpanded(false)
  }, [])

  const expand = useCallback(() => {
    setIsCollapsed(false)
    setHoverExpanded(false)
  }, [])

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

  const value = useMemo<SidebarContextValue>(
    () => ({
      isCollapsed,
      toggle,
      collapse,
      expand,
      isHoverExpanded,
      setHoverExpanded,
      isCompact,
      isSectionExpanded,
      toggleSection,
      favorites,
      addFavorite,
      removeFavorite,
      isFavorite,
    }),
    [
      isCollapsed,
      toggle,
      collapse,
      expand,
      isHoverExpanded,
      isCompact,
      isSectionExpanded,
      toggleSection,
      favorites,
      addFavorite,
      removeFavorite,
      isFavorite,
    ]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

/**
 * Hook to access sidebar context.
 */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }

  return context
}
