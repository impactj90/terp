'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Trash2, Plus, MousePointerClick, List } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
import type { components } from '@/lib/api/types'

type ContactType = components['schemas']['ContactType']
type ContactKind = components['schemas']['ContactKind']

interface ContactKindListPanelProps {
  contactKinds: ContactKind[]
  isLoading: boolean
  selectedType: ContactType | null
  onCreateClick: () => void
  onEdit: (kind: ContactKind) => void
  onDelete: (kind: ContactKind) => void
}

export function ContactKindListPanel({
  contactKinds,
  isLoading,
  selectedType,
  onCreateClick,
  onEdit,
  onDelete,
}: ContactKindListPanelProps) {
  const t = useTranslations('adminContactTypes')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">{t('kindsTitle')}</CardTitle>
        <Button size="sm" onClick={onCreateClick} disabled={!selectedType}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newKind')}
        </Button>
      </CardHeader>
      <CardContent>
        {!selectedType ? (
          <div className="text-center py-12 px-4">
            <MousePointerClick className="mx-auto h-10 w-10 text-muted-foreground opacity-50" />
            <h3 className="mt-3 text-sm font-medium">{t('selectTypePrompt')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('selectTypeDescription')}</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : contactKinds.length === 0 ? (
          <div className="text-center py-8 px-4">
            <List className="mx-auto h-10 w-10 text-muted-foreground opacity-50" />
            <h3 className="mt-3 text-sm font-medium">{t('emptyKindsTitle')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('emptyKindsHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contactKinds.map((kind) => (
              <div
                key={kind.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{kind.label}</span>
                    <Badge variant={kind.is_active ? 'default' : 'secondary'} className="shrink-0">
                      {kind.is_active ? t('statusActive') : t('statusInactive')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs text-muted-foreground">{kind.code}</span>
                    {kind.sort_order !== undefined && kind.sort_order !== null && (
                      <span className="text-xs text-muted-foreground">
                        #{kind.sort_order}
                      </span>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{t('edit')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(kind)}>
                      <Edit className="mr-2 h-4 w-4" />
                      {t('edit')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(kind)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
