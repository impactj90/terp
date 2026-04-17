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
import { ResponsiveTable } from '@/components/ui/responsive-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ProbationBadge } from './probation-badge'
import { StatusBadge } from './status-badge'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Employee = any

// Shared responsive column classes — applied to both TableHead and TableCell
const COL = {
  personnelNumber: 'hidden md:table-cell',
  email: 'hidden xl:table-cell',
  department: 'hidden lg:table-cell',
  location: 'hidden xl:table-cell',
  tariff: 'hidden xl:table-cell',
  status: 'hidden sm:table-cell',
  entryDate: 'hidden lg:table-cell',
} as const

// Sticky classes for checkbox (left-0) and name (left-12) columns on mobile
const STICKY_CHECKBOX =
  'max-lg:sticky max-lg:left-0 max-lg:z-10 max-lg:bg-card data-[state=selected]:max-lg:bg-muted'
const STICKY_NAME =
  'max-lg:sticky max-lg:left-12 max-lg:z-10 max-lg:bg-card data-[state=selected]:max-lg:bg-muted sticky-col-end'

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
    <ResponsiveTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={`w-12 ${STICKY_CHECKBOX}`}>
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={handleSelectAll}
                aria-label={t('selectAll')}
              />
            </TableHead>
            <TableHead className={`w-28 ${COL.personnelNumber}`}>{t('columnPersonnelNumber')}</TableHead>
            <TableHead className={STICKY_NAME}>{t('columnName')}</TableHead>
            <TableHead className={COL.email}>{t('columnEmail')}</TableHead>
            <TableHead className={COL.department}>{t('columnDepartment')}</TableHead>
            <TableHead className={COL.location}>{t('columnLocation')}</TableHead>
            <TableHead className={COL.tariff}>{t('columnTariff')}</TableHead>
            <TableHead className={`w-40 ${COL.status}`}>{t('columnStatus')}</TableHead>
            <TableHead className={`w-28 ${COL.entryDate}`}>{t('columnEntryDate')}</TableHead>
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
              <TableCell className={STICKY_CHECKBOX} onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(employee.id)}
                  onCheckedChange={() => handleSelectOne(employee.id)}
                  aria-label={t('selectEmployee', { first: employee.firstName, last: employee.lastName })}
                />
              </TableCell>
              <TableCell className={`font-mono text-sm ${COL.personnelNumber}`}>
                {employee.personnelNumber}
              </TableCell>
              <TableCell className={STICKY_NAME}>
                <div className="flex items-center gap-3 truncate-mobile">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {employee.firstName?.[0] ?? '?'}
                    {employee.lastName?.[0] ?? '?'}
                  </div>
                  <span className="font-medium truncate">
                    {employee.firstName} {employee.lastName}
                  </span>
                </div>
              </TableCell>
              <TableCell className={`text-muted-foreground ${COL.email}`}>
                {employee.email || '-'}
              </TableCell>
              <TableCell className={COL.department}>{employee.department?.name || '-'}</TableCell>
              <TableCell className={COL.location}>{employee.location?.name || '-'}</TableCell>
              <TableCell className={`text-muted-foreground ${COL.tariff}`}>
                {employee.tariff?.name || '-'}
              </TableCell>
              <TableCell className={COL.status}>
                <div className="flex flex-wrap gap-1">
                  <StatusBadge
                    isActive={employee.isActive}
                    exitDate={employee.exitDate}
                  />
                  <ProbationBadge status={employee.probation.status} />
                </div>
              </TableCell>
              <TableCell className={COL.entryDate}>{formatDate(employee.entryDate)}</TableCell>
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
    </ResponsiveTable>
  )
}

function EmployeeDataTableSkeleton() {
  return (
    <ResponsiveTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={`w-12 ${STICKY_CHECKBOX}`}>
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead className={`w-28 ${COL.personnelNumber}`}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
            <TableHead className={STICKY_NAME}>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className={COL.email}>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className={COL.department}>
              <Skeleton className="h-4 w-24" />
            </TableHead>
            <TableHead className={COL.location}>
              <Skeleton className="h-4 w-24" />
            </TableHead>
            <TableHead className={COL.tariff}>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className={`w-40 ${COL.status}`}>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className={`w-28 ${COL.entryDate}`}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className={STICKY_CHECKBOX}>
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell className={COL.personnelNumber}>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell className={STICKY_NAME}>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </TableCell>
              <TableCell className={COL.email}>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell className={COL.department}>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className={COL.location}>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className={COL.tariff}>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell className={COL.status}>
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </TableCell>
              <TableCell className={COL.entryDate}>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ResponsiveTable>
  )
}
