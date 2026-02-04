'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Ban, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useTenant } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

interface TenantDetailSheetProps {
  tenantId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (tenant: Tenant) => void
  onDeactivate: (tenant: Tenant) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function TenantDetailSheet({
  tenantId,
  open,
  onOpenChange,
  onEdit,
  onDeactivate,
}: TenantDetailSheetProps) {
  const t = useTranslations('adminTenants')
  const { data: tenant, isLoading } = useTenant(tenantId || '', open && !!tenantId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('tenantDetails')}</SheetTitle>
          <SheetDescription>{t('viewTenantInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : tenant ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{tenant.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{tenant.slug}</p>
                </div>
                <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                  {tenant.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Identity */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldName')} value={tenant.name} />
                  <DetailRow label={t('fieldSlug')} value={<span className="font-mono">{tenant.slug}</span>} />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('addressSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldStreet')} value={tenant.address_street} />
                  <DetailRow label={t('fieldZip')} value={tenant.address_zip} />
                  <DetailRow label={t('fieldCity')} value={tenant.address_city} />
                  <DetailRow label={t('fieldCountry')} value={tenant.address_country} />
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('contactSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldPhone')} value={tenant.phone} />
                  <DetailRow label={t('fieldEmail')} value={tenant.email} />
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('settingsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldPayrollExportPath')} value={tenant.payroll_export_base_path} />
                  <DetailRow
                    label={t('fieldVacationBasis')}
                    value={
                      <Badge variant="outline">
                        {tenant.vacation_basis === 'calendar_year'
                          ? t('vacationBasisCalendarYear')
                          : t('vacationBasisEntryDate')}
                      </Badge>
                    }
                  />
                  {tenant.notes && (
                    <DetailRow label={t('fieldNotes')} value={tenant.notes} />
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(tenant.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(tenant.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {tenant && (
            <>
              <Button variant="outline" onClick={() => onEdit(tenant)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              {tenant.is_active && (
                <Button
                  variant="destructive"
                  onClick={() => onDeactivate(tenant)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {t('deactivate')}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
