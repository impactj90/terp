'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useEmailSmtpConfig,
  useUpsertEmailSmtpConfig,
  useTestEmailSmtpConnection,
} from '@/hooks/use-email-smtp-config'

export function SmtpConfigForm() {
  const t = useTranslations('adminEmailSettings')
  const { data: config, isLoading } = useEmailSmtpConfig()
  const upsertMutation = useUpsertEmailSmtpConfig()
  const testMutation = useTestEmailSmtpConnection()

  const [host, setHost] = React.useState('')
  const [port, setPort] = React.useState(587)
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [encryption, setEncryption] = React.useState<'STARTTLS' | 'SSL' | 'NONE'>('STARTTLS')
  const [fromEmail, setFromEmail] = React.useState('')
  const [fromName, setFromName] = React.useState('')
  const [replyToEmail, setReplyToEmail] = React.useState('')

  React.useEffect(() => {
    if (config) {
      setHost(config.host)
      setPort(config.port)
      setUsername(config.username)
      setEncryption(config.encryption as 'STARTTLS' | 'SSL' | 'NONE')
      setFromEmail(config.fromEmail)
      setFromName(config.fromName ?? '')
      setReplyToEmail(config.replyToEmail ?? '')
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
        fromEmail,
        fromName: fromName || null,
        replyToEmail: replyToEmail || null,
      })
      setPassword('')
      toast.success(t('saveSuccess'))
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  async function handleTestConnection() {
    try {
      await testMutation.mutateAsync()
      toast.success(t('testSuccess'))
    } catch (err) {
      toast.error(
        t('testFailed') +
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
      {/* SMTP Server */}
      <Card>
        <CardHeader>
          <CardTitle>{t('sectionServer')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="smtp-host">{t('fieldHost')}</Label>
              <Input
                id="smtp-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t('fieldHostPlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">{t('fieldPort')}</Label>
              <Input
                id="smtp-port"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1}
                max={65535}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-encryption">{t('fieldEncryption')}</Label>
            <Select value={encryption} onValueChange={(v) => setEncryption(v as 'STARTTLS' | 'SSL' | 'NONE')}>
              <SelectTrigger id="smtp-encryption">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                <SelectItem value="SSL">SSL/TLS</SelectItem>
                <SelectItem value="NONE">{t('encryptionNone')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle>{t('sectionAuth')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-username">{t('fieldUsername')}</Label>
            <Input
              id="smtp-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('fieldUsernamePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-password">{t('fieldPassword')}</Label>
            <Input
              id="smtp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                config?.hasPassword
                  ? '••••••••'
                  : t('fieldPasswordPlaceholder')
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Sender */}
      <Card>
        <CardHeader>
          <CardTitle>{t('sectionSender')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-from-email">{t('fieldFromEmail')}</Label>
            <Input
              id="smtp-from-email"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={t('fieldFromEmailPlaceholder')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-from-name">{t('fieldFromName')}</Label>
            <Input
              id="smtp-from-name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder={t('fieldFromNamePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-reply-to">{t('fieldReplyTo')}</Label>
            <Input
              id="smtp-reply-to"
              type="email"
              value={replyToEmail}
              onChange={(e) => setReplyToEmail(e.target.value)}
              placeholder={t('fieldReplyToPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle>{t('sectionStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            {config.isVerified ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  {t('verified')}
                  {config.verifiedAt &&
                    ` — ${new Date(config.verifiedAt).toLocaleString('de-DE')}`}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertCircle className="h-5 w-5" />
                <span>{t('notVerified')}</span>
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
          {t('save')}
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
            {t('testConnection')}
          </Button>
        )}
      </div>
    </form>
  )
}
