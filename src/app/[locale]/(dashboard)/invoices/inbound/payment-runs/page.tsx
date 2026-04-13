'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { PaymentRunsPage } from '@/components/invoices/payment-runs/payment-runs-page'

export default function PaymentRunsPageRoute() {
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
      <PaymentRunsPage />
    </div>
  )
}
