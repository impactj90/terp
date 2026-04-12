'use client'

import { useParams } from 'next/navigation'
import { InquiryDetail } from "@/components/crm/inquiry-detail"

export default function CrmInquiryDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <InquiryDetail id={params.id} />
    </div>
  )
}
