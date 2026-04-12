'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type BadgeVariant = 'blue' | 'indigo' | 'green' | 'teal' | 'orange' | 'purple' | 'pink' | 'gray'

const TYPE_VARIANTS: Record<string, BadgeVariant> = {
  OFFER: 'blue',
  ORDER_CONFIRMATION: 'indigo',
  DELIVERY_NOTE: 'green',
  SERVICE_NOTE: 'teal',
  RETURN_DELIVERY: 'orange',
  INVOICE: 'purple',
  CREDIT_NOTE: 'pink',
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
  const variant = TYPE_VARIANTS[type] ?? 'gray'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = TYPE_KEYS[type] ? t(TYPE_KEYS[type] as any) : type
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}
