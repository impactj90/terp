'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CalendarOff,
  Check,
  X,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'

/** AbsenceType shape from tRPC output */
interface AbsenceType {
  id: string
  tenantId: string | null
  code: string
  name: string
  description: string | null
  category: string
  portion: number
  holidayCode: string | null
  priority: number
  deductsVacation: boolean
  requiresApproval: boolean
  requiresDocument: boolean
  color: string
  sortOrder: number
  isSystem: boolean
  isActive: boolean
  absenceTypeGroupId: string | null
  calculationRuleId: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface AbsenceTypeDataTableProps {
  absenceTypes: AbsenceType[]
  isLoading: boolean
  onView: (type: AbsenceType) => void
  onEdit: (type: AbsenceType) => void
  onDelete: (type: AbsenceType) => void
}

const categoryConfig: Record<string, { labelKey: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  vacation: { labelKey: 'categoryVacation', variant: 'default' },
  illness: { labelKey: 'categorySick', variant: 'destructive' },
  special: { labelKey: 'categoryPersonal', variant: 'secondary' },
  unpaid: { labelKey: 'categoryUnpaid', variant: 'outline' },
  sick: { labelKey: 'categorySick', variant: 'destructive' },
  personal: { labelKey: 'categoryPersonal', variant: 'secondary' },
  holiday: { labelKey: 'categoryHoliday', variant: 'default' },
  other: { labelKey: 'categoryOther', variant: 'outline' },
}

function BooleanIndicator({ value, label }: { value: boolean | undefined; label: string }) {
  const t = useTranslations('adminAbsenceTypes')
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center">
            {value ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-muted-foreground/50" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}: {value ? t('yes') : t('no')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function AbsenceTypeDataTable({
  absenceTypes,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: AbsenceTypeDataTableProps) {
  const t = useTranslations('adminAbsenceTypes')

  if (isLoading) {
    return <AbsenceTypeDataTableSkeleton />
  }

  if (absenceTypes.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-24">{t('columnCategory')}</TableHead>
          <TableHead className="w-20 text-center">{t('columnVacation')}</TableHead>
          <TableHead className="w-20 text-center">{t('columnApproval')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {absenceTypes.map((type) => {
          const categoryKey = type.category || 'other'
          const category = categoryConfig[categoryKey] ?? { labelKey: 'categoryOther', variant: 'outline' as const }

          return (
            <TableRow
              key={type.id}
              className="cursor-pointer"
              onClick={() => onView(type)}
            >
              <TableCell>
                <div
                  className="h-6 w-6 rounded-md border"
                  style={{ backgroundColor: type.color || '#808080' }}
                  title={type.color || '#808080'}
                />
              </TableCell>
              <TableCell className="font-mono text-sm font-medium">
                {type.code}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="font-medium">{type.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={category.variant}>{t(category.labelKey as Parameters<typeof t>[0])}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <BooleanIndicator value={type.deductsVacation} label={t('fieldAffectsVacation')} />
              </TableCell>
              <TableCell className="text-center">
                <BooleanIndicator value={type.requiresApproval} label={t('fieldRequiresApproval')} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {type.isSystem && (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" />
                      {t('statusSystem')}
                    </Badge>
                  )}
                  {!type.isActive && (
                    <Badge variant="secondary" className="text-xs">
                      {t('statusInactive')}
                    </Badge>
                  )}
                  {type.isActive && !type.isSystem && (
                    <Badge variant="default" className="text-xs">
                      {t('statusActive')}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t('actions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(type)}>
                      <Eye className="mr-2 h-4 w-4" />
                      {t('viewDetails')}
                    </DropdownMenuItem>
                    {type.isSystem ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('systemCannotModify')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem onClick={() => onEdit(type)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {type.isSystem ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('systemCannotDelete')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(type)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function AbsenceTypeDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-6 w-6 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
