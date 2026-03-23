'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

const TYPE_STYLES: Record<string, string> = {
  OFFER: 'bg-blue-100 text-blue-800',
  ORDER_CONFIRMATION: 'bg-indigo-100 text-indigo-800',
  DELIVERY_NOTE: 'bg-green-100 text-green-800',
  SERVICE_NOTE: 'bg-teal-100 text-teal-800',
  RETURN_DELIVERY: 'bg-orange-100 text-orange-800',
  INVOICE: 'bg-purple-100 text-purple-800',
  CREDIT_NOTE: 'bg-pink-100 text-pink-800',
}

const TYPE_KEYS: Record<string, string> = {
  OFFER: 'typeOffer',
  ORDER_CONFIRMATION: 'typeOrderConfirmation',
  DELIVERY_NOTE: 'typeDeliveryNote',
  SERVICE_NOTE: 'typeServiceNote',
  RETURN_DELIVERY: 'typeReturnDelivery',
  INVOICE: 'typeInvoice',
  CREDIT_NOTE: 'typeCreditNote',
}

interface DocumentTypeBadgeProps {
  type: string
}

export function DocumentTypeBadge({ type }: DocumentTypeBadgeProps) {
  const t = useTranslations('billingDocuments')
  const style = TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-800'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = TYPE_KEYS[type] ? t(TYPE_KEYS[type] as any) : type
  return (
    <Badge variant="outline" className={style}>
      {label}
    </Badge>
  )
}
