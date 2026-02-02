'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Plus, Edit, Trash2, MoreHorizontal, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEmployeeTariffAssignments } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type TariffAssignment = components['schemas']['EmployeeTariffAssignment']

interface TariffAssignmentListProps {
  employeeId: string
  onAdd: () => void
  onEdit: (assignment: TariffAssignment) => void
  onDelete: (assignment: TariffAssignment) => void
}

type ActiveFilter = 'all' | 'active' | 'inactive'

function isCurrent(assignment: TariffAssignment): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const from = new Date(assignment.effective_from)
  from.setHours(0, 0, 0, 0)
  if (from > today) return false
  if (assignment.effective_to) {
    const to = new Date(assignment.effective_to)
    to.setHours(0, 0, 0, 0)
    if (to < today) return false
  }
  return assignment.is_active
}

export function TariffAssignmentList({
  employeeId,
  onAdd,
  onEdit,
  onDelete,
}: TariffAssignmentListProps) {
  const t = useTranslations('employeeTariffAssignments')
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>('all')

  const activeParam = activeFilter === 'all' ? undefined : activeFilter === 'active'

  const { data, isLoading } = useEmployeeTariffAssignments(employeeId, {
    active: activeParam,
  })

  const assignments = data?.data ?? []

  if (isLoading) {
    return <ListSkeleton />
  }

  return (
    <div className="space-y-4">
      {/* Header with title, filter, and add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('listTitle')}</h3>
        <div className="flex items-center gap-2">
          {/* Filter buttons */}
          <div className="flex rounded-lg border">
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === filter
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                } ${filter === 'all' ? 'rounded-l-md' : filter === 'inactive' ? 'rounded-r-md' : ''}`}
              >
                {t(filter === 'all' ? 'filterAll' : filter === 'active' ? 'filterActive' : 'filterInactive')}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            {t('addAssignment')}
          </Button>
        </div>
      </div>

      {/* Assignment list or empty state */}
      {assignments.length === 0 ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              onEdit={() => onEdit(assignment)}
              onDelete={() => onDelete(assignment)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('employeeTariffAssignments')
  return (
    <div className="text-center py-12 px-6 border rounded-lg">
      <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        {t('emptyDescription')}
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        {t('addAssignment')}
      </Button>
    </div>
  )
}

function AssignmentCard({
  assignment,
  onEdit,
  onDelete,
}: {
  assignment: TariffAssignment
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations('employeeTariffAssignments')
  const current = isCurrent(assignment)
  const tariffLabel = assignment.tariff
    ? `${assignment.tariff.code} - ${assignment.tariff.name}`
    : assignment.tariff_id

  const dateRange = `${format(new Date(assignment.effective_from), 'dd.MM.yyyy')} - ${
    assignment.effective_to
      ? format(new Date(assignment.effective_to), 'dd.MM.yyyy')
      : t('openEnded')
  }`

  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
        current ? 'border-l-4 border-l-primary bg-primary/5' : 'border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{tariffLabel}</p>
          {current && (
            <Badge variant="default" className="bg-green-600 hover:bg-green-600/90 text-xs">
              {t('currentAssignment')}
            </Badge>
          )}
          {!assignment.is_active && (
            <Badge variant="secondary" className="text-xs">
              {t('filterInactive')}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{dateRange}</p>

        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs">
            {assignment.overwrite_behavior === 'overwrite'
              ? t('overwriteBehaviorOverwrite')
              : t('overwriteBehaviorPreserveManual')}
          </Badge>
        </div>

        {assignment.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{assignment.notes}</p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            {t('editAction')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            {t('deleteAction')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}
