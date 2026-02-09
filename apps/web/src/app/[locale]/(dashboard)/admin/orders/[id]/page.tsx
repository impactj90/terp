'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, Trash2, Plus, Package } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useOrder,
  useDeleteOrder,
  useOrderAssignments,
  useDeleteOrderAssignment,
  useOrderBookings,
  useDeleteOrderBooking,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  OrderStatusBadge,
  OrderFormSheet,
  OrderAssignmentDataTable,
  OrderAssignmentFormDialog,
  OrderBookingDataTable,
  OrderBookingFormSheet,
} from '@/components/orders'
import type { components } from '@/lib/api/types'

type OrderAssignment = components['schemas']['OrderAssignment']
type OrderBooking = components['schemas']['OrderBooking']

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['orders.manage'])
  const t = useTranslations('adminOrders')

  const orderId = params.id
  const { data: order, isLoading } = useOrder(orderId, !authLoading && !permLoading && canAccess)

  // Edit / delete order state
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const deleteMutation = useDeleteOrder()

  // Assignment state
  const [assignmentFormOpen, setAssignmentFormOpen] = React.useState(false)
  const [editAssignment, setEditAssignment] = React.useState<OrderAssignment | null>(null)
  const [deleteAssignment, setDeleteAssignment] = React.useState<OrderAssignment | null>(null)
  const deleteAssignmentMutation = useDeleteOrderAssignment()

  // Booking state
  const [bookingFormOpen, setBookingFormOpen] = React.useState(false)
  const [editBooking, setEditBooking] = React.useState<OrderBooking | null>(null)
  const [deleteBooking, setDeleteBooking] = React.useState<OrderBooking | null>(null)
  const deleteBookingMutation = useDeleteOrderBooking()

  // Fetch assignments and bookings
  const { data: assignmentsData, isLoading: assignmentsLoading } = useOrderAssignments({
    orderId,
    enabled: !authLoading && !permLoading && canAccess && !!orderId,
  })
  const { data: bookingsData, isLoading: bookingsLoading } = useOrderBookings({
    orderId,
    enabled: !authLoading && !permLoading && canAccess && !!orderId,
  })

  const assignments = assignmentsData?.data ?? []
  const bookings = bookingsData?.data ?? []

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const handleConfirmDeleteOrder = async () => {
    if (!order) return
    try {
      await deleteMutation.mutateAsync({ path: { id: order.id } })
      router.push('/admin/orders')
    } catch {
      // Error handled by mutation
    }
  }

  const handleConfirmDeleteAssignment = async () => {
    if (!deleteAssignment) return
    try {
      await deleteAssignmentMutation.mutateAsync({ path: { id: deleteAssignment.id } })
      setDeleteAssignment(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleConfirmDeleteBooking = async () => {
    if (!deleteBooking) return
    try {
      await deleteBookingMutation.mutateAsync({ path: { id: deleteBooking.id } })
      setDeleteBooking(null)
    } catch {
      // Error handled by mutation
    }
  }

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (authLoading || isLoading) {
    return <DetailPageSkeleton />
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('orderNotFound')}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/orders')}>
          {t('backToOrders')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
            <Package className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {order.name}
              </h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-muted-foreground font-mono">{order.code}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t('tabDetails')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
          <TabsTrigger value="bookings">{t('tabBookings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionBasicInfo')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('fieldCode')} value={order.code} />
                  <DetailRow label={t('fieldName')} value={order.name} />
                  <DetailRow label={t('fieldDescription')} value={order.description} />
                  <DetailRow label={t('fieldStatus')} value={order.status} />
                  <DetailRow label={t('fieldCustomer')} value={order.customer} />
                </div>
              </CardContent>
            </Card>

            {/* Validity Period */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionValidity')}</h3>
                <div className="space-y-3">
                  <DetailRow label={t('fieldValidFrom')} value={formatDate(order.valid_from)} />
                  <DetailRow label={t('fieldValidTo')} value={formatDate(order.valid_to)} />
                </div>
              </CardContent>
            </Card>

            {/* Billing */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionBilling')}</h3>
                <div className="space-y-3">
                  <DetailRow
                    label={t('fieldBillingRate')}
                    value={order.billing_rate_per_hour ? `${order.billing_rate_per_hour.toFixed(2)}` : undefined}
                  />
                  <DetailRow
                    label={t('fieldCostCenter')}
                    value={order.cost_center_id ? order.cost_center_id : undefined}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">{t('sectionAssignments')}</h3>
            <Button onClick={() => { setEditAssignment(null); setAssignmentFormOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              {t('newAssignment')}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {assignmentsLoading ? (
                <div className="p-6">
                  <Skeleton className="h-32" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <p className="text-muted-foreground">{t('emptyAssignments')}</p>
                  <p className="text-sm text-muted-foreground">{t('emptyAssignmentsHint')}</p>
                </div>
              ) : (
                <OrderAssignmentDataTable
                  items={assignments}
                  isLoading={false}
                  onEdit={(a) => { setEditAssignment(a); setAssignmentFormOpen(true) }}
                  onDelete={(a) => setDeleteAssignment(a)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">{t('sectionBookings')}</h3>
            <Button onClick={() => { setEditBooking(null); setBookingFormOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              {t('newBooking')}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {bookingsLoading ? (
                <div className="p-6">
                  <Skeleton className="h-32" />
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <p className="text-muted-foreground">{t('emptyBookings')}</p>
                  <p className="text-sm text-muted-foreground">{t('emptyBookingsHint')}</p>
                </div>
              ) : (
                <OrderBookingDataTable
                  items={bookings}
                  isLoading={false}
                  onEdit={(b) => { setEditBooking(b); setBookingFormOpen(true) }}
                  onDelete={(b) => setDeleteBooking(b)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Order Form */}
      <OrderFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        order={order}
        onSuccess={() => setEditOpen(false)}
      />

      {/* Order Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteOrder')}
        description={t('deleteDescription', { name: order.name })}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDeleteOrder}
      />

      {/* Assignment Form */}
      <OrderAssignmentFormDialog
        open={assignmentFormOpen}
        onOpenChange={setAssignmentFormOpen}
        orderId={orderId}
        assignment={editAssignment}
        onSuccess={() => { setAssignmentFormOpen(false); setEditAssignment(null) }}
      />

      {/* Assignment Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteAssignment}
        onOpenChange={(open) => { if (!open) setDeleteAssignment(null) }}
        title={t('deleteAssignment')}
        description={t('deleteDescription', { name: `${deleteAssignment?.employee_id}` })}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteAssignmentMutation.isPending}
        onConfirm={handleConfirmDeleteAssignment}
      />

      {/* Booking Form */}
      <OrderBookingFormSheet
        open={bookingFormOpen}
        onOpenChange={setBookingFormOpen}
        orderId={orderId}
        booking={editBooking}
        onSuccess={() => { setBookingFormOpen(false); setEditBooking(null) }}
      />

      {/* Booking Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteBooking}
        onOpenChange={(open) => { if (!open) setDeleteBooking(null) }}
        title={t('deleteBooking')}
        description={t('deleteDescription', { name: deleteBooking?.description || '' })}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteBookingMutation.isPending}
        onConfirm={handleConfirmDeleteBooking}
      />
    </div>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value?: string | null
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '-'}</span>
    </div>
  )
}

function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-[400px]" />
    </div>
  )
}
