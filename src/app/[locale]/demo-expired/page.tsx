'use client'

import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/providers/tenant-provider'
import { useRequestConvertFromExpired } from '@/hooks'

export default function DemoExpiredPage() {
  const t = useTranslations('demoExpired')
  const { tenant } = useTenant()
  const requestConvert = useRequestConvertFromExpired()

  const handleConvertClick = () => {
    if (!tenant) return
    requestConvert.mutate(
      { tenantId: tenant.id },
      {
        onSuccess: () => {
          toast.success(t('convertCtaSuccessToast'))
        },
        onError: (err) => {
          toast.error(err.message || t('convertCtaErrorToast'))
        },
      },
    )
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-muted/40">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('body')}</p>
          <p>{t('contactIntro')}</p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>{t('contactEmail')}</li>
            <li>{t('contactPhone')}</li>
          </ul>

          {requestConvert.isSuccess ? (
            <Alert className="border-green-600 text-green-900 dark:text-green-100">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t('convertCtaSuccessBody')}</AlertDescription>
            </Alert>
          ) : (
            <Button
              className="w-full"
              onClick={handleConvertClick}
              disabled={!tenant || requestConvert.isPending}
            >
              {requestConvert.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('convertCta')}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">{t('dataRetention')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
