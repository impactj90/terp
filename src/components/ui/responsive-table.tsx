'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ResponsiveTableProps {
  children: React.ReactNode
  className?: string
}

/**
 * Wrapper for <Table> that adds mobile-responsive behavior:
 * - Compact row height and font size on mobile (via .responsive-table CSS)
 * - Gradient fade indicator on the right edge when content is scrollable
 *
 * Usage:
 * ```tsx
 * <ResponsiveTable>
 *   <Table>...</Table>
 * </ResponsiveTable>
 * ```
 */
export function ResponsiveTable({ children, className }: ResponsiveTableProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // The actual scroll element is Table's inner div (first child's first child)
    const scrollEl =
      container.querySelector<HTMLElement>('[data-table-scroll]') ??
      container.querySelector<HTMLElement>('.overflow-auto')

    if (!scrollEl) return

    const check = () => {
      setCanScrollRight(
        scrollEl.scrollWidth - scrollEl.scrollLeft - scrollEl.clientWidth > 1
      )
    }

    check()
    scrollEl.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(scrollEl)

    return () => {
      scrollEl.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className={cn('responsive-table relative', className)}>
      {children}
      <div
        className="responsive-table-fade md:hidden"
        style={{ opacity: canScrollRight ? 1 : 0 }}
        aria-hidden
      />
    </div>
  )
}
