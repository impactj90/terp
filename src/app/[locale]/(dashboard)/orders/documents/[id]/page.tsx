'use client'

import { useParams } from 'next/navigation'
import { BillingDocumentDetail } from "@/components/billing/document-detail"

export default function BillingDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <BillingDocumentDetail id={params.id} />
    </div>
  )
}
