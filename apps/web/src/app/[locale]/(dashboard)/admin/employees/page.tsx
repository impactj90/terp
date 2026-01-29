'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useEmployees, useDeleteEmployee } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmployeeDataTable } from '@/components/employees/employee-data-table'
import { EmployeeFormSheet } from '@/components/employees/employee-form-sheet'
import { EmployeeDetailSheet } from '@/components/employees/employee-detail-sheet'
import { BulkActions } from '@/components/employees/bulk-actions'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

export default function EmployeesPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminEmployees')

  // Pagination and filters
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(20)
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Dialogs state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editEmployee, setEditEmployee] = React.useState<Employee | null>(null)
  const [viewEmployee, setViewEmployee] = React.useState<Employee | null>(null)
  const [deleteEmployee, setDeleteEmployee] = React.useState<Employee | null>(null)

  // Fetch employees
  const { data, isLoading, isFetching } = useEmployees({
    page,
    limit,
    search: search || undefined,
    active: activeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteEmployee()

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1)
  }, [search, activeFilter])

  // Clear selection when page changes
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [page, search, activeFilter])

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const employees = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }

  const handleView = (employee: Employee) => {
    setViewEmployee(employee)
  }

  const handleEdit = (employee: Employee) => {
    setEditEmployee(employee)
    setViewEmployee(null)
  }

  const handleDelete = (employee: Employee) => {
    setDeleteEmployee(employee)
  }

  const handleViewTimesheet = (employee: Employee) => {
    // TODO: Navigate to employee timesheet view
    router.push(`/timesheet?employee=${employee.id}`)
  }

  const handleConfirmDelete = async () => {
    if (!deleteEmployee) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteEmployee.id },
      })
      setDeleteEmployee(null)
      // Remove from selection if selected
      if (selectedIds.has(deleteEmployee.id)) {
        const newSet = new Set(selectedIds)
        newSet.delete(deleteEmployee.id)
        setSelectedIds(newSet)
      }
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditEmployee(null)
  }

  // Check for any active filters
  const hasFilters = Boolean(search) || activeFilter !== undefined

  if (authLoading) {
    return <EmployeesPageSkeleton />
  }

  if (!isAdmin) {
    return null // Will redirect
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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newEmployee')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-80"
          disabled={isFetching}
        />

        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
          onValueChange={(value) => {
            if (value === 'all') {
              setActiveFilter(undefined)
            } else {
              setActiveFilter(value === 'active')
            }
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatus')}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <BulkActions
            selectedCount={selectedIds.size}
            selectedIds={selectedIds}
            onClear={() => setSelectedIds(new Set())}
            filters={{
              search: search || undefined,
              isActive: activeFilter,
            }}
          />
        )}
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : employees.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <EmployeeDataTable
              employees={employees}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewTimesheet={handleViewTimesheet}
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={handleLimitChange}
          disabled={isFetching}
        />
      )}

      {/* Create/Edit Form */}
      <EmployeeFormSheet
        open={createOpen || !!editEmployee}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditEmployee(null)
          }
        }}
        employee={editEmployee}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <EmployeeDetailSheet
        employeeId={viewEmployee?.id ?? null}
        open={!!viewEmployee}
        onOpenChange={(open) => {
          if (!open) {
            setViewEmployee(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteEmployee}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteEmployee(null)
          }
        }}
        title={t('deactivateEmployee')}
        description={
          deleteEmployee
            ? t('deactivateDescription', { firstName: deleteEmployee.first_name, lastName: deleteEmployee.last_name })
            : ''
        }
        confirmLabel={t('deactivate')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminEmployees')
  return (
    <div className="text-center py-12 px-6">
      <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addEmployee')}
        </Button>
      )}
    </div>
  )
}

function EmployeesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Table */}
      <Skeleton className="h-96" />

      {/* Pagination */}
      <div className="flex justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64" />
      </div>
    </div>
  )
}
