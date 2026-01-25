'use client'

import { cn } from '@/lib/utils'

interface SkipLinkProps {
  /** Target element ID to focus (default: 'main-content') */
  targetId?: string
  /** Link text */
  children?: React.ReactNode
  className?: string
}

/**
 * Skip to main content link for keyboard navigation.
 * Visually hidden until focused, appears at top of page.
 */
export function SkipLink({
  targetId = 'main-content',
  children = 'Skip to main content',
  className,
}: SkipLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const target = document.getElementById(targetId)
    if (target) {
      // Focus the target element
      target.focus()
      // Also scroll into view for good measure
      target.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className={cn(
        // Visually hidden by default
        'fixed left-4 top-4 z-[100] -translate-y-16 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform',
        // Show on focus
        'focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        className
      )}
    >
      {children}
    </a>
  )
}
