'use client'

import { useParams } from 'next/navigation'
import { PriceListDetail } from "@/components/billing/price-list-detail"

export default function BillingPriceListDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <PriceListDetail id={params.id} />
    </div>
  )
}
