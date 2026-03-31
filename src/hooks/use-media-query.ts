'use client'

import { useState, useEffect } from 'react'

/**
 * Subscribe to a CSS media query and return whether it matches.
 * Returns `false` during SSR / first render to avoid hydration mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Returns `true` when viewport is below 768px (md breakpoint).
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
