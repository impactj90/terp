'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LifeBuoy, Plus, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/providers/auth-provider'
import {
  useHasPermission,
  useSupportSessions,
  useRequestSupportAccess,
  useRevokeSupportAccess,
} from '@/hooks'

type SessionStatus = 'pending' | 'active' | 'revoked' | 'expired'

interface SupportSessionRow {
  id: string
  reason: string
  status: string
  expiresAt: Date | string
  createdAt: Date | string
  platformUser?: { displayName: string; email: string } | null
}

const DEFAULT_TTL = 60

export default function SupportAccessPage() {
  const router = useRouter()
  const t = useTranslations('adminSupportAccess')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'platform.support_access.grant',
  ])

  const { data: sessions, isLoading: sessionsLoading } = useSupportSessions(
    canAccess === true
  )
  const requestMutation = useRequestSupportAccess()
  const revokeMutation = useRevokeSupportAccess()

  const [formOpen, setFormOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [ttlMinutes, setTtlMinutes] =
    React.useState<number>(DEFAULT_TTL)
  const [consentReference, setConsentReference] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const [revokeTarget, setRevokeTarget] =
    React.useState<SupportSessionRow | null>(null)

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const resetForm = () => {
    setReason('')
    setTtlMinutes(DEFAULT_TTL)
    setConsentReference('')
    setError(null)
  }

  const openForm = () => {
    resetForm()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setError(t('requiredFields'))
      return
    }

    try {
      await requestMutation.mutateAsync({
        reason: trimmed,
        ttlMinutes,
        consentReference: consentReference.trim() || undefined,
      })
      setFormOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'))
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    try {
      await revokeMutation.mutateAsync({ id: revokeTarget.id })
      setRevokeTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'))
    }
  }

  if (authLoading || permLoading) {
    return <SupportAccessPageSkeleton />
  }
  if (!canAccess) {
    return null
  }

  const rows = (sessions ?? []) as unknown as SupportSessionRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={openForm}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newRequest')}
        </Button>
      </div>

      {sessionsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columnStatus')}</TableHead>
                <TableHead>{t('columnReason')}</TableHead>
                <TableHead>{t('columnOperator')}</TableHead>
                <TableHead>{t('columnRequestedAt')}</TableHead>
                <TableHead>{t('columnExpiresAt')}</TableHead>
                <TableHead className="w-32 text-right">
                  {t('columnActions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const canRevoke =
                  row.status === 'pending' || row.status === 'active'
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <StatusBadge status={row.status as SessionStatus} />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <span className="line-clamp-2 text-sm">
                        {row.reason}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.platformUser ? (
                        <div className="text-sm">
                          <div className="font-medium">
                            {row.platformUser.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.platformUser.email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t('operatorUnassigned')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(row.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRevoke && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeTarget(row)}
                          className="text-destructive"
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          {t('revoke')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <LifeBuoy className="h-8 w-8 opacity-40" />
                      <span>{t('noSessions')}</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>{t('formTitle')}</SheetTitle>
            <SheetDescription>{t('formDescription')}</SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <form
              id="support-access-form"
              onSubmit={handleSubmit}
              className="space-y-4 py-4"
            >
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('reason')} *</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('reasonPlaceholder')}
                  maxLength={1000}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {t('reasonHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('ttl')} *</Label>
                <Select
                  value={String(ttlMinutes)}
                  onValueChange={(v) => setTtlMinutes(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">{t('ttl30')}</SelectItem>
                    <SelectItem value="60">{t('ttl60')}</SelectItem>
                    <SelectItem value="120">{t('ttl120')}</SelectItem>
                    <SelectItem value="240">{t('ttl240')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('consentReference')}</Label>
                <Input
                  value={consentReference}
                  onChange={(e) => setConsentReference(e.target.value)}
                  placeholder={t('consentReferencePlaceholder')}
                  maxLength={255}
                />
              </div>
            </form>
          </ScrollArea>

          <SheetFooter className="pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              form="support-access-form"
              disabled={requestMutation.isPending}
            >
              {t('create')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title={t('revokeConfirmTitle')}
        description={t('revokeConfirmDescription')}
        confirmLabel={t('revoke')}
        variant="destructive"
        isLoading={revokeMutation.isPending}
        onConfirm={handleRevoke}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('adminSupportAccess')
  const variant =
    status === 'active'
      ? 'default'
      : status === 'pending'
        ? 'secondary'
        : 'outline'
  const label =
    status === 'active'
      ? t('statusActive')
      : status === 'pending'
        ? t('statusPending')
        : status === 'revoked'
          ? t('statusRevoked')
          : t('statusExpired')
  return <Badge variant={variant}>{label}</Badge>
}

function formatDateTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SupportAccessPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
