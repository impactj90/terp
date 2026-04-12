'use client'

import { useParams } from 'next/navigation'
import { DocumentEditor } from "@/components/billing/document-editor"

export default function BillingDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <DocumentEditor id={params.id} />
    </div>
  )
}
