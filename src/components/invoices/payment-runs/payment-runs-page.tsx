'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { usePaymentRunPreflight } from '@/hooks/usePaymentRuns'
import { ProposalSection } from './proposal-section'
import { ExistingRunsSection } from './existing-runs-section'

export function PaymentRunsPage() {
  const t = useTranslations('paymentRuns')
  const { data: preflight, isLoading } = usePaymentRunPreflight()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (preflight && !preflight.ready) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('pageTitle')}</h1>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('preflight.bannerTitle')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t('preflight.bannerText')}</p>
            <ul className="list-disc pl-5 text-sm">
              {preflight.blockers.map((b) => (
                <li key={b}>{t(`preflight.blocker_${b}`)}</li>
              ))}
            </ul>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/billing-config">
                {t('preflight.goToBillingConfig')}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('pageTitle')}</h1>
      <ProposalSection />
      <ExistingRunsSection />
    </div>
  )
}
