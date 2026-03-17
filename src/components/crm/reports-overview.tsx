'use client'

import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, HelpCircle, ClipboardCheck, Mail } from 'lucide-react'
import { useCrmOverview } from '@/hooks/use-crm-reports'
import { ReportAddressStats } from './report-address-stats'
import { ReportCorrespondenceChart } from './report-correspondence-chart'
import { ReportInquiryPipeline } from './report-inquiry-pipeline'
import { ReportTaskCompletion } from './report-task-completion'

export function CrmReportsOverview() {
  const t = useTranslations('crmReports')
  const { data, isLoading } = useCrmOverview()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('totalAddresses')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {data?.totalAddresses ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data?.newAddressesThisMonth ?? 0} {t('newThisMonth')}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('openInquiries')}
            </CardTitle>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {data?.openInquiries ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('pendingTasks')}
            </CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {data?.pendingTasks ?? 0}
                </div>
                <p className="text-xs text-muted-foreground text-destructive">
                  {data?.overdueTaskCount ?? 0} {t('overdueTasks')}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('correspondenceThisWeek')}
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {data?.correspondenceThisWeek ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Reports Tabs */}
      <Tabs defaultValue="addresses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="addresses">{t('addressStats')}</TabsTrigger>
          <TabsTrigger value="correspondence">
            {t('correspondenceReport')}
          </TabsTrigger>
          <TabsTrigger value="inquiries">{t('inquiryPipeline')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('taskCompletion')}</TabsTrigger>
        </TabsList>

        <TabsContent value="addresses">
          <ReportAddressStats />
        </TabsContent>

        <TabsContent value="correspondence">
          <ReportCorrespondenceChart />
        </TabsContent>

        <TabsContent value="inquiries">
          <ReportInquiryPipeline />
        </TabsContent>

        <TabsContent value="tasks">
          <ReportTaskCompletion />
        </TabsContent>
      </Tabs>
    </div>
  )
}
