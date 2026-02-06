'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']

interface ShiftPaletteProps {
  shifts: Shift[]
  isLoading: boolean
}

export function ShiftPalette({ shifts, isLoading }: ShiftPaletteProps) {
  const t = useTranslations('shiftPlanning')

  const activeShifts = React.useMemo(
    () => shifts.filter((s) => s.is_active),
    [shifts]
  )

  return (
    <div className="w-[200px] shrink-0 border-r bg-muted/30">
      <div className="p-3 border-b">
        <h3 className="text-sm font-medium">{t('shiftPalette')}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {t('paletteDragHint')}
        </p>
      </div>

      <div className="p-2 space-y-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))
        ) : activeShifts.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">
            {t('paletteEmpty')}
          </p>
        ) : (
          activeShifts.map((shift) => (
            <DraggableShiftItem key={shift.id} shift={shift} />
          ))
        )}
      </div>
    </div>
  )
}

function DraggableShiftItem({ shift }: { shift: Shift }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `palette-${shift.id}`,
      data: { type: 'shift', shift },
    })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 rounded-md border bg-background p-2 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
    >
      <div
        className="h-5 w-5 rounded-sm border shrink-0"
        style={{ backgroundColor: shift.color || '#808080' }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{shift.code}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {shift.name}
        </div>
      </div>
    </div>
  )
}
