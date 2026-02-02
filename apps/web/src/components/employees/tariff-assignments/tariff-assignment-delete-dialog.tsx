'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteEmployeeTariffAssignment } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type TariffAssignment = components['schemas']['EmployeeTariffAssignment']

interface TariffAssignmentDeleteDialogProps {
  assignment: TariffAssignment | null
  employeeId: string
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function TariffAssignmentDeleteDialog({
  assignment,
  employeeId,
  onOpenChange,
  onSuccess,
}: TariffAssignmentDeleteDialogProps) {
  const t = useTranslations('employeeTariffAssignments')
  const deleteMutation = useDeleteEmployeeTariffAssignment()

  const tariffName = assignment?.tariff
    ? `${assignment.tariff.code} - ${assignment.tariff.name}`
    : ''

  const dateRange = assignment
    ? `${format(new Date(assignment.effective_from), 'dd.MM.yyyy')} - ${
        assignment.effective_to
          ? format(new Date(assignment.effective_to), 'dd.MM.yyyy')
          : t('openEnded')
      }`
    : ''

  const handleConfirm = async () => {
    if (!assignment) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: employeeId, assignmentId: assignment.id },
      })
      onSuccess?.()
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <ConfirmDialog
      open={!!assignment}
      onOpenChange={onOpenChange}
      title={t('deleteTitle')}
      description={t('deleteDescription', { tariffName, dateRange })}
      confirmLabel={t('deleteConfirm')}
      variant="destructive"
      isLoading={deleteMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
