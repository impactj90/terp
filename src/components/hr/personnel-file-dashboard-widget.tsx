'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { FolderOpen, Bell, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useHrPersonnelFileReminders,
  useHrPersonnelFileExpiring,
} from '@/hooks'

export function PersonnelFileDashboardWidget() {
  const t = useTranslations('hrPersonnelFileDashboard')
  const router = useRouter()

  const { data: reminders, isLoading: remindersLoading } = useHrPersonnelFileReminders()
  const { data: expiring, isLoading: expiringLoading } = useHrPersonnelFileExpiring(30)

  const isLoading = remindersLoading || expiringLoading
  const reminderCount = reminders?.length ?? 0
  const expiringCount = expiring?.length ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t('title')}</CardTitle>
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span>
                {reminderCount > 0
                  ? t('remindersCount', { count: reminderCount })
                  : t('noReminders')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span>
                {expiringCount > 0
                  ? t('expiringCount', { count: expiringCount })
                  : t('noExpiring')}
              </span>
            </div>
          </div>
        )}
        <Button
          variant="link"
          className="px-0 mt-2 h-auto text-xs"
          onClick={() => router.push('/hr/personnel-file')}
        >
          {t('viewAll')}
        </Button>
      </CardContent>
    </Card>
  )
}
