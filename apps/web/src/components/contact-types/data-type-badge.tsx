'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type DataType = 'text' | 'email' | 'phone' | 'url'
type DataTypeLabelKey = 'dataTypeText' | 'dataTypeEmail' | 'dataTypePhone' | 'dataTypeUrl'

const dataTypeConfig: Record<DataType, { labelKey: DataTypeLabelKey; className: string }> = {
  text: {
    labelKey: 'dataTypeText',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  email: {
    labelKey: 'dataTypeEmail',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  phone: {
    labelKey: 'dataTypePhone',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  url: {
    labelKey: 'dataTypeUrl',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
}

interface DataTypeBadgeProps {
  dataType: DataType
}

export function DataTypeBadge({ dataType }: DataTypeBadgeProps) {
  const t = useTranslations('adminContactTypes')
  const config = dataTypeConfig[dataType]
  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}
