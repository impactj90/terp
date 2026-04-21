'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useOvertimeRequests } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { OvertimeRequestForm } from '@/components/overtime-requests/overtime-request-form'
import { OvertimeRequestList } from '@/components/overtime-requests/overtime-request-list'

type OvertimeRow = {
  id: string
  requestType: string
  requestDate: string | Date
  plannedMinutes: number
  reason: string
  status: string
  rejectionReason: string | null
  arbzgWarnings: string[]
}

export default function OvertimeRequestsPage() {
  const t = useTranslations('overtime_requests.page')
  const tc = useTranslations('common')
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employeeId

  const [formOpen, setFormOpen] = React.useState(false)

  const { data, isLoading } = useOvertimeRequests({
    employeeId: employeeId ?? undefined,
    enabled: !!employeeId,
    pageSize: 100,
  })

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!employeeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">{tc('noEmployeeRecord')}</p>
        <p className="text-sm text-muted-foreground">{tc('contactAdmin')}</p>
      </div>
    )
  }

  const items = (data?.items ?? []) as unknown as OvertimeRow[]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          onClick={() => setFormOpen(true)}
          className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('newRequest')}
        </Button>
      </div>

      <OvertimeRequestList items={items} isLoading={isLoading} showCancel />

      <OvertimeRequestForm
        employeeId={employeeId}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  )
}
