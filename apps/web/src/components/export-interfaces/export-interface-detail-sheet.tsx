'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Users, Settings2 } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useExportInterface,
} from '@/hooks/api/use-export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']

interface ExportInterfaceDetailSheetProps {
  itemId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: ExportInterface) => void
  onManageAccounts: (item: ExportInterface) => void
  onDelete: (item: ExportInterface) => void
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

export function ExportInterfaceDetailSheet({
  itemId,
  open,
  onOpenChange,
  onEdit,
  onManageAccounts,
  onDelete,
}: ExportInterfaceDetailSheetProps) {
  const t = useTranslations('adminExportInterfaces')
  const { data: item, isLoading } = useExportInterface(itemId || '', open && !!itemId)

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const accounts = item?.accounts ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{t('interfaceDetails')}</SheetTitle>
          <SheetDescription>{t('viewInterfaceInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-12 w-12" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon, name, and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Settings2 className="h-6 w-6 text-foreground/70" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">
                    #{item.interface_number}
                  </p>
                </div>
                <Badge variant={item.is_active ? 'default' : 'secondary'}>
                  {item.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Basic Information */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldNumber')}
                    value={<span className="font-mono">{item.interface_number}</span>}
                  />
                  <DetailRow label={t('fieldName')} value={item.name} />
                </div>
              </div>

              {/* Export Configuration */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionExportConfig')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldMandant')} value={item.mandant_number} />
                  <DetailRow label={t('fieldExportScript')} value={item.export_script} />
                  <DetailRow label={t('fieldExportPath')} value={item.export_path} />
                  <DetailRow label={t('fieldOutputFilename')} value={item.output_filename} />
                </div>
              </div>

              {/* Assigned Accounts */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionAssignedAccounts')}</h4>
                {accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noAccountsAssigned')}</p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">{t('accountCode')}</TableHead>
                          <TableHead>{t('accountName')}</TableHead>
                          <TableHead className="w-28">{t('accountPayrollCode')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accounts.map((account) => (
                          <TableRow key={account.account_id}>
                            <TableCell className="font-mono text-sm">
                              {account.account_code}
                            </TableCell>
                            <TableCell className="text-sm">
                              {account.account_name}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {account.payroll_code || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionTimestamps')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDateTime(item.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDateTime(item.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {item && (
            <>
              <Button variant="outline" onClick={() => onManageAccounts(item)}>
                <Users className="mr-2 h-4 w-4" />
                {t('manageAccounts')}
              </Button>
              <Button variant="outline" onClick={() => onEdit(item)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button variant="destructive" onClick={() => onDelete(item)}>
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
