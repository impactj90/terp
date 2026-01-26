'use client'

import { getGreeting } from '@/lib/time-utils'

interface User {
  id: string
  email: string
  display_name: string
  role: string
}

interface DashboardHeaderProps {
  user: User | null
}

/**
 * Dashboard page header with greeting and current date.
 */
export function DashboardHeader({ user }: DashboardHeaderProps) {
  const greeting = getGreeting()
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {greeting}{user?.display_name ? `, ${user.display_name}` : ''}
      </h1>
      <p className="text-muted-foreground">{today}</p>
    </div>
  )
}
