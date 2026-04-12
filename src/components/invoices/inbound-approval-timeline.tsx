'use client'

import { useTranslations } from 'next-intl'
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useApprovalHistory } from '@/hooks/useInboundInvoices'

interface Props {
  invoiceId: string
}

const formatDateTime = (d: string | Date | null | undefined) => {
  if (!d) return ''
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(d))
}

const statusIconConfig: Record<string, {
  icon: typeof CheckCircle2
  color: string
  labelKey: string
  badgeVariant: string
}> = {
  PENDING: { icon: Clock, color: 'text-amber-500', labelKey: 'approval.pending', badgeVariant: 'amber' },
  APPROVED: { icon: CheckCircle2, color: 'text-emerald-500', labelKey: 'approval.approved', badgeVariant: 'green' },
  REJECTED: { icon: XCircle, color: 'text-red-500', labelKey: 'approval.rejected', badgeVariant: 'red' },
  INVALIDATED: { icon: AlertTriangle, color: 'text-muted-foreground', labelKey: 'approval.invalidated', badgeVariant: 'gray' },
}

export function InboundApprovalTimeline({ invoiceId }: Props) {
  const t = useTranslations('inboundInvoices')
  const { data: steps, isLoading } = useApprovalHistory(invoiceId)

  if (isLoading) return <div className="text-sm text-muted-foreground">{t('approval.loading')}</div>
  if (!steps || steps.length === 0) return null

  return (
    <div className="space-y-3">
      {steps.map((step) => {
        const config = (statusIconConfig[step.status] ?? statusIconConfig.PENDING)!
        const Icon = config.icon
        const isMuted = step.status === 'INVALIDATED'
        const approverName =
          (step.approverUser as { displayName?: string } | null)?.displayName ??
          (step.approverGroup as { name?: string } | null)?.name ??
          '—'
        const deciderName = (step.decider as { displayName?: string } | null)?.displayName

        return (
          <div
            key={step.id}
            className={`flex gap-3 ${isMuted ? 'opacity-50' : ''}`}
          >
            <div className="flex flex-col items-center">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <div className="flex-1 w-px bg-border mt-1" />
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('approval.stepLabel', { step: step.stepOrder })}</span>
                <Badge variant={config.badgeVariant as Parameters<typeof Badge>[0]['variant']}>
                  {t(config.labelKey as Parameters<typeof t>[0])}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('approval.assignedTo', { name: approverName })}
              </p>
              {deciderName && step.decidedAt && (
                <p className="text-xs text-muted-foreground">
                  {step.status === 'APPROVED'
                    ? t('approval.approvedBy', { name: deciderName, date: formatDateTime(step.decidedAt) })
                    : t('approval.decidedBy', { name: deciderName, date: formatDateTime(step.decidedAt) })
                  }
                </p>
              )}
              {step.rejectionReason && (
                <p className="text-xs text-destructive mt-1">
                  {t('approval.reason', { reason: step.rejectionReason })}
                </p>
              )}
              {isMuted && (
                <p className="text-xs text-muted-foreground italic">
                  {t('approval.invalidatedNote')}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
