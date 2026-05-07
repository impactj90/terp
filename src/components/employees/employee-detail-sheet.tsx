'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { AlertCircle, Clock, Edit, Mail, Phone, RefreshCw, User, UserX } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBadge } from './status-badge'
import { useEmployee } from '@/hooks'

type EmployeeData = NonNullable<ReturnType<typeof useEmployee>['data']>

export interface EmployeeDetailSheetProps {
  /** Employee ID to fetch details for */
  employeeId: string | null
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when edit is clicked */
  onEdit: (employee: EmployeeData) => void
  /** Callback when delete is clicked */
  onDelete: (employee: EmployeeData) => void
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
  const tc = useTranslations('common')
  const router = useRouter()

  // Fetch employee details
  const { data: employee, isLoading, isFetching, error, refetch } = useEmployee(employeeId ?? '', open && !!employeeId)

  // Show skeleton while loading or when we have an ID but data hasn't loaded yet
  const showSkeleton = !error && (isLoading || isFetching || (employeeId && !employee))

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
    ? `${employee.firstName?.[0] ?? '?'}${employee.lastName?.[0] ?? '?'}`
    : '??'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        {error ? (
          <>
            <SheetHeader>
              <SheetTitle>{t('employeeDetails')}</SheetTitle>
              <SheetDescription>{t('employeeInformation')}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive opacity-50" />
              <p className="mt-4 text-destructive">{tc('failedToLoad')}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="mt-2"
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                {tc('retry')}
              </Button>
            </div>
          </>
        ) : showSkeleton ? (
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
                      {employee.firstName} {employee.lastName}
                    </SheetTitle>
                    <StatusBadge
                      isActive={employee.isActive}
                      exitDate={employee.exitDate as unknown as string}
                    />
                  </div>
                  <SheetDescription className="truncate">
                    {employee.personnelNumber}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6">
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
                    employee.costCenter
                      ? `${employee.costCenter.name} (${employee.costCenter.code})`
                      : undefined
                  }
                />
                <DetailRow
                  label={t('labelEmploymentType')}
                  value={employee.employmentType?.name}
                />
                <DetailRow
                  label={t('labelTariff')}
                  value={employee.tariff?.name}
                />
                <DetailRow
                  label={t('labelWageGroup')}
                  value={
                    (employee as unknown as { wageGroup?: { code: string; name: string } | null }).wageGroup
                      ? `${(employee as unknown as { wageGroup: { code: string; name: string } }).wageGroup.code} - ${(employee as unknown as { wageGroup: { code: string; name: string } }).wageGroup.name}`
                      : undefined
                  }
                />
                <DetailRow label={t('labelEntryDate')} value={formatDate(employee.entryDate as unknown as string)} />
                <DetailRow label={t('labelExitDate')} value={formatDate(employee.exitDate as unknown as string)} />

                {/* Contract Details */}
                <SectionHeader>{t('sectionContract')}</SectionHeader>
                <DetailRow
                  label={t('labelWeeklyHours')}
                  value={employee.weeklyHours ? t('weeklyHoursValue', { hours: employee.weeklyHours }) : undefined}
                />
                <DetailRow
                  label={t('labelVacationDays')}
                  value={employee.vacationDaysPerYear ? t('vacationDaysValue', { days: employee.vacationDaysPerYear }) : undefined}
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
                            <p className="text-sm font-medium">{card.cardNumber}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {card.cardType}
                            </p>
                          </div>
                          <Badge variant={card.isActive ? 'green' : 'gray'}>
                            {card.isActive ? t('statusActive') : t('statusInactive')}
                          </Badge>
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
                              {contact.label || contact.contactType}
                            </p>
                          </div>
                          {contact.isPrimary && (
                            <Badge variant="blue">
                              {t('primary')}
                            </Badge>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleDelete}>
                    <UserX className="h-4 w-4 text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tc('delete')}</TooltipContent>
              </Tooltip>
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
