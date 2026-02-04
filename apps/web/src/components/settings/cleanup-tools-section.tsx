'use client'

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CleanupDialog, type CleanupType } from './cleanup-dialog'

export function CleanupToolsSection() {
  const t = useTranslations('adminSettings')
  const [dialogType, setDialogType] = React.useState<CleanupType | null>(null)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t('cleanupTitle')}</h2>
        <Alert variant="destructive" className="mt-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('cleanupWarning')}</AlertDescription>
        </Alert>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Delete Bookings */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">{t('cleanupDeleteBookings')}</CardTitle>
            <CardDescription>{t('cleanupDeleteBookingsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDialogType('delete-bookings')}
            >
              {t('cleanupDeleteBookings')}
            </Button>
          </CardContent>
        </Card>

        {/* Delete Booking Data */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">{t('cleanupDeleteBookingData')}</CardTitle>
            <CardDescription>{t('cleanupDeleteBookingDataDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDialogType('delete-booking-data')}
            >
              {t('cleanupDeleteBookingData')}
            </Button>
          </CardContent>
        </Card>

        {/* Re-Read Bookings */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">{t('cleanupReReadBookings')}</CardTitle>
            <CardDescription>{t('cleanupReReadBookingsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDialogType('re-read-bookings')}
            >
              {t('cleanupReReadBookings')}
            </Button>
          </CardContent>
        </Card>

        {/* Mark & Delete Orders */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">{t('cleanupMarkDeleteOrders')}</CardTitle>
            <CardDescription>{t('cleanupMarkDeleteOrdersDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDialogType('mark-delete-orders')}
            >
              {t('cleanupMarkDeleteOrders')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <CleanupDialog
        type={dialogType}
        onClose={() => setDialogType(null)}
      />
    </div>
  )
}
