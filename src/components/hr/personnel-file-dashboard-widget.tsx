'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { FolderOpen, Bell, CalendarClock } from 'lucide-react'
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
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">{t('title')}</span>
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
      </div>
      {isLoading ? (
        <div className="mt-2 space-y-1.5 sm:space-y-2">
          <Skeleton className="h-4 w-28 sm:h-5 sm:w-32" />
          <Skeleton className="h-4 w-32 sm:h-5 sm:w-40" />
        </div>
      ) : (
        <div className="mt-2 space-y-1.5 sm:space-y-2">
          <div className="flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
            <Bell className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
            <span>
              {reminderCount > 0
                ? t('remindersCount', { count: reminderCount })
                : t('noReminders')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
            <CalendarClock className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
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
        className="mt-1.5 h-auto px-0 text-[11px] sm:mt-2 sm:text-xs"
        onClick={() => router.push('/hr/personnel-file')}
      >
        {t('viewAll')}
      </Button>
    </div>
  )
}
