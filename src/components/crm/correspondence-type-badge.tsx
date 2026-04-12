'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import {
  Phone,
  Mail,
  FileText,
  Printer,
  UserCheck,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
} from 'lucide-react'

const TYPE_CONFIG: Record<string, { icon: typeof Phone; variant: 'default' | 'secondary' | 'outline' }> = {
  phone: { icon: Phone, variant: 'secondary' },
  email: { icon: Mail, variant: 'secondary' },
  letter: { icon: FileText, variant: 'secondary' },
  fax: { icon: Printer, variant: 'secondary' },
  visit: { icon: UserCheck, variant: 'secondary' },
}

const DIRECTION_CONFIG: Record<string, { icon: typeof ArrowDownLeft; variant: 'default' | 'secondary' | 'outline' }> = {
  INCOMING: { icon: ArrowDownLeft, variant: 'default' },
  OUTGOING: { icon: ArrowUpRight, variant: 'outline' },
  INTERNAL: { icon: ArrowLeftRight, variant: 'secondary' },
}

interface CorrespondenceTypeBadgeProps {
  type: string
}

export function CorrespondenceTypeBadge({ type }: CorrespondenceTypeBadgeProps) {
  const t = useTranslations('crmCorrespondence')
  const config = TYPE_CONFIG[type]

  const typeLabels: Record<string, string> = {
    phone: t('typePhone'),
    email: t('typeEmail'),
    letter: t('typeLetter'),
    fax: t('typeFax'),
    visit: t('typeVisit'),
  }

  const Icon = config?.icon ?? FileText
  const label = typeLabels[type] ?? type

  return (
    <Badge variant={config?.variant ?? 'secondary'} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

interface CorrespondenceDirectionBadgeProps {
  direction: string
}

export function CorrespondenceDirectionBadge({ direction }: CorrespondenceDirectionBadgeProps) {
  const t = useTranslations('crmCorrespondence')
  const config = DIRECTION_CONFIG[direction]

  const dirLabels: Record<string, string> = {
    INCOMING: t('directionIncoming'),
    OUTGOING: t('directionOutgoing'),
    INTERNAL: t('directionInternal'),
  }

  const Icon = config?.icon ?? ArrowLeftRight
  const label = dirLabels[direction] ?? direction

  return (
    <Badge variant={config?.variant ?? 'secondary'} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}
