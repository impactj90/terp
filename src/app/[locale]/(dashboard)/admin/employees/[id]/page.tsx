'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, UserX, Clock, Mail, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useEmployee, useDeleteEmployee } from '@/hooks'
import { TaxSocialSecurityTab } from '@/components/employees/payroll/tax-social-security-tab'
import { BankDetailsTab } from '@/components/employees/payroll/bank-details-tab'
import { CompensationTab } from '@/components/employees/payroll/compensation-tab'
import { FamilyTab } from '@/components/employees/payroll/family-tab'
import { BenefitsTab } from '@/components/employees/payroll/benefits-tab'
import { DisabilityTab } from '@/components/employees/payroll/disability-tab'
import { ForeignAssignmentsTab } from '@/components/employees/payroll/foreign-assignments-tab'
import { GarnishmentsTab } from '@/components/employees/payroll/garnishments-tab'
import { SpecialCasesTab } from '@/components/employees/payroll/special-cases-tab'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/employees/status-badge'
import { EmployeeFormSheet } from '@/components/employees/employee-form-sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  TariffAssignmentList,
  TariffAssignmentFormSheet,
  TariffAssignmentDeleteDialog,
  EffectiveTariffPreview,
} from '@/components/employees/tariff-assignments'
import { PersonnelFileTab } from '@/components/hr/personnel-file-tab'

// Assignment shape flows through from the tRPC output (camelCase Date
// objects). Kept loose here so the list/form/delete components don't
// need to agree on an exact structural type — each reads the fields
// it cares about directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TariffAssignment = any

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['employees.view'])
  const t = useTranslations('adminEmployees')
  const tc = useTranslations('common')
  const ta = useTranslations('employeeTariffAssignments')
  const tp = useTranslations('employeePayroll')

  const { allowed: canViewPayroll } = useHasPermission(['personnel.payroll_data.view'])
  const { allowed: canViewGarnishments } = useHasPermission(['personnel.garnishment.view'])
  const { allowed: canViewForeignAssignments } = useHasPermission(['personnel.foreign_assignment.view'])

  const employeeId = params.id
  const { data: employee, isLoading } = useEmployee(employeeId, !authLoading && !permLoading && canAccess)

  // Edit / delete state
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const deleteMutation = useDeleteEmployee()

  // Tariff assignment state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editAssignment, setEditAssignment] = React.useState<TariffAssignment | null>(null)
  const [deleteAssignment, setDeleteAssignment] = React.useState<TariffAssignment | null>(null)

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const handleConfirmDelete = async () => {
    if (!employee) return
    try {
      await deleteMutation.mutateAsync({ id: employee.id })
      router.push('/admin/employees')
    } catch {
      // Error handled by mutation
    }
  }

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (authLoading || isLoading) {
    return <DetailPageSkeleton />
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('employeeNotFound')}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/employees')}>
          {ta('backToList')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 self-start" onClick={() => router.push('/admin/employees')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tc('goBack')}</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium">
            {employee.firstName[0]}{employee.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {employee.firstName} {employee.lastName}
              </h1>
              <StatusBadge isActive={employee.isActive} exitDate={employee.exitDate} />
            </div>
            <p className="text-muted-foreground truncate">{employee.personnelNumber}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => router.push(`/timesheet?employee=${employee.id}`)}>
            <Clock className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t('viewTimesheet')}</span>
            <span className="sm:hidden">Zeiten</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            {t('edit')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
                <UserX className="h-4 w-4 text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tc('delete')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <div className="overflow-x-auto -mx-1 px-1 filter-scroll-area">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="overview">{ta('tabOverview')}</TabsTrigger>
            <TabsTrigger value="tariff-assignments">{ta('tabLabel')}</TabsTrigger>
            {canViewPayroll && <TabsTrigger value="tax-sv">{tp('tabs.taxSocialSecurity')}</TabsTrigger>}
            {canViewPayroll && <TabsTrigger value="bank">{tp('tabs.bankDetails')}</TabsTrigger>}
            {canViewPayroll && <TabsTrigger value="compensation">{tp('tabs.compensation')}</TabsTrigger>}
            {canViewPayroll && <TabsTrigger value="family">{tp('tabs.family')}</TabsTrigger>}
            {canViewPayroll && <TabsTrigger value="benefits">{tp('tabs.benefits')}</TabsTrigger>}
            {canViewPayroll && <TabsTrigger value="disability">{tp('tabs.disability')}</TabsTrigger>}
            {canViewForeignAssignments && <TabsTrigger value="foreign-assignments">{tp('tabs.foreignAssignments')}</TabsTrigger>}
            {canViewGarnishments && <TabsTrigger value="garnishments">{tp('tabs.garnishments')}</TabsTrigger>}
            {canViewPayroll && <TabsTrigger value="special-cases">{tp('tabs.specialCases')}</TabsTrigger>}
            <TabsTrigger value="personnel-file">{t('tabPersonnelFile')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-6">
          {/* Overview content -- same sections as employee-detail-sheet */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionContact')}</h3>
                <div className="space-y-3">
                  <DetailRow icon={<Mail className="h-4 w-4" />} label={t('labelEmail')} value={employee.email} />
                  <DetailRow icon={<Phone className="h-4 w-4" />} label={t('labelPhone')} value={employee.phone} />
                </div>
              </CardContent>
            </Card>

            {/* Employment Details */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionEmployment')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('labelDepartment')} value={employee.department?.name} />
                  <DetailRow label={t('labelCostCenter')} value={employee.costCenter ? `${employee.costCenter.name} (${employee.costCenter.code})` : undefined} />
                  <DetailRow label={t('labelEmploymentType')} value={employee.employmentType?.name} />
                  <DetailRow label={t('labelTariff')} value={employee.tariff?.name} />
                  <DetailRow label={t('labelEntryDate')} value={formatDate(employee.entryDate)} />
                  <DetailRow label={t('labelExitDate')} value={formatDate(employee.exitDate)} />
                </div>
              </CardContent>
            </Card>

            {/* Contract Details */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionContract')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('labelWeeklyHours')} value={employee.weeklyHours ? t('weeklyHoursValue', { hours: employee.weeklyHours }) : undefined} />
                  <DetailRow label={t('labelVacationDays')} value={employee.vacationDaysPerYear ? t('vacationDaysValue', { days: employee.vacationDaysPerYear }) : undefined} />
                </div>
              </CardContent>
            </Card>

            {/* Access Cards */}
            {employee.cards && employee.cards.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionAccessCards')}</h3>
                  <div className="space-y-2">
                    {employee.cards.map((card) => (
                      <div key={card.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{card.cardNumber}</p>
                          <p className="text-xs text-muted-foreground capitalize">{card.cardType}</p>
                        </div>
                        <Badge variant={card.isActive ? 'green' : 'gray'}>
                          {card.isActive ? t('statusActive') : t('statusInactive')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tariff-assignments" className="mt-6 space-y-6">
          <TariffAssignmentList
            employeeId={employeeId}
            onAdd={() => { setEditAssignment(null); setFormOpen(true) }}
            onEdit={(a) => { setEditAssignment(a); setFormOpen(true) }}
            onDelete={(a) => setDeleteAssignment(a)}
          />
          <EffectiveTariffPreview employeeId={employeeId} />
        </TabsContent>

        {canViewPayroll && (
          <TabsContent value="tax-sv" className="mt-6">
            <TaxSocialSecurityTab employeeId={employeeId} employee={employee} />
          </TabsContent>
        )}

        {canViewPayroll && (
          <TabsContent value="bank" className="mt-6">
            <BankDetailsTab employeeId={employeeId} employee={employee} />
          </TabsContent>
        )}

        {canViewPayroll && (
          <TabsContent value="compensation" className="mt-6">
            <CompensationTab employeeId={employeeId} employee={employee} />
          </TabsContent>
        )}

        {canViewPayroll && (
          <TabsContent value="family" className="mt-6">
            <FamilyTab employeeId={employeeId} employee={employee} />
          </TabsContent>
        )}

        {canViewPayroll && (
          <TabsContent value="benefits" className="mt-6">
            <BenefitsTab employeeId={employeeId} />
          </TabsContent>
        )}

        {canViewPayroll && (
          <TabsContent value="disability" className="mt-6">
            <DisabilityTab employeeId={employeeId} employee={employee} />
          </TabsContent>
        )}

        {canViewForeignAssignments && (
          <TabsContent value="foreign-assignments" className="mt-6">
            <ForeignAssignmentsTab employeeId={employeeId} />
          </TabsContent>
        )}

        {canViewGarnishments && (
          <TabsContent value="garnishments" className="mt-6">
            <GarnishmentsTab employeeId={employeeId} />
          </TabsContent>
        )}

        {canViewPayroll && (
          <TabsContent value="special-cases" className="mt-6">
            <SpecialCasesTab employeeId={employeeId} employee={employee} />
          </TabsContent>
        )}

        <TabsContent value="personnel-file" className="mt-6">
          <PersonnelFileTab employeeId={employeeId} />
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <EmployeeFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={employee as unknown as Parameters<typeof EmployeeFormSheet>[0]['employee']}
        onSuccess={() => setEditOpen(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deactivateEmployee')}
        description={t('deactivateDescription', { firstName: employee.firstName, lastName: employee.lastName })}
        confirmLabel={t('deactivate')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />

      {/* Tariff Assignment Form */}
      <TariffAssignmentFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditAssignment(null)
        }}
        employeeId={employeeId}
        assignment={editAssignment}
        onSuccess={() => { setFormOpen(false); setEditAssignment(null) }}
      />

      {/* Tariff Assignment Delete */}
      <TariffAssignmentDeleteDialog
        assignment={deleteAssignment}
        employeeId={employeeId}
        onOpenChange={(open) => { if (!open) setDeleteAssignment(null) }}
        onSuccess={() => setDeleteAssignment(null)}
      />
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '-'}</p>
      </div>
    </div>
  )
}

function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded" />
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}
