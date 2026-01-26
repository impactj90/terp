'use client'

import { Badge } from '@/components/ui/badge'

interface TeamStatusBadgeProps {
  isActive: boolean
}

/**
 * Badge component for displaying team active/inactive status.
 */
export function TeamStatusBadge({ isActive }: TeamStatusBadgeProps) {
  if (isActive) {
    return (
      <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
        Active
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      Inactive
    </Badge>
  )
}
