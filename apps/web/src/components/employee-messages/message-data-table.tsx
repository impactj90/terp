'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { MoreHorizontal, Eye, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type EmployeeMessage = components['schemas']['EmployeeMessage']

interface MessageDataTableProps {
  messages: EmployeeMessage[]
  isLoading: boolean
  onView: (message: EmployeeMessage) => void
}

function getStatusCounts(message: EmployeeMessage) {
  const recipients = message.recipients ?? []
  let sent = 0
  let pending = 0
  let failed = 0
  for (const r of recipients) {
    if (r.status === 'sent') sent++
    else if (r.status === 'pending') pending++
    else if (r.status === 'failed') failed++
  }
  return { sent, pending, failed }
}

export function MessageDataTable({
  messages,
  isLoading,
  onView,
}: MessageDataTableProps) {
  const t = useTranslations('adminEmployeeMessages')

  if (isLoading) {
    return <MessageDataTableSkeleton />
  }

  if (messages.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnSubject')}</TableHead>
          <TableHead className="w-28">{t('columnRecipients')}</TableHead>
          <TableHead>{t('columnStatus')}</TableHead>
          <TableHead className="w-36">{t('columnCreatedAt')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.map((message) => {
          const { sent, pending, failed } = getStatusCounts(message)
          const totalRecipients = (message.recipients ?? []).length

          return (
            <TableRow
              key={message.id}
              className="cursor-pointer"
              onClick={() => onView(message)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Mail className="h-4 w-4" />
                  </div>
                  <span className="font-medium">{message.subject}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {totalRecipients}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {sent > 0 && (
                    <Badge variant="default">{sent} {t('statusSent').toLowerCase()}</Badge>
                  )}
                  {pending > 0 && (
                    <Badge variant="secondary">{pending} {t('statusPending').toLowerCase()}</Badge>
                  )}
                  {failed > 0 && (
                    <Badge variant="destructive">{failed} {t('statusFailed').toLowerCase()}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(message.created_at), 'dd.MM.yyyy HH:mm')}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t('columnActions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(message)}>
                      <Eye className="mr-2 h-4 w-4" />
                      {t('viewDetails')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function MessageDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-36"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-48" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
