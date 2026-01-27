'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { MoreHorizontal, Eye, Edit, Clock, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from './status-badge'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

interface EmployeeDataTableProps {
  /** List of employees to display */
  employees: Employee[]
  /** Whether the table is loading */
  isLoading: boolean
  /** Set of selected employee IDs */
  selectedIds: Set<string>
  /** Callback when selection changes */
  onSelectIds: (ids: Set<string>) => void
  /** Callback when view details is clicked */
  onView: (employee: Employee) => void
  /** Callback when edit is clicked */
  onEdit: (employee: Employee) => void
  /** Callback when delete is clicked */
  onDelete: (employee: Employee) => void
  /** Callback when view timesheet is clicked */
  onViewTimesheet: (employee: Employee) => void
}

/**
 * Data table for displaying employees with selection, sorting, and actions.
 */
export function EmployeeDataTable({
  employees,
  isLoading,
  selectedIds,
  onSelectIds,
  onView,
  onEdit,
  onDelete,
  onViewTimesheet,
}: EmployeeDataTableProps) {
  const t = useTranslations('adminEmployees')
  // Handle select all toggle
  const allSelected = employees.length > 0 && employees.every((e) => selectedIds.has(e.id))
  const someSelected = employees.some((e) => selectedIds.has(e.id)) && !allSelected

  const handleSelectAll = () => {
    if (allSelected) {
      // Deselect all on current page
      const newSet = new Set(selectedIds)
      employees.forEach((e) => newSet.delete(e.id))
      onSelectIds(newSet)
    } else {
      // Select all on current page
      const newSet = new Set(selectedIds)
      employees.forEach((e) => newSet.add(e.id))
      onSelectIds(newSet)
    }
  }

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    onSelectIds(newSet)
  }

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (isLoading) {
    return <EmployeeDataTableSkeleton />
  }

  if (employees.length === 0) {
    return null // Let the parent handle empty state
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={handleSelectAll}
              aria-label={t('selectAll')}
            />
          </TableHead>
          <TableHead className="w-28">{t('columnPersonnelNumber')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnEmail')}</TableHead>
          <TableHead>{t('columnDepartment')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-28">{t('columnEntryDate')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => (
          <TableRow
            key={employee.id}
            data-state={selectedIds.has(employee.id) ? 'selected' : undefined}
            className="cursor-pointer"
            onClick={() => onView(employee)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.has(employee.id)}
                onCheckedChange={() => handleSelectOne(employee.id)}
                aria-label={t('selectEmployee', { first: employee.first_name, last: employee.last_name })}
              />
            </TableCell>
            <TableCell className="font-mono text-sm">
              {employee.personnel_number}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {employee.first_name[0]}
                  {employee.last_name[0]}
                </div>
                <span className="font-medium">
                  {employee.first_name} {employee.last_name}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {employee.email || '-'}
            </TableCell>
            <TableCell>{employee.department?.name || '-'}</TableCell>
            <TableCell>
              <StatusBadge
                isActive={employee.is_active}
                exitDate={employee.exit_date}
              />
            </TableCell>
            <TableCell>{formatDate(employee.entry_date)}</TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(employee)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(employee)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onViewTimesheet(employee)}>
                    <Clock className="mr-2 h-4 w-4" />
                    {t('viewTimesheet')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(employee)}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    {t('deactivate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function EmployeeDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Skeleton className="h-4 w-4" />
          </TableHead>
          <TableHead className="w-28">
            <Skeleton className="h-4 w-20" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-24" />
          </TableHead>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-28">
            <Skeleton className="h-4 w-20" />
          </TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-4" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-40" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-8 w-8" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
