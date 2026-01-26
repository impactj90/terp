'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, CalendarDays, List, CalendarRange, X } from 'lucide-react'
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
} from '@/components/holidays'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

export default function HolidaysPage() {
  const router = useRouter()
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
          <h1 className="text-2xl font-bold tracking-tight">Holidays</h1>
          <p className="text-muted-foreground">
            Manage public holidays and company-wide days off
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Holiday
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <YearSelector value={year} onChange={setYear} className="w-[120px]" />

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search holidays..."
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
            Clear filters
          </Button>
        )}

        {/* View mode toggle */}
        <div className="ml-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'calendar')}>
            <TabsList>
              <TabsTrigger value="calendar">
                <CalendarRange className="mr-2 h-4 w-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="list">
                <List className="mr-2 h-4 w-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Holiday count */}
      <div className="text-sm text-muted-foreground">
        {filteredHolidays.length} holiday{filteredHolidays.length !== 1 ? 's' : ''} in {year}
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
        title="Delete Holiday"
        description={
          deleteHoliday
            ? `Are you sure you want to delete "${deleteHoliday.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
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
  return (
    <div className="text-center py-12 px-6">
      <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No holidays found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search'
          : 'Get started by creating your first holiday'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Add Holiday
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
