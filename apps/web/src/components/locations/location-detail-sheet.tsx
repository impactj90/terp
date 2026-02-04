'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, MapPin } from 'lucide-react'
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
import { useLocation } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Location = components['schemas']['Location']

interface LocationDetailSheetProps {
  locationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (location: Location) => void
  onDelete: (location: Location) => void
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

function getTimezoneDisplay(tz: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(now)
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value || ''
    return `${tz} (${offset})`
  } catch {
    return tz
  }
}

export function LocationDetailSheet({
  locationId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: LocationDetailSheetProps) {
  const t = useTranslations('adminLocations')
  const { data: location, isLoading } = useLocation(locationId || '', open && !!locationId)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const hasAddress = location && (location.address || location.city || location.country)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('locationDetails')}</SheetTitle>
          <SheetDescription>{t('viewLocationInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : location ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{location.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{location.code}</p>
                </div>
                <Badge variant={location.is_active ? 'default' : 'secondary'}>
                  {location.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {location.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{location.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={location.code} />
                  <DetailRow label={t('fieldName')} value={location.name} />
                </div>
              </div>

              {/* Address */}
              {hasAddress && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('addressSection')}</h4>
                  <div className="rounded-lg border p-4">
                    {location.address && (
                      <DetailRow label={t('fieldAddress')} value={location.address} />
                    )}
                    {location.city && (
                      <DetailRow label={t('fieldCity')} value={location.city} />
                    )}
                    {location.country && (
                      <DetailRow label={t('fieldCountry')} value={location.country} />
                    )}
                  </div>
                </div>
              )}

              {/* Configuration */}
              {location.timezone && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('configurationSection')}</h4>
                  <div className="rounded-lg border p-4">
                    <DetailRow
                      label={t('fieldTimezone')}
                      value={getTimezoneDisplay(location.timezone)}
                    />
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(location.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(location.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {location && (
            <>
              <Button variant="outline" onClick={() => onEdit(location)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(location)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
