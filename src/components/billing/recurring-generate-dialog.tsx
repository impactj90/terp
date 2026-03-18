'use client'

import * as React from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useBillingRecurringInvoicePreview, useGenerateRecurringInvoice } from '@/hooks'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const { data: previewData } = useBillingRecurringInvoicePreview(templateId, open)
  const generateMutation = useGenerateRecurringInvoice()

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({ id: templateId })
      toast.success(`Rechnung ${result?.number ?? ''} wurde erstellt`)
      onOpenChange(false)
      if (onSuccess) onSuccess()
      // Optionally navigate to the generated invoice
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      }
    } catch {
      toast.error('Fehler beim Generieren der Rechnung')
    }
  }

  const description = previewData
    ? `Rechnung fuer ${templateName} generieren?\n\nNaechstes Rechnungsdatum: ${formatDate(previewData.nextInvoiceDate)}\nNetto: ${formatCurrency(previewData.subtotalNet)}\nMwSt: ${formatCurrency(previewData.totalVat)}\nBrutto: ${formatCurrency(previewData.totalGross)}`
    : `Rechnung fuer "${templateName}" generieren?`

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rechnung generieren"
      description={description}
      confirmLabel="Generieren"
      cancelLabel="Abbrechen"
      isLoading={generateMutation.isPending}
      onConfirm={handleGenerate}
    />
  )
}
