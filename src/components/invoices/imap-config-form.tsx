'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useImapConfig,
  useUpsertImapConfig,
  useTestImapConnection,
} from '@/hooks/useImapConfig'

const formatDateTime = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
}

export function ImapConfigForm() {
  const t = useTranslations('inboundInvoices')
  const { data: config, isLoading } = useImapConfig()
  const upsertMutation = useUpsertImapConfig()
  const testMutation = useTestImapConnection()

  const [host, setHost] = React.useState('')
  const [port, setPort] = React.useState(993)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [encryption, setEncryption] = React.useState<'SSL' | 'STARTTLS' | 'NONE'>('SSL')
  const [mailbox, setMailbox] = React.useState('INBOX')

  React.useEffect(() => {
    if (config) {
      setHost(config.host)
      setPort(config.port)
      setUsername(config.username)
      setEncryption(config.encryption as 'SSL' | 'STARTTLS' | 'NONE')
      setMailbox(config.mailbox ?? 'INBOX')
    }
  }, [config])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await upsertMutation.mutateAsync({
        host,
        port,
        username,
        ...(password ? { password } : {}),
        encryption,
        mailbox,
      })
      setPassword('')
      toast.success(t('imap.saveSuccess'))
    } catch {
      toast.error(t('imap.saveFailed'))
    }
  }

  async function handleTestConnection() {
    try {
      const result = await testMutation.mutateAsync()
      toast.success(
        t('imap.testSuccess', { count: result.messageCount ?? 0 })
      )
    } catch (err) {
      toast.error(
        t('imap.testFailed') +
          (err instanceof Error ? `: ${err.message}` : '')
      )
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* IMAP Server */}
      <Card>
        <CardHeader>
          <CardTitle>{t('imap.sectionServer')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="imap-host">{t('imap.fieldHost')}</Label>
              <Input
                id="imap-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t('imap.fieldHostPlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap-port">{t('imap.fieldPort')}</Label>
              <Input
                id="imap-port"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1}
                max={65535}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imap-encryption">{t('imap.fieldEncryption')}</Label>
              <Select value={encryption} onValueChange={(v) => setEncryption(v as 'SSL' | 'STARTTLS' | 'NONE')}>
                <SelectTrigger id="imap-encryption">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SSL">SSL/TLS</SelectItem>
                  <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                  <SelectItem value="NONE">{t('imap.encryptionNone')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap-mailbox">{t('imap.fieldMailbox')}</Label>
              <Input
                id="imap-mailbox"
                value={mailbox}
                onChange={(e) => setMailbox(e.target.value)}
                placeholder="INBOX"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle>{t('imap.sectionAuth')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="imap-username">{t('imap.fieldUsername')}</Label>
            <Input
              id="imap-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('imap.fieldUsernamePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imap-password">{t('imap.fieldPassword')}</Label>
            <Input
              id="imap-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                config?.hasPassword
                  ? '••••••••'
                  : t('imap.fieldPasswordPlaceholder')
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle>{t('imap.sectionStatus')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.isVerified ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  {t('imap.verified')}
                  {config.verifiedAt &&
                    ` — ${formatDateTime(config.verifiedAt)}`}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertCircle className="h-5 w-5" />
                <span>{t('imap.notVerified')}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('imap.lastPollAt')}:</span>{' '}
                <span>{formatDateTime(config.lastPollAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('imap.consecutiveFailures')}:</span>{' '}
                <span>{config.consecutiveFailures ?? 0}</span>
              </div>
            </div>

            {(config.consecutiveFailures ?? 0) >= 3 && (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t('imap.failureWarning')}</span>
              </div>
            )}

            {config.lastPollError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <span className="font-medium">{t('imap.lastPollError')}:</span>{' '}
                {config.lastPollError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={upsertMutation.isPending}>
          {upsertMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t('imap.save')}
        </Button>
        {config && (
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('imap.testConnection')}
          </Button>
        )}
      </div>
    </form>
  )
}
