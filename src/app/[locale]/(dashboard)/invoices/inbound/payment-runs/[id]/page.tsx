'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { PaymentRunDetail } from '@/components/invoices/payment-runs/payment-run-detail'

export default function PaymentRunDetailRoute() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const t = useTranslations('paymentRuns')
  const { allowed } = useHasPermission(['payment_runs.view'])

  if (allowed === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('common.noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PaymentRunDetail id={id} />
    </div>
  )
}
