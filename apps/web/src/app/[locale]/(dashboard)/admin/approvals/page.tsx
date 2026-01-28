'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useAbsences, useApproveAbsence, useRejectAbsence } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { AbsenceApprovalTable, RejectDialog } from '@/components/approvals'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

export default function ApprovalsPage() {
  const router = useRouter()
  const t = useTranslations('adminApprovals')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Tab state
  const [activeTab, setActiveTab] = React.useState('absences')

  // Approval action state
  const [approvingId, setApprovingId] = React.useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<Absence | null>(null)

  // Fetch pending absences
  const {
    data: pendingData,
    isLoading: pendingLoading,
  } = useAbsences({
    status: 'pending',
    enabled: !authLoading && isAdmin,
  })

  // Fetch history (approved + rejected)
  const {
    data: approvedData,
    isLoading: approvedLoading,
  } = useAbsences({
    status: 'approved',
    enabled: !authLoading && isAdmin,
  })

  const {
    data: rejectedData,
    isLoading: rejectedLoading,
  } = useAbsences({
    status: 'rejected',
    enabled: !authLoading && isAdmin,
  })

  // Mutations
  const approveMutation = useApproveAbsence()
  const rejectMutation = useRejectAbsence()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const pendingAbsences = pendingData?.data ?? []
  const historyAbsences = [
    ...(approvedData?.data ?? []),
    ...(rejectedData?.data ?? []),
  ].sort((a, b) => {
    // Sort by updated_at descending (most recent first)
    const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return dateB - dateA
  })

  const handleApprove = async (id: string) => {
    setApprovingId(id)
    try {
      await approveMutation.mutateAsync({
        path: { id },
      })
    } catch {
      // Error handled by mutation
    } finally {
      setApprovingId(null)
    }
  }

  const handleRejectClick = (id: string) => {
    const absence = pendingAbsences.find((a) => a.id === id) ?? null
    setRejectTarget(absence)
  }

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return
    try {
      await rejectMutation.mutateAsync({
        path: { id: rejectTarget.id },
        body: { reason },
      })
      setRejectTarget(null)
    } catch {
      // Error handled by mutation
    }
  }

  if (authLoading) {
    return <ApprovalsPageSkeleton />
  }

  if (!isAdmin) {
    return null // Will redirect
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="absences">
            {t('pendingAbsences')}
            {pendingAbsences.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {pendingAbsences.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">{t('history')}</TabsTrigger>
        </TabsList>

        <TabsContent value="absences">
          <Card>
            <CardContent className="p-0">
              <AbsenceApprovalTable
                absences={pendingAbsences}
                isLoading={pendingLoading}
                onApprove={handleApprove}
                onReject={handleRejectClick}
                approvingId={approvingId}
                rejectingId={rejectMutation.isPending ? rejectTarget?.id : null}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <AbsenceApprovalTable
                absences={historyAbsences}
                isLoading={approvedLoading || rejectedLoading}
                onApprove={() => {}}
                onReject={() => {}}
                showHistory
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <RejectDialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
        title={t('rejectTitle')}
        description={
          rejectTarget
            ? t('rejectDescription', {
                name: `${rejectTarget.employee?.first_name ?? ''} ${rejectTarget.employee?.last_name ?? ''}`.trim(),
                date: rejectTarget.absence_date ?? ''
              })
            : ''
        }
        isLoading={rejectMutation.isPending}
        onConfirm={handleRejectConfirm}
      />
    </div>
  )
}

function ApprovalsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}
