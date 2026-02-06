'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Package, Activity, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useOrders,
  useDeleteOrder,
  useActivities,
  useDeleteActivity,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  OrderDataTable,
  OrderFormSheet,
} from '@/components/orders'
import {
  ActivityDataTable,
  ActivityFormSheet,
} from '@/components/activities'
import type { components } from '@/lib/api/types'

type Order = components['schemas']['Order']
type ActivityType = components['schemas']['Activity']

export default function OrdersPage() {
  const router = useRouter()
  const t = useTranslations('adminOrders')
  const tAct = useTranslations('adminActivities')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Page-level tab state
  const [activeTab, setActiveTab] = React.useState<'orders' | 'activities'>('orders')

  // Orders state
  const [orderSearch, setOrderSearch] = React.useState('')
  const [createOrderOpen, setCreateOrderOpen] = React.useState(false)
  const [editOrder, setEditOrder] = React.useState<Order | null>(null)
  const [deleteOrder, setDeleteOrder] = React.useState<Order | null>(null)

  // Activities state
  const [activitySearch, setActivitySearch] = React.useState('')
  const [createActivityOpen, setCreateActivityOpen] = React.useState(false)
  const [editActivity, setEditActivity] = React.useState<ActivityType | null>(null)
  const [deleteActivity, setDeleteActivity] = React.useState<ActivityType | null>(null)

  // Data fetching
  const { data: ordersData, isLoading: ordersLoading } = useOrders({
    enabled: !authLoading && isAdmin,
  })
  const { data: activitiesData, isLoading: activitiesLoading } = useActivities({
    enabled: !authLoading && isAdmin,
  })

  // Mutations
  const deleteOrderMutation = useDeleteOrder()
  const deleteActivityMutation = useDeleteActivity()

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const orders = ordersData?.data ?? []
  const activities = activitiesData?.data ?? []

  const filteredOrders = React.useMemo(() => {
    if (!orderSearch) return orders
    const s = orderSearch.toLowerCase()
    return orders.filter(
      (o) =>
        o.code?.toLowerCase().includes(s) ||
        o.name?.toLowerCase().includes(s) ||
        o.customer?.toLowerCase().includes(s)
    )
  }, [orders, orderSearch])

  const filteredActivities = React.useMemo(() => {
    if (!activitySearch) return activities
    const s = activitySearch.toLowerCase()
    return activities.filter(
      (a) =>
        a.code?.toLowerCase().includes(s) ||
        a.name?.toLowerCase().includes(s)
    )
  }, [activities, activitySearch])

  const handleViewOrder = (order: Order) => {
    router.push(`/admin/orders/${order.id}`)
  }

  const handleEditOrder = (order: Order) => {
    setEditOrder(order)
  }

  const handleDeleteOrder = (order: Order) => {
    setDeleteOrder(order)
  }

  const handleConfirmDeleteOrder = async () => {
    if (!deleteOrder) return

    try {
      await deleteOrderMutation.mutateAsync({
        path: { id: deleteOrder.id },
      })
      setDeleteOrder(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleOrderFormSuccess = () => {
    setCreateOrderOpen(false)
    setEditOrder(null)
  }

  const handleEditActivity = (activity: ActivityType) => {
    setEditActivity(activity)
  }

  const handleDeleteActivity = (activity: ActivityType) => {
    setDeleteActivity(activity)
  }

  const handleConfirmDeleteActivity = async () => {
    if (!deleteActivity) return

    try {
      await deleteActivityMutation.mutateAsync({
        path: { id: deleteActivity.id },
      })
      setDeleteActivity(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleActivityFormSuccess = () => {
    setCreateActivityOpen(false)
    setEditActivity(null)
  }

  if (authLoading) {
    return <OrdersPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => activeTab === 'activities' ? setCreateActivityOpen(true) : setCreateOrderOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {activeTab === 'activities' ? tAct('newActivity') : t('newOrder')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'orders' | 'activities')}>
        <TabsList>
          <TabsTrigger value="orders">{t('tabOrders')}</TabsTrigger>
          <TabsTrigger value="activities">{t('tabActivities')}</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={orderSearch}
              onChange={setOrderSearch}
              placeholder={t('searchPlaceholder')}
              className="w-full sm:w-64"
            />
            {orderSearch && (
              <Button variant="ghost" size="sm" onClick={() => setOrderSearch('')}>
                <X className="mr-2 h-4 w-4" />
                {t('clearFilters')}
              </Button>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredOrders.length === 1
              ? t('orderCount', { count: filteredOrders.length })
              : t('ordersCount', { count: filteredOrders.length })}
          </div>

          <Card>
            <CardContent className="p-0">
              {ordersLoading ? (
                <div className="p-6">
                  <Skeleton className="h-64" />
                </div>
              ) : filteredOrders.length === 0 ? (
                <OrderEmptyState
                  hasFilters={!!orderSearch}
                  onCreateClick={() => setCreateOrderOpen(true)}
                />
              ) : (
                <OrderDataTable
                  items={filteredOrders}
                  isLoading={false}
                  onView={handleViewOrder}
                  onEdit={handleEditOrder}
                  onDelete={handleDeleteOrder}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={activitySearch}
              onChange={setActivitySearch}
              placeholder={tAct('searchPlaceholder')}
              className="w-full sm:w-64"
            />
            {activitySearch && (
              <Button variant="ghost" size="sm" onClick={() => setActivitySearch('')}>
                <X className="mr-2 h-4 w-4" />
                {tAct('clearFilters')}
              </Button>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredActivities.length === 1
              ? tAct('activityCount', { count: filteredActivities.length })
              : tAct('activitiesCount', { count: filteredActivities.length })}
          </div>

          <Card>
            <CardContent className="p-0">
              {activitiesLoading ? (
                <div className="p-6">
                  <Skeleton className="h-64" />
                </div>
              ) : filteredActivities.length === 0 ? (
                <ActivityEmptyState
                  hasFilters={!!activitySearch}
                  onCreateClick={() => setCreateActivityOpen(true)}
                />
              ) : (
                <ActivityDataTable
                  items={filteredActivities}
                  isLoading={false}
                  onEdit={handleEditActivity}
                  onDelete={handleDeleteActivity}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Order Form */}
      <OrderFormSheet
        open={createOrderOpen || !!editOrder}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOrderOpen(false)
            setEditOrder(null)
          }
        }}
        order={editOrder}
        onSuccess={handleOrderFormSuccess}
      />

      {/* Order Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteOrder}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOrder(null)
          }
        }}
        title={t('deleteOrder')}
        description={
          deleteOrder
            ? t('deleteDescription', { name: deleteOrder.name })
            : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteOrderMutation.isPending}
        onConfirm={handleConfirmDeleteOrder}
      />

      {/* Activity Form */}
      <ActivityFormSheet
        open={createActivityOpen || !!editActivity}
        onOpenChange={(open) => {
          if (!open) {
            setCreateActivityOpen(false)
            setEditActivity(null)
          }
        }}
        activity={editActivity}
        onSuccess={handleActivityFormSuccess}
      />

      {/* Activity Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteActivity}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteActivity(null)
          }
        }}
        title={tAct('deleteActivity')}
        description={
          deleteActivity
            ? tAct('deleteDescription', { name: deleteActivity.name })
            : ''
        }
        confirmLabel={tAct('delete')}
        variant="destructive"
        isLoading={deleteActivityMutation.isPending}
        onConfirm={handleConfirmDeleteActivity}
      />
    </div>
  )
}

function OrderEmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminOrders')
  return (
    <div className="text-center py-12 px-6">
      <Package className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newOrder')}
        </Button>
      )}
    </div>
  )
}

function ActivityEmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminActivities')
  return (
    <div className="text-center py-12 px-6">
      <Activity className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newActivity')}
        </Button>
      )}
    </div>
  )
}

function OrdersPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
      </div>

      <Skeleton className="h-[400px]" />
    </div>
  )
}
