'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type DataType = 'text' | 'email' | 'phone' | 'url'
type DataTypeLabelKey = 'dataTypeText' | 'dataTypeEmail' | 'dataTypePhone' | 'dataTypeUrl'
type BadgeVariant = 'gray' | 'blue' | 'green' | 'purple'

const dataTypeConfig: Record<DataType, { labelKey: DataTypeLabelKey; variant: BadgeVariant }> = {
  text: {
    labelKey: 'dataTypeText',
    variant: 'gray',
  },
  email: {
    labelKey: 'dataTypeEmail',
    variant: 'blue',
  },
  phone: {
    labelKey: 'dataTypePhone',
    variant: 'green',
  },
  url: {
    labelKey: 'dataTypeUrl',
    variant: 'purple',
  },
}

interface DataTypeBadgeProps {
  dataType: DataType
}

export function DataTypeBadge({ dataType }: DataTypeBadgeProps) {
  const t = useTranslations('adminContactTypes')
  const config = dataTypeConfig[dataType]
  return (
    <Badge variant={config.variant}>
      {t(config.labelKey)}
    </Badge>
  )
}
