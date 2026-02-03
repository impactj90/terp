'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteAbsence } from '@/hooks/api'
import { parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface AbsenceCancelDialogProps {
  absence: Absence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AbsenceCancelDialog({
  absence,
  open,
  onOpenChange,
  onSuccess,
}: AbsenceCancelDialogProps) {
  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const locale = useLocale()
  const deleteMutation = useDeleteAbsence()

  const formattedDate = absence
    ? parseISODate(absence.absence_date).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  const description = absence
    ? t('cancelConfirmation', {
        type: absence.absence_type?.name ?? t('unknownType'),
        date: formattedDate,
      })
    : ''

  const handleConfirm = async () => {
    if (!absence) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: absence.id },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error will be visible via ConfirmDialog loading state stopping
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('cancelAbsence')}
      description={description}
      confirmLabel={t('confirmCancel')}
      cancelLabel={tc('cancel')}
      variant="destructive"
      isLoading={deleteMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
