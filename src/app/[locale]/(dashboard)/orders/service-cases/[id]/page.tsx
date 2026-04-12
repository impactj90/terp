'use client'

import { useParams } from 'next/navigation'
import { ServiceCaseDetail } from "@/components/billing/service-case-detail"

export default function BillingServiceCaseDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <ServiceCaseDetail id={params.id} />
    </div>
  )
}
