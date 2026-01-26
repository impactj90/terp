'use client'

import * as React from 'react'
import { Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']

interface AbsenceTypeSelectorProps {
  /** Selected absence type ID */
  value?: string
  /** Selection callback */
  onChange?: (typeId: string) => void
  /** List of absence types */
  types?: AbsenceType[]
  /** Loading state */
  isLoading?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Additional className */
  className?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  vacation: 'Vacation',
  sick: 'Sick',
  personal: 'Personal',
  unpaid: 'Unpaid',
  holiday: 'Holiday',
  other: 'Other',
}

const CATEGORY_COLORS: Record<string, string> = {
  vacation: 'bg-green-500',
  sick: 'bg-red-500',
  personal: 'bg-blue-500',
  unpaid: 'bg-gray-500',
  holiday: 'bg-purple-500',
  other: 'bg-yellow-500',
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'bg-gray-500'
}

export function AbsenceTypeSelector({
  value,
  onChange,
  types = [],
  isLoading = false,
  disabled = false,
  className,
}: AbsenceTypeSelectorProps) {
  if (isLoading) {
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (types.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="mx-auto h-8 w-8 mb-2 opacity-50" />
        <p>No absence types available</p>
      </div>
    )
  }

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {types.map((type) => {
        const isSelected = value === type.id
        const colorClass = type.color
          ? undefined
          : getCategoryColor(type.category)

        return (
          <button
            key={type.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(type.id)}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
              'hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected && 'border-primary ring-2 ring-primary bg-primary/5',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {/* Selected indicator */}
            {isSelected && (
              <div className="absolute top-3 right-3">
                <Check className="h-4 w-4 text-primary" />
              </div>
            )}

            {/* Type header */}
            <div className="flex items-center gap-2">
              {/* Color indicator */}
              <span
                className={cn('h-3 w-3 rounded-full shrink-0', colorClass)}
                style={type.color ? { backgroundColor: type.color } : undefined}
              />
              <span className="font-medium">{type.name}</span>
            </div>

            {/* Description */}
            {type.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {type.description}
              </p>
            )}

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mt-auto">
              <Badge variant="secondary" className="text-xs">
                {CATEGORY_LABELS[type.category] ?? type.category}
              </Badge>
              {type.affects_vacation_balance && (
                <Badge variant="outline" className="text-xs">
                  Affects balance
                </Badge>
              )}
              {type.requires_approval && (
                <Badge variant="outline" className="text-xs">
                  Requires approval
                </Badge>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
