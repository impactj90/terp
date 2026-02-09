'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, UserX, Clock, Mail, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useEmployee, useDeleteEmployee } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/employees/status-badge'
import { EmployeeFormSheet } from '@/components/employees/employee-form-sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  TariffAssignmentList,
  TariffAssignmentFormSheet,
  TariffAssignmentDeleteDialog,
  EffectiveTariffPreview,
} from '@/components/employees/tariff-assignments'
import type { components } from '@/lib/api/types'

type TariffAssignment = components['schemas']['EmployeeTariffAssignment']

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['employees.view'])
  const t = useTranslations('adminEmployees')
  const ta = useTranslations('employeeTariffAssignments')

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
      await deleteMutation.mutateAsync({ path: { id: employee.id } })
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/employees')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-medium">
            {employee.first_name[0]}{employee.last_name[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {employee.first_name} {employee.last_name}
              </h1>
              <StatusBadge isActive={employee.is_active} exitDate={employee.exit_date} />
            </div>
            <p className="text-muted-foreground">{employee.personnel_number}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/timesheet?employee=${employee.id}`)}>
              <Clock className="mr-2 h-4 w-4" />
              {t('viewTimesheet')}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
              <UserX className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{ta('tabOverview')}</TabsTrigger>
          <TabsTrigger value="tariff-assignments">{ta('tabLabel')}</TabsTrigger>
        </TabsList>

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
                  <DetailRow label={t('labelCostCenter')} value={employee.cost_center ? `${employee.cost_center.name} (${employee.cost_center.code})` : undefined} />
                  <DetailRow label={t('labelEmploymentType')} value={employee.employment_type?.name} />
                  <DetailRow label={t('labelTariff')} value={employee.tariff ? `${employee.tariff.code} - ${employee.tariff.name}` : undefined} />
                  <DetailRow label={t('labelEntryDate')} value={formatDate(employee.entry_date)} />
                  <DetailRow label={t('labelExitDate')} value={formatDate(employee.exit_date)} />
                </div>
              </CardContent>
            </Card>

            {/* Contract Details */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionContract')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('labelWeeklyHours')} value={employee.weekly_hours ? t('weeklyHoursValue', { hours: employee.weekly_hours }) : undefined} />
                  <DetailRow label={t('labelVacationDays')} value={employee.vacation_days_per_year ? t('vacationDaysValue', { days: employee.vacation_days_per_year }) : undefined} />
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
                          <p className="text-sm font-medium">{card.card_number}</p>
                          <p className="text-xs text-muted-foreground capitalize">{card.card_type}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${card.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {card.is_active ? t('statusActive') : t('statusInactive')}
                        </span>
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
      </Tabs>

      {/* Edit Sheet */}
      <EmployeeFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={employee}
        onSuccess={() => setEditOpen(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deactivateEmployee')}
        description={t('deactivateDescription', { firstName: employee.first_name, lastName: employee.last_name })}
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
