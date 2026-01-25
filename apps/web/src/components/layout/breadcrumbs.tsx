'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { Home } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

/**
 * Route to label mapping for breadcrumbs.
 * Add new routes here to provide human-readable labels.
 */
const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  'time-clock': 'Time Clock',
  timesheet: 'Timesheet',
  absences: 'Absences',
  profile: 'Profile',
  settings: 'Settings',
  admin: 'Administration',
  employees: 'Employees',
  departments: 'Departments',
  'employment-types': 'Employment Types',
  'day-plans': 'Day Plans',
  users: 'Users',
  reports: 'Reports',
  tenants: 'Tenants',
  new: 'New',
  edit: 'Edit',
}

/**
 * Get human-readable label for a route segment.
 */
function getRouteLabel(segment: string): string {
  // Check if we have a defined label
  if (routeLabels[segment]) {
    return routeLabels[segment]
  }

  // Check if it looks like a UUID (for dynamic routes)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      segment
    )
  ) {
    return 'Details'
  }

  // Capitalize and format the segment
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface BreadcrumbNavItem {
  href: string
  label: string
  isLast: boolean
  isEllipsis?: boolean
}

interface BreadcrumbsProps {
  /** Optional custom home label */
  homeLabel?: string
  /** Optional custom home href */
  homeHref?: string
  /** Whether to show home icon */
  showHomeIcon?: boolean
  /** Maximum number of items to show (truncates middle) */
  maxItems?: number
}

/**
 * Breadcrumb navigation component.
 * Generates breadcrumbs from the current pathname.
 */
export function Breadcrumbs({
  homeLabel = 'Home',
  homeHref = '/dashboard',
  showHomeIcon = true,
  maxItems = 4,
}: BreadcrumbsProps) {
  const pathname = usePathname()

  const items = useMemo((): BreadcrumbNavItem[] => {
    // Split pathname into segments and filter empty strings
    const segments = pathname.split('/').filter(Boolean)

    if (segments.length === 0) {
      return []
    }

    // Build breadcrumb items with cumulative paths
    const breadcrumbItems: BreadcrumbNavItem[] = segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/')
      const label = getRouteLabel(segment)
      const isLast = index === segments.length - 1

      return {
        href,
        label,
        isLast,
      }
    })

    // Handle truncation if too many items
    if (breadcrumbItems.length > maxItems) {
      const first = breadcrumbItems[0]
      const last = breadcrumbItems.slice(-2) // Keep last 2 items
      if (first) {
        return [
          first,
          { href: '', label: '...', isLast: false, isEllipsis: true },
          ...last,
        ]
      }
    }

    return breadcrumbItems
  }, [pathname, maxItems])

  // Don't render if on home page or no items
  if (items.length === 0 || pathname === homeHref) {
    return null
  }

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {/* Home link */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              href={homeHref}
              className="flex items-center gap-1.5"
              aria-label={homeLabel}
            >
              {showHomeIcon && (
                <Home className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="sr-only md:not-sr-only">{homeLabel}</span>
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {/* Breadcrumb items */}
        {items.map((item, index) => (
          <div key={item.href || index} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {item.isLast ? (
                <BreadcrumbPage className="truncate max-w-[150px] md:max-w-none">
                  {item.label}
                </BreadcrumbPage>
              ) : 'isEllipsis' in item && item.isEllipsis ? (
                <span className="text-muted-foreground">{item.label}</span>
              ) : (
                <BreadcrumbLink asChild>
                  <Link
                    href={item.href}
                    className="truncate max-w-[100px] md:max-w-none"
                  >
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
