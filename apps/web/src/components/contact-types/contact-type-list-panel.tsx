'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Trash2, Plus, Contact } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTypeBadge } from './data-type-badge'
import type { components } from '@/lib/api/types'

type ContactType = components['schemas']['ContactType']

interface ContactTypeListPanelProps {
  contactTypes: ContactType[]
  isLoading: boolean
  selectedTypeId: string | null
  onSelect: (type: ContactType) => void
  onCreateClick: () => void
  onEdit: (type: ContactType) => void
  onDelete: (type: ContactType) => void
}

export function ContactTypeListPanel({
  contactTypes,
  isLoading,
  selectedTypeId,
  onSelect,
  onCreateClick,
  onEdit,
  onDelete,
}: ContactTypeListPanelProps) {
  const t = useTranslations('adminContactTypes')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">{t('typesTitle')}</CardTitle>
        <Button size="sm" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newType')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : contactTypes.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Contact className="mx-auto h-10 w-10 text-muted-foreground opacity-50" />
            <h3 className="mt-3 text-sm font-medium">{t('emptyTypesTitle')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('emptyTypesHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contactTypes.map((type) => (
              <div
                key={type.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent',
                  selectedTypeId === type.id && 'border-primary bg-accent'
                )}
                onClick={() => onSelect(type)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{type.name}</span>
                    <Badge variant={type.is_active ? 'default' : 'secondary'} className="shrink-0">
                      {type.is_active ? t('statusActive') : t('statusInactive')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs text-muted-foreground">{type.code}</span>
                    <DataTypeBadge dataType={type.data_type} />
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">{t('edit')}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(type)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(type)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
