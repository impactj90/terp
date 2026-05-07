'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
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
} from '@/hooks'
import { useInboundInvoices } from '@/hooks/useInboundInvoices'
import { useWorkReportsByOrder } from '@/hooks/use-work-reports'
import { useModules } from '@/hooks/use-modules'
import { useActiveOrderTarget } from '@/hooks/use-order-targets'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  OrderStatusBadge,
  OrderFormSheet,
  OrderAssignmentDataTable,
  OrderAssignmentFormDialog,
  OrderBookingDataTable,
  OrderBookingFormSheet,
} from '@/components/orders'
import { OrderTargetFormSheet } from '@/components/orders/order-target-form-sheet'
import { OrderTargetHistorySheet } from '@/components/orders/order-target-history-sheet'
import { NkSollIstSection } from '@/components/nachkalkulation/nk-soll-ist-section'
import { WorkReportStatusBadge } from '@/components/work-reports/work-report-status-badge'

interface OrderAssignment {
  id: string
  employeeId?: string
  employee_id?: string
  role: string
  validFrom?: Date | string | null
  valid_from?: string | null
  validTo?: Date | string | null
  valid_to?: string | null
}


const VALID_TABS = [
  'details',
  'assignments',
  'workreports',
  'bookings',
  'inbound-invoices',
  'nachkalkulation',
] as const

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['orders.manage'])
  const t = useTranslations('adminOrders')
  const tc = useTranslations('common')
  const locale = useLocale()

  const orderId = params.id

  // Honour the `?tab=...` query param so deep-links from drill sheets and
  // dashboard cards land on the right tab. Falls back to "details".
  // The URL is the single source of truth — Tab-changes call replace() to
  // keep the deep-link in sync without forcing a navigation.
  const tabParam = searchParams.get('tab')
  const activeTab =
    tabParam && (VALID_TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : 'details'
  const handleTabChange = React.useCallback(
    (next: string) => {
      const url = new URL(window.location.href)
      if (next === 'details') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', next)
      }
      router.replace(`${url.pathname}${url.search}`, { scroll: false })
    },
    [router],
  )
  const { data: order, isLoading } = useOrder(orderId, !authLoading && !permLoading && canAccess)
  const { data: inboundInvoicesData, isLoading: inboundInvoicesLoading } =
    useInboundInvoices({ orderId }, !authLoading && !permLoading && canAccess && !!orderId)
  const inboundInvoices = inboundInvoicesData?.items ?? []

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editBooking, setEditBooking] = React.useState<any>(null)

  // Nachkalkulation state
  const { data: modulesData } = useModules(!authLoading && !permLoading && canAccess)
  const enabledModules = (modulesData && 'modules' in modulesData ? modulesData.modules : []) as Array<{ module: string }>
  const isNkEnabled = enabledModules.some((m) => m.module === 'nachkalkulation')
  const { data: activeTarget } = useActiveOrderTarget(orderId, isNkEnabled)
  const [targetFormOpen, setTargetFormOpen] = React.useState(false)
  const [targetHistoryOpen, setTargetHistoryOpen] = React.useState(false)
  const tNk = useTranslations('nachkalkulation')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deleteBooking, setDeleteBooking] = React.useState<any>(null)
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
  const bookings = bookingsData?.items ?? []

  // Work reports for this order (Phase 8 integration)
  const { data: workReportsData, isLoading: workReportsLoading } =
    useWorkReportsByOrder(
      orderId,
      !authLoading && !permLoading && canAccess && !!orderId,
    )
  const workReports = workReportsData?.items ?? []

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const handleConfirmDeleteOrder = async () => {
    if (!order) return
    try {
      await deleteMutation.mutateAsync({ id: order.id })
      router.push('/admin/orders')
    } catch {
      // Error handled by mutation
    }
  }

  const handleConfirmDeleteAssignment = async () => {
    if (!deleteAssignment) return
    try {
      await deleteAssignmentMutation.mutateAsync({ id: deleteAssignment.id })
      setDeleteAssignment(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleConfirmDeleteBooking = async () => {
    if (!deleteBooking) return
    try {
      await deleteBookingMutation.mutateAsync({ id: deleteBooking.id })
      setDeleteBooking(null)
    } catch {
      // Error handled by mutation
    }
  }

  const formatDate = (date: string | Date | undefined | null) => {
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tc('goBack')}</TooltipContent>
        </Tooltip>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tc('delete')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="details">{t('tabDetails')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
          <TabsTrigger value="workreports">{t('tabWorkReports')}</TabsTrigger>
          <TabsTrigger value="bookings">{t('tabBookings')}</TabsTrigger>
          <TabsTrigger value="inbound-invoices">{t('tabInboundInvoices')}</TabsTrigger>
          {isNkEnabled && (
            <TabsTrigger value="nachkalkulation">{t('tabNachkalkulation')}</TabsTrigger>
          )}
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
                  <DetailRow label={t('fieldValidFrom')} value={formatDate(order.validFrom)} />
                  <DetailRow label={t('fieldValidTo')} value={formatDate(order.validTo)} />
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
                    value={order.billingRatePerHour ? `${Number(order.billingRatePerHour).toFixed(2)}` : undefined}
                  />
                  <DetailRow
                    label={t('fieldCostCenter')}
                    value={order.costCenter ? `${order.costCenter.name} (${order.costCenter.code})` : undefined}
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

        <TabsContent value="workreports" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">{t('tabWorkReports')}</h3>
            <Button
              onClick={() =>
                router.push(`/admin/work-reports/new?orderId=${orderId}`)
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Neu
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {workReportsLoading ? (
                <div className="p-6">
                  <Skeleton className="h-32" />
                </div>
              ) : workReports.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-muted-foreground">
                    Noch keine Arbeitsscheine für diesen Auftrag.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr.</TableHead>
                      <TableHead>Einsatzdatum</TableHead>
                      <TableHead>Serviceobjekt</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workReports.map((wr) => (
                      <TableRow
                        key={wr.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          router.push(`/admin/work-reports/${wr.id}`)
                        }
                      >
                        <TableCell className="font-mono font-medium">
                          {wr.code}
                        </TableCell>
                        <TableCell>
                          {wr.visitDate
                            ? (() => {
                                const [y, m, d] = wr.visitDate
                                  .slice(0, 10)
                                  .split('-')
                                return `${d}.${m}.${y}`
                              })()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {wr.serviceObject
                            ? `${wr.serviceObject.number} — ${wr.serviceObject.name}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <WorkReportStatusBadge status={wr.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

        <TabsContent value="inbound-invoices" className="mt-6 space-y-4">
          <h3 className="text-lg font-medium">{t('sectionInboundInvoices')}</h3>
          <Card>
            <CardContent className="p-0">
              {inboundInvoicesLoading ? (
                <div className="p-6"><Skeleton className="h-32" /></div>
              ) : inboundInvoices.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <p className="text-muted-foreground">{t('emptyInboundInvoices')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('inboundInvoiceNumber')}</TableHead>
                      <TableHead>{t('inboundInvoiceSupplier')}</TableHead>
                      <TableHead>{t('inboundInvoiceDate')}</TableHead>
                      <TableHead className="text-right">{t('inboundInvoiceGross')}</TableHead>
                      <TableHead>{t('inboundInvoiceStatus')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inboundInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link href={`/${locale}/invoices/inbound/${inv.id}`}
                                className="text-blue-600 hover:underline">
                            {inv.number}
                          </Link>
                        </TableCell>
                        <TableCell>{inv.supplier?.company ?? '—'}</TableCell>
                        <TableCell>{inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {inv.totalGross != null ? Number(inv.totalGross).toFixed(2) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{inv.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isNkEnabled && (
          <TabsContent value="nachkalkulation" className="mt-6 space-y-4">
            <div className="flex items-center justify-end gap-2">
              {activeTarget ? (
                <Button variant="outline" onClick={() => setTargetFormOpen(true)}>
                  {tNk('replanButton')}
                </Button>
              ) : (
                <Button onClick={() => setTargetFormOpen(true)}>
                  {tNk('captureTargetButton')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setTargetHistoryOpen(true)}>
                {tNk('showHistoryButton')}
              </Button>
            </div>
            <NkSollIstSection orderId={orderId} />
          </TabsContent>
        )}
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
        description={t('deleteDescription', { name: deleteAssignment?.employeeId ?? deleteAssignment?.employee_id ?? '' })}
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

      {/* Order Target form (NK-1) */}
      {isNkEnabled && (
        <>
          <OrderTargetFormSheet
            open={targetFormOpen}
            onOpenChange={setTargetFormOpen}
            orderId={orderId}
            activeTarget={
              activeTarget != null
                ? {
                    id: activeTarget.id,
                    version: activeTarget.version,
                    validFrom: activeTarget.validFrom,
                    validTo: activeTarget.validTo,
                    targetHours: activeTarget.targetHours,
                    targetMaterialCost: activeTarget.targetMaterialCost,
                    targetTravelMinutes: activeTarget.targetTravelMinutes,
                    targetExternalCost: activeTarget.targetExternalCost,
                    targetRevenue: activeTarget.targetRevenue,
                    targetUnitItems: activeTarget.targetUnitItems,
                    changeReason: activeTarget.changeReason,
                    notes: activeTarget.notes,
                  }
                : null
            }
            onSuccess={() => setTargetFormOpen(false)}
          />
          <OrderTargetHistorySheet
            open={targetHistoryOpen}
            onOpenChange={setTargetHistoryOpen}
            orderId={orderId}
          />
        </>
      )}
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
