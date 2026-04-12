'use client'

import { useParams } from 'next/navigation'
import { RecurringDetail } from "@/components/billing/recurring-detail"

export default function BillingRecurringDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <RecurringDetail id={params.id} />
    </div>
  )
}
