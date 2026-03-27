'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Bell, CalendarClock, Calendar, User } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useHrPersonnelFileReminders,
  useHrPersonnelFileExpiring,
} from '@/hooks'

export default function HrPersonnelFileOverviewPage() {
  const t = useTranslations('hrPersonnelFileOverview')
  const router = useRouter()

  const { data: reminders, isLoading: remindersLoading } = useHrPersonnelFileReminders()
  const { data: expiring, isLoading: expiringLoading } = useHrPersonnelFileExpiring(30)

  const navigateToEmployee = (employeeId: string) => {
    router.push(`/admin/employees/${employeeId}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs defaultValue="reminders">
        <TabsList>
          <TabsTrigger value="reminders" className="gap-2">
            <Bell className="h-4 w-4" />
            {t('tabReminders')}
            {reminders && reminders.length > 0 && (
              <Badge variant="secondary" className="ml-1">{reminders.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="expiring" className="gap-2">
            <CalendarClock className="h-4 w-4" />
            {t('tabExpiring')}
            {expiring && expiring.length > 0 && (
              <Badge variant="secondary" className="ml-1">{expiring.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reminders" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('remindersTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {remindersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : (reminders ?? []).length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{t('noReminders')}</p>
              ) : (
                <div className="space-y-2">
                  {(reminders ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateToEmployee(entry.employeeId)}
                    >
                      {entry.category?.color && (
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: entry.category.color }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{entry.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>
                            {entry.employee?.firstName} {entry.employee?.lastName}
                          </span>
                          <span className="text-muted-foreground/50">|</span>
                          <span>{entry.category?.name}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {entry.reminderDate && format(new Date(entry.reminderDate), 'dd.MM.yyyy')}
                        </div>
                        {entry.reminderNote && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-48 truncate">
                            {entry.reminderNote}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('expiringTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : (expiring ?? []).length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{t('noExpiring')}</p>
              ) : (
                <div className="space-y-2">
                  {(expiring ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateToEmployee(entry.employeeId)}
                    >
                      {entry.category?.color && (
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: entry.category.color }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{entry.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>
                            {entry.employee?.firstName} {entry.employee?.lastName}
                          </span>
                          <span className="text-muted-foreground/50">|</span>
                          <span>{entry.category?.name}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Badge
                          variant="outline"
                          className="text-xs border-yellow-500 text-yellow-600"
                        >
                          <CalendarClock className="mr-1 h-3 w-3" />
                          {entry.expiresAt && format(new Date(entry.expiresAt), 'dd.MM.yyyy')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
