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

  const today = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {greeting}{user?.displayName ? `, ${user.displayName}` : ''}
      </h1>
      <p className="text-muted-foreground">{today}</p>
    </div>
  )
}
