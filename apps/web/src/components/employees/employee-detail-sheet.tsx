'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Clock, Edit, Mail, Phone, User, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { StatusBadge } from './status-badge'
import { useEmployee } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

export interface EmployeeDetailSheetProps {
  /** Employee ID to fetch details for */
  employeeId: string | null
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when edit is clicked */
  onEdit: (employee: Employee) => void
  /** Callback when delete is clicked */
  onDelete: (employee: Employee) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '-'}</p>
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  )
}

/**
 * Sheet for displaying employee details with edit/delete actions.
 */
export function EmployeeDetailSheet({
  employeeId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: EmployeeDetailSheetProps) {
  const t = useTranslations('adminEmployees')
  const router = useRouter()

  // Fetch employee details
  const { data: employee, isLoading, isFetching } = useEmployee(employeeId ?? '', open && !!employeeId)

  // Show skeleton while loading or when we have an ID but data hasn't loaded yet
  const showSkeleton = isLoading || isFetching || (employeeId && !employee)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  const handleViewTimesheet = () => {
    if (employee) {
      router.push(`/timesheet?employee=${employee.id}`)
      onOpenChange(false)
    }
  }

  const handleEdit = () => {
    if (employee) {
      onEdit(employee)
    }
  }

  const handleDelete = () => {
    if (employee) {
      onDelete(employee)
    }
  }

  const initials = employee
    ? `${employee.first_name[0]}${employee.last_name[0]}`
    : '??'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        {showSkeleton ? (
          <EmployeeDetailSkeleton />
        ) : employee ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-medium">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="truncate">
                      {employee.first_name} {employee.last_name}
                    </SheetTitle>
                    <StatusBadge
                      isActive={employee.is_active}
                      exitDate={employee.exit_date}
                    />
                  </div>
                  <SheetDescription className="truncate">
                    {employee.personnel_number}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-4 px-4">
              <div className="py-4 space-y-1">
                {/* Contact Information */}
                <SectionHeader>{t('sectionContact')}</SectionHeader>
                <DetailRow
                  label={t('labelEmail')}
                  value={employee.email}
                  icon={<Mail className="h-4 w-4" />}
                />
                <DetailRow
                  label={t('labelPhone')}
                  value={employee.phone}
                  icon={<Phone className="h-4 w-4" />}
                />

                {/* Employment Details */}
                <SectionHeader>{t('sectionEmployment')}</SectionHeader>
                <DetailRow
                  label={t('labelDepartment')}
                  value={employee.department?.name}
                />
                <DetailRow
                  label={t('labelCostCenter')}
                  value={
                    employee.cost_center
                      ? `${employee.cost_center.name} (${employee.cost_center.code})`
                      : undefined
                  }
                />
                <DetailRow
                  label={t('labelEmploymentType')}
                  value={employee.employment_type?.name}
                />
                <DetailRow label={t('labelEntryDate')} value={formatDate(employee.entry_date)} />
                <DetailRow label={t('labelExitDate')} value={formatDate(employee.exit_date)} />

                {/* Contract Details */}
                <SectionHeader>{t('sectionContract')}</SectionHeader>
                <DetailRow
                  label={t('labelWeeklyHours')}
                  value={employee.weekly_hours ? t('weeklyHoursValue', { hours: employee.weekly_hours }) : undefined}
                />
                <DetailRow
                  label={t('labelVacationDays')}
                  value={employee.vacation_days_per_year ? t('vacationDaysValue', { days: employee.vacation_days_per_year }) : undefined}
                />

                {/* Access Cards */}
                {employee.cards && employee.cards.length > 0 && (
                  <>
                    <SectionHeader>{t('sectionAccessCards')}</SectionHeader>
                    <div className="space-y-2">
                      {employee.cards.map((card) => (
                        <div
                          key={card.id}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                        >
                          <div>
                            <p className="text-sm font-medium">{card.card_number}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {card.card_type}
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              card.is_active
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {card.is_active ? t('statusActive') : t('statusInactive')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Emergency Contacts */}
                {employee.contacts && employee.contacts.length > 0 && (
                  <>
                    <SectionHeader>{t('sectionContacts')}</SectionHeader>
                    <div className="space-y-2">
                      {employee.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                        >
                          <div>
                            <p className="text-sm font-medium">{contact.value}</p>
                            <p className="text-xs text-muted-foreground">
                              {contact.label || contact.contact_type}
                            </p>
                          </div>
                          {contact.is_primary && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {t('primary')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="flex-row gap-2 border-t pt-4">
              <Button variant="outline" onClick={handleViewTimesheet} className="flex-1">
                <Clock className="mr-2 h-4 w-4" />
                {t('viewTimesheet')}
              </Button>
              <Button variant="outline" onClick={handleEdit} className="flex-1">
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <UserX className="h-4 w-4 text-destructive" />
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{t('employeeDetails')}</SheetTitle>
              <SheetDescription>{t('employeeInformation')}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
              <User className="h-12 w-12 text-muted-foreground opacity-50" />
              <p className="mt-4 text-muted-foreground">{t('employeeNotFound')}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function EmployeeDetailSkeleton() {
  const t = useTranslations('adminEmployees')
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1">
            <SheetTitle className="sr-only">{t('loadingEmployeeDetails')}</SheetTitle>
            <Skeleton className="h-5 w-40 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </SheetHeader>
      <div className="space-y-4 py-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </>
  )
}
