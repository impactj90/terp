'use client'

import { useParams } from 'next/navigation'
import { OpenItemDetail } from "@/components/billing/open-item-detail"

export default function OpenItemDetailPage() {
  const params = useParams<{ documentId: string }>()
  return (
    <div className="container mx-auto py-6">
      <OpenItemDetail documentId={params.documentId} />
    </div>
  )
}
