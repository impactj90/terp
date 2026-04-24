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

/**
 * Returns true on devices where the primary pointing mechanism is "coarse"
 * (e.g. touchscreen). Returns false on desktops with a mouse/trackpad, and
 * also during SSR / first render (before the media query resolves).
 *
 * Used to show features like direct camera capture that only make sense on
 * touch devices — desktop browsers ignore the HTML `capture` attribute and
 * would silently fall back to a file picker.
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
