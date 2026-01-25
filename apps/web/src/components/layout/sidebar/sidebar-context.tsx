'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react'

const STORAGE_KEY = 'sidebar-collapsed'

/**
 * Sidebar context value interface
 */
export interface SidebarContextValue {
  /** Whether the sidebar is collapsed */
  isCollapsed: boolean
  /** Toggle sidebar collapsed state */
  toggle: () => void
  /** Collapse the sidebar */
  collapse: () => void
  /** Expand the sidebar */
  expand: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

interface SidebarProviderProps {
  children: React.ReactNode
  /** Initial collapsed state (default: false) */
  defaultCollapsed?: boolean
}

/**
 * Provider component for sidebar state management.
 * Persists collapsed preference to localStorage.
 *
 * @example
 * ```tsx
 * <SidebarProvider>
 *   <Sidebar />
 *   <MainContent />
 * </SidebarProvider>
 * ```
 */
export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load persisted state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        setIsCollapsed(stored === 'true')
      }
      setIsInitialized(true)
    }
  }, [])

  // Persist state to localStorage when it changes
  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed))
    }
  }, [isCollapsed, isInitialized])

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  const collapse = useCallback(() => {
    setIsCollapsed(true)
  }, [])

  const expand = useCallback(() => {
    setIsCollapsed(false)
  }, [])

  const value = useMemo<SidebarContextValue>(
    () => ({
      isCollapsed,
      toggle,
      collapse,
      expand,
    }),
    [isCollapsed, toggle, collapse, expand]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

/**
 * Hook to access sidebar context.
 *
 * @example
 * ```tsx
 * const { isCollapsed, toggle } = useSidebar()
 * ```
 */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }

  return context
}
