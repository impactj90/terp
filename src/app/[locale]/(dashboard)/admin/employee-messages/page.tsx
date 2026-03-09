'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useEmployeeMessages } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MessageDataTable,
  MessageToolbar,
  MessageComposeSheet,
  MessageDetailSheet,
  SendConfirmationDialog,
} from '@/components/employee-messages'
import type { components } from '@/types/legacy-api-types'

type EmployeeMessage = components['schemas']['EmployeeMessage']

export default function EmployeeMessagesPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['notifications.manage'])
  const t = useTranslations('adminEmployeeMessages')

  // Filters
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Sheet/dialog state
  const [composeOpen, setComposeOpen] = React.useState(false)
  const [viewMessageId, setViewMessageId] = React.useState<string | null>(null)
  const [sendDialogState, setSendDialogState] = React.useState<{
    messageId: string
    subject: string
    recipientCount: number
  } | null>(null)

  // Fetch data
  const { data: messagesData, isLoading: messagesLoading } = useEmployeeMessages({
    status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'sent' | 'failed') : undefined,
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Redirect if no permission
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const messages = messagesData?.data ?? []

  // Client-side search filter on subject
  const filteredMessages = React.useMemo(() => {
    if (!search.trim()) return messages

    const searchLower = search.toLowerCase()
    return messages.filter((m: EmployeeMessage) =>
      m.subject.toLowerCase().includes(searchLower)
    )
  }, [messages, search])

  const handleView = (message: EmployeeMessage) => {
    setViewMessageId(message.id)
  }

  const handleComposeSuccess = (messageId: string, subject: string, recipientCount: number) => {
    setComposeOpen(false)
    setSendDialogState({ messageId, subject, recipientCount })
  }

  const handleSendFromDetail = (messageId: string, subject: string, recipientCount: number) => {
    setViewMessageId(null)
    setSendDialogState({ messageId, subject, recipientCount })
  }

  const handleSendComplete = () => {
    // Dialog will close itself via onOpenChange
  }

  const hasFilters = Boolean(search) || statusFilter !== 'all'

  if (authLoading || permLoading) {
    return <EmployeeMessagesPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Toolbar */}
      <MessageToolbar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onCompose={() => setComposeOpen(true)}
      />

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {messagesLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : filteredMessages.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onComposeClick={() => setComposeOpen(true)} />
          ) : (
            <MessageDataTable
              messages={filteredMessages}
              isLoading={false}
              onView={handleView}
            />
          )}
        </CardContent>
      </Card>

      {/* Compose Sheet */}
      <MessageComposeSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onSuccess={handleComposeSuccess}
      />

      {/* Detail Sheet */}
      <MessageDetailSheet
        messageId={viewMessageId}
        open={!!viewMessageId}
        onOpenChange={(open) => {
          if (!open) setViewMessageId(null)
        }}
        onSend={handleSendFromDetail}
      />

      {/* Send Confirmation Dialog */}
      <SendConfirmationDialog
        open={!!sendDialogState}
        onOpenChange={(open) => {
          if (!open) setSendDialogState(null)
        }}
        messageId={sendDialogState?.messageId ?? null}
        subject={sendDialogState?.subject ?? ''}
        recipientCount={sendDialogState?.recipientCount ?? 0}
        onSendComplete={handleSendComplete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onComposeClick,
}: {
  hasFilters: boolean
  onComposeClick: () => void
}) {
  const t = useTranslations('adminEmployeeMessages')
  return (
    <div className="text-center py-12 px-6">
      <Mail className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyDescription')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onComposeClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('composeMessage')}
        </Button>
      )}
    </div>
  )
}

function EmployeeMessagesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40 ml-auto" />
      </div>

      {/* Content */}
      <Skeleton className="h-96" />
    </div>
  )
}
