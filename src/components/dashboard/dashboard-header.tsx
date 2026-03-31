'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'

interface User {
  id: string
  email: string
  displayName: string
  role: string
}

interface DashboardHeaderProps {
  user: User | null
}

/**
 * Dashboard page header with greeting and current date.
 */
export function DashboardHeader({ user }: DashboardHeaderProps) {
  const t = useTranslations('time')
  const locale = useLocale()

  const hour = new Date().getHours()
  let greeting: string
  if (hour < 12) {
    greeting = t('greeting.morning')
  } else if (hour < 18) {
    greeting = t('greeting.afternoon')
  } else {
    greeting = t('greeting.evening')
  }

  // Full date for desktop, compact for mobile
  const todayFull = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const todayShort = new Date().toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Extract first name for mobile compact display
  const firstName = user?.displayName?.split(' ')[0]

  return (
    <div>
      {/* Mobile: smaller, first name only */}
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
        <span className="sm:hidden">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </span>
        <span className="hidden sm:inline">
          {greeting}{user?.displayName ? `, ${user.displayName}` : ''}
        </span>
      </h1>
      <p className="text-sm text-muted-foreground sm:text-base">
        <span className="sm:hidden">{todayShort}</span>
        <span className="hidden sm:inline">{todayFull}</span>
      </p>
    </div>
  )
}
