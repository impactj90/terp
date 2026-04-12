'use client'

import * as React from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useBillingRecurringInvoicePreview, useGenerateRecurringInvoice } from '@/hooks'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

interface RecurringGenerateDialogProps {
  templateId: string
  templateName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RecurringGenerateDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
  onSuccess,
}: RecurringGenerateDialogProps) {
  const t = useTranslations('billingRecurring')
  const router = useRouter()
  const { data: previewData } = useBillingRecurringInvoicePreview(templateId, open)
  const generateMutation = useGenerateRecurringInvoice()

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({ id: templateId })
      toast.success(t('invoiceGenerated', { number: result?.number ?? '' }))
      onOpenChange(false)
      if (onSuccess) onSuccess()
      // Optionally navigate to the generated invoice
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      }
    } catch {
      toast.error(t('generateError'))
    }
  }

  const description = previewData
    ? t('generateDescription', { name: templateName, date: formatDate(previewData.nextInvoiceDate), net: formatCurrency(previewData.subtotalNet), vat: formatCurrency(previewData.totalVat), gross: formatCurrency(previewData.totalGross) })
    : t('generateDescriptionSimple', { name: templateName })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('generateTitle')}
      description={description}
      confirmLabel={t('generate')}
      cancelLabel={t('generateCancel')}
      isLoading={generateMutation.isPending}
      onConfirm={handleGenerate}
    />
  )
}
