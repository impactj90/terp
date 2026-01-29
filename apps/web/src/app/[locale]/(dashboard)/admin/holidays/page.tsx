'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, CalendarDays, List, CalendarRange, X, Copy, Wand2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useHolidays, useDeleteHoliday } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { YearSelector } from '@/components/vacation/year-selector'
import {
  HolidayDataTable,
  HolidayYearCalendar,
  HolidayFormSheet,
  HolidayDetailSheet,
  HolidayGenerateDialog,
  HolidayCopyDialog,
} from '@/components/holidays'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

export default function HolidaysPage() {
  const router = useRouter()
  const t = useTranslations('adminHolidays')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // View mode and filters
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('calendar')
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [search, setSearch] = React.useState('')

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createDefaultDate, setCreateDefaultDate] = React.useState<Date | null>(null)
  const [editHoliday, setEditHoliday] = React.useState<Holiday | null>(null)
  const [viewHoliday, setViewHoliday] = React.useState<Holiday | null>(null)
  const [deleteHoliday, setDeleteHoliday] = React.useState<Holiday | null>(null)
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [copyOpen, setCopyOpen] = React.useState(false)

  // Fetch holidays for selected year
  const { data: holidaysData, isLoading } = useHolidays({
    year,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteHoliday()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const holidays = holidaysData ?? []

  // Filter by search (client-side)
  const filteredHolidays = React.useMemo(() => {
    if (!search.trim()) return holidays

    const searchLower = search.toLowerCase()
    return holidays.filter((h) => h.name.toLowerCase().includes(searchLower))
  }, [holidays, search])

  const handleView = (holiday: Holiday) => {
    setViewHoliday(holiday)
  }

  const handleEdit = (holiday: Holiday) => {
    setEditHoliday(holiday)
    setViewHoliday(null)
  }

  const handleDelete = (holiday: Holiday) => {
    setDeleteHoliday(holiday)
  }

  const handleDateClick = (date: Date) => {
    setCreateDefaultDate(date)
    setCreateOpen(true)
  }

  const handleHolidayClick = (holiday: Holiday) => {
    setViewHoliday(holiday)
  }

  const handleConfirmDelete = async () => {
    if (!deleteHoliday) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteHoliday.id },
      })
      setDeleteHoliday(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditHoliday(null)
    setCreateDefaultDate(null)
  }

  const hasFilters = Boolean(search)

  if (authLoading) {
    return <HolidaysPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setGenerateOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" />
            {t('generateButton')}
          </Button>
          <Button variant="outline" onClick={() => setCopyOpen(true)}>
            <Copy className="mr-2 h-4 w-4" />
            {t('copyButton')}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('newHoliday')}
          </Button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <YearSelector value={year} onChange={setYear} className="w-[120px]" />

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-64"
        />

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}

        {/* View mode toggle */}
        <div className="ml-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'calendar')}>
            <TabsList>
              <TabsTrigger value="calendar">
                <CalendarRange className="mr-2 h-4 w-4" />
                {t('calendar')}
              </TabsTrigger>
              <TabsTrigger value="list">
                <List className="mr-2 h-4 w-4" />
                {t('list')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Holiday count */}
      <div className="text-sm text-muted-foreground">
        {filteredHolidays.length === 1
          ? t('holidayCount', { count: filteredHolidays.length, year })
          : t('holidaysCount', { count: filteredHolidays.length, year })}
      </div>

      {/* Content */}
      <Card>
        <CardContent className={viewMode === 'calendar' ? 'p-4' : 'p-0'}>
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : viewMode === 'calendar' ? (
            filteredHolidays.length === 0 && !hasFilters ? (
              <EmptyState onCreateClick={() => setCreateOpen(true)} />
            ) : (
              <HolidayYearCalendar
                year={year}
                holidays={filteredHolidays}
                onHolidayClick={handleHolidayClick}
                onDateClick={handleDateClick}
              />
            )
          ) : filteredHolidays.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <HolidayDataTable
              holidays={filteredHolidays}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <HolidayFormSheet
        open={createOpen || !!editHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditHoliday(null)
            setCreateDefaultDate(null)
          }
        }}
        holiday={editHoliday}
        defaultDate={createDefaultDate}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <HolidayDetailSheet
        holidayId={viewHoliday?.id ?? null}
        open={!!viewHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setViewHoliday(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteHoliday(null)
          }
        }}
        title={t('deleteHoliday')}
        description={
          deleteHoliday
            ? t('deleteDescription', { name: deleteHoliday.name })
            : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />

      {/* Generate Dialog */}
      <HolidayGenerateDialog
        open={generateOpen}
        year={year}
        onOpenChange={setGenerateOpen}
      />

      {/* Copy Dialog */}
      <HolidayCopyDialog
        open={copyOpen}
        targetYear={year}
        onOpenChange={setCopyOpen}
      />
    </div>
  )
}

function EmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminHolidays')
  return (
    <div className="text-center py-12 px-6">
      <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addHoliday')}
        </Button>
      )}
    </div>
  )
}

function HolidaysPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-[120px]" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40 ml-auto" />
      </div>

      {/* Content */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}
