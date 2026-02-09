'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Edit, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteMacroAssignment, useUpdateMacroAssignment, useTariffs, useEmployees } from '@/hooks/api'
import { MacroAssignmentFormDialog } from './macro-assignment-form-dialog'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['schema1']
type MacroAssignment = components['schemas']['schema2']

interface MacroAssignmentListProps {
  macroId: string
  macroType: Macro['macro_type']
  assignments: MacroAssignment[]
}

export function MacroAssignmentList({
  macroId,
  macroType,
  assignments,
}: MacroAssignmentListProps) {
  const t = useTranslations('adminMacros')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editAssignment, setEditAssignment] = React.useState<MacroAssignment | null>(null)
  const [deleteAssignment, setDeleteAssignment] = React.useState<MacroAssignment | null>(null)

  const deleteMutation = useDeleteMacroAssignment()
  const updateMutation = useUpdateMacroAssignment()
  const { data: tariffsData } = useTariffs({ enabled: true })
  const { data: employeesData } = useEmployees({ enabled: true })

  const tariffs = tariffsData?.data ?? []
  const employees = employeesData?.data ?? []

  const getTargetName = (assignment: MacroAssignment): string => {
    if (assignment.tariff_id) {
      const tariff = tariffs.find((t) => t.id === assignment.tariff_id)
      return tariff ? `${tariff.code} - ${tariff.name}` : assignment.tariff_id
    }
    if (assignment.employee_id) {
      const employee = employees.find((e) => e.id === assignment.employee_id)
      return employee
        ? `${employee.first_name} ${employee.last_name}`
        : assignment.employee_id
    }
    return '-'
  }

  const getExecutionDayLabel = (day: number): string => {
    if (macroType === 'weekly') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return days[day] ?? String(day)
    }
    return String(day)
  }

  const handleToggleActive = async (assignment: MacroAssignment, active: boolean) => {
    await updateMutation.mutateAsync({
      path: { id: macroId, assignmentId: assignment.id },
      body: { is_active: active },
    })
  }

  const handleConfirmDelete = async () => {
    if (!deleteAssignment) return
    await deleteMutation.mutateAsync({
      path: { id: macroId, assignmentId: deleteAssignment.id },
    })
    setDeleteAssignment(null)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-medium">{t('assignmentListTitle')}</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addAssignment')}
        </Button>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <div className="text-center py-8">
            <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <p className="mt-4 text-muted-foreground">{t('noAssignments')}</p>
            <Button className="mt-4" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addAssignment')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {assignment.tariff_id ? t('assignByTariff') : t('assignByEmployee')}
                    </Badge>
                    <span className="font-medium">{getTargetName(assignment)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('executionDay')}: {getExecutionDayLabel(assignment.execution_day)}
                  </p>
                </div>
                <Switch
                  checked={assignment.is_active ?? true}
                  onCheckedChange={(checked) => handleToggleActive(assignment, checked)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditAssignment(assignment)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteAssignment(assignment)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <MacroAssignmentFormDialog
        open={createOpen || !!editAssignment}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditAssignment(null)
          }
        }}
        macroId={macroId}
        macroType={macroType}
        assignment={editAssignment}
      />

      <ConfirmDialog
        open={!!deleteAssignment}
        onOpenChange={(open) => !open && setDeleteAssignment(null)}
        title={t('deleteAssignment')}
        description={t('deleteAssignmentDescription')}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </Card>
  )
}
