'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Edit } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
import type {
  CorrectionMessage,
  UpdateCorrectionMessageRequest,
} from '@/hooks/api/use-correction-assistant'

interface CorrectionMessageDataTableProps {
  messages: CorrectionMessage[]
  isLoading: boolean
  onUpdateMessage: (id: string, data: UpdateCorrectionMessageRequest) => Promise<void>
  onEditMessage: (message: CorrectionMessage) => void
  isUpdating: boolean
}

export function CorrectionMessageDataTable({
  messages,
  isLoading,
  onUpdateMessage,
  onEditMessage,
  isUpdating,
}: CorrectionMessageDataTableProps) {
  const t = useTranslations('correctionAssistant')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState('')

  const handleStartEdit = (message: CorrectionMessage) => {
    setEditingId(message.id)
    setEditValue(message.custom_text ?? '')
  }

  const handleSaveEdit = async (id: string) => {
    const newValue = editValue.trim() || null
    setEditingId(null)
    await onUpdateMessage(id, { custom_text: newValue })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit(id)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  if (isLoading) {
    return <CorrectionMessageDataTableSkeleton />
  }

  if (messages.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">{t('messages.columnCode')}</TableHead>
          <TableHead>{t('messages.columnDefaultText')}</TableHead>
          <TableHead>{t('messages.columnCustomText')}</TableHead>
          <TableHead>{t('messages.columnEffectiveText')}</TableHead>
          <TableHead className="w-24">{t('messages.columnSeverity')}</TableHead>
          <TableHead className="w-20">{t('messages.columnActive')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('messages.actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.map((message) => (
          <TableRow key={message.id}>
            <TableCell className="font-mono text-sm font-medium">
              {message.code}
            </TableCell>
            <TableCell className="max-w-xs truncate text-sm">
              {message.default_text}
            </TableCell>
            <TableCell className="max-w-xs" onClick={(e) => e.stopPropagation()}>
              {editingId === message.id ? (
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSaveEdit(message.id)}
                  onKeyDown={(e) => handleKeyDown(e, message.id)}
                  autoFocus
                  className="h-8 text-sm"
                />
              ) : (
                <button
                  type="button"
                  className="w-full text-left text-sm truncate cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1"
                  onClick={() => handleStartEdit(message)}
                >
                  {message.custom_text || (
                    <span className="text-muted-foreground/50 italic">
                      {t('messages.clickToCustomize')}
                    </span>
                  )}
                </button>
              )}
            </TableCell>
            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
              {message.effective_text}
            </TableCell>
            <TableCell>
              <Badge variant={message.severity === 'error' ? 'destructive' : 'secondary'}>
                {message.severity === 'error' ? t('severity.error') : t('severity.hint')}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Switch
                size="sm"
                checked={message.is_active}
                onCheckedChange={() =>
                  onUpdateMessage(message.id, { is_active: !message.is_active })
                }
                disabled={isUpdating}
              />
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('messages.actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditMessage(message)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('messages.edit')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CorrectionMessageDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
            <TableCell><Skeleton className="h-4 w-36" /></TableCell>
            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
