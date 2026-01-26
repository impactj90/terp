'use client'

import * as React from 'react'
import { GripVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']

interface RollingWeekPlanSelectorProps {
  weekPlans: WeekPlan[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function RollingWeekPlanSelector({
  weekPlans,
  selectedIds,
  onChange,
  disabled,
}: RollingWeekPlanSelectorProps) {
  const availablePlans = weekPlans.filter((wp) => !selectedIds.includes(wp.id))

  const handleAdd = (id: string) => {
    onChange([...selectedIds, id])
  }

  const handleRemove = (index: number) => {
    onChange(selectedIds.filter((_, i) => i !== index))
  }

  const handleMove = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= selectedIds.length) return

    const newIds = [...selectedIds]
    const temp = newIds[fromIndex]!
    newIds[fromIndex] = newIds[toIndex]!
    newIds[toIndex] = temp
    onChange(newIds)
  }

  return (
    <div className="space-y-3">
      <Label>Week Plans (in rotation order)</Label>

      {selectedIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No week plans selected</p>
      ) : (
        <div className="space-y-2">
          {selectedIds.map((id, index) => {
            const plan = weekPlans.find((wp) => wp.id === id)
            return (
              <div
                key={id}
                className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Week {index + 1}:</span>
                <span className="flex-1 text-sm">
                  {plan?.code} - {plan?.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleMove(index, 'up')}
                  disabled={disabled || index === 0}
                >
                  <span className="sr-only">Move up</span>
                  &uarr;
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleMove(index, 'down')}
                  disabled={disabled || index === selectedIds.length - 1}
                >
                  <span className="sr-only">Move down</span>
                  &darr;
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove</span>
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {availablePlans.length > 0 && (
        <div className="flex gap-2">
          <Select onValueChange={handleAdd} disabled={disabled} value="">
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Add week plan to rotation..." />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.map((wp) => (
                <SelectItem key={wp.id} value={wp.id}>
                  {wp.code} - {wp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Week plans rotate in sequence. Week 1 uses the first plan, Week 2 the second, etc.
      </p>
    </div>
  )
}
