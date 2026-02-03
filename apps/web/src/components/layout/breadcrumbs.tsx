'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
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
 * Route segment to translation key mapping for breadcrumbs.
 */
const segmentToKey: Record<string, string> = {
  dashboard: 'dashboard',
  'time-clock': 'timeClock',
  timesheet: 'timesheet',
  absences: 'absences',
  profile: 'profile',
  settings: 'settings',
  admin: 'admin',
  employees: 'employees',
  departments: 'departments',
  'employment-types': 'employmentTypes',
  'day-plans': 'dayPlans',
  'employee-day-plans': 'employeeDayPlans',
  'week-plans': 'weekPlans',
  users: 'users',
  'user-groups': 'userGroups',
  reports: 'reports',
  tenants: 'tenants',
  new: 'new',
  edit: 'edit',
  teams: 'teams',
  tariffs: 'tariffs',
  holidays: 'holidays',
  'absence-types': 'absenceTypes',
  'booking-types': 'bookingTypes',
  accounts: 'accounts',
  approvals: 'approvals',
  vacation: 'vacation',
  'monthly-evaluation': 'monthlyEvaluation',
  'year-overview': 'yearOverview',
  'team-overview': 'teamOverview',
  'correction-assistant': 'correctionAssistant',
  'monthly-values': 'monthlyValues',
}

interface BreadcrumbNavItem {
  href: string
  label: string
  isLast: boolean
  isEllipsis?: boolean
}

interface BreadcrumbsProps {
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
  showHomeIcon = true,
  maxItems = 4,
}: BreadcrumbsProps) {
  const pathname = usePathname()
  const t = useTranslations('breadcrumbs')

  const homeHref = '/dashboard'

  const items = useMemo((): BreadcrumbNavItem[] => {
    // Split pathname into segments and filter empty strings
    const segments = pathname.split('/').filter(Boolean)

    if (segments.length === 0) {
      return []
    }

    // Build breadcrumb items with cumulative paths
    const breadcrumbItems: BreadcrumbNavItem[] = segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/')

      // Look up translation key, or format segment as fallback
      const key = segmentToKey[segment]
      let label: string
      if (key) {
        label = t(key as Parameters<typeof t>[0])
      } else if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
      ) {
        label = t('details')
      } else {
        label = segment
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      }

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
  }, [pathname, maxItems, t])

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
              aria-label={t('home')}
            >
              {showHomeIcon && (
                <Home className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="sr-only md:not-sr-only">{t('home')}</span>
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
