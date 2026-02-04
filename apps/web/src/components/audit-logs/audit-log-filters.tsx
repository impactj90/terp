'use client'

import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface AuditLogFiltersProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  userId: string | null
  onUserChange: (id: string | null) => void
  entityType: string | null
  onEntityTypeChange: (type: string | null) => void
  entityId: string
  onEntityIdChange: (id: string) => void
  action: string | null
  onActionChange: (action: string | null) => void
  users: Array<{ id: string; display_name: string }>
  isLoadingUsers?: boolean
  onClearFilters: () => void
  hasFilters: boolean
}

const ENTITY_TYPES = [
  'booking', 'absence', 'monthly_value', 'daily_value', 'employee', 'user',
  'department', 'team', 'cost_center', 'employment_type', 'day_plan', 'week_plan',
  'tariff', 'holiday', 'absence_type', 'booking_type', 'account', 'vacation_balance',
  'report',
]

const ACTIONS = [
  'create', 'update', 'delete', 'approve', 'reject', 'close',
  'reopen', 'export', 'import', 'login', 'logout',
]

export function AuditLogFilters({
  dateRange,
  onDateRangeChange,
  userId,
  onUserChange,
  entityType,
  onEntityTypeChange,
  entityId,
  onEntityIdChange,
  action,
  onActionChange,
  users,
  isLoadingUsers = false,
  onClearFilters,
  hasFilters,
}: AuditLogFiltersProps) {
  const t = useTranslations('auditLogs')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 md:items-end">
        <div className="space-y-2">
          <Label>{t('filters.dateRange')}</Label>
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </div>

        <div className="space-y-2">
          <Label>{t('filters.user')}</Label>
          <Select
            value={userId ?? 'all'}
            onValueChange={(value) => onUserChange(value === 'all' ? null : value)}
            disabled={isLoadingUsers}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allUsers')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allUsers')}</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.entityType')}</Label>
          <Select
            value={entityType ?? 'all'}
            onValueChange={(value) => onEntityTypeChange(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allEntityTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allEntityTypes')}</SelectItem>
              {ENTITY_TYPES.map((et) => (
                <SelectItem key={et} value={et}>
                  {t(`entityTypes.${et}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.action')}</Label>
          <Select
            value={action ?? 'all'}
            onValueChange={(value) => onActionChange(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allActions')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allActions')}</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`actions.${a}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.entityId')}</Label>
          <Input
            value={entityId}
            onChange={(e) => onEntityIdChange(e.target.value)}
            placeholder={t('filters.entityIdPlaceholder')}
          />
        </div>

        {hasFilters && (
          <div className="flex items-end">
            <Button variant="ghost" onClick={onClearFilters} size="sm">
              <X className="mr-2 h-4 w-4" />
              {t('filters.clearFilters')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
