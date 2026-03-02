'use client'

import { X, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MessageToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  status: string
  onStatusChange: (value: string) => void
  onCompose: () => void
}

export function MessageToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  onCompose,
}: MessageToolbarProps) {
  const t = useTranslations('adminEmployeeMessages')

  const hasFilters = Boolean(search) || status !== 'all'

  return (
    <div className="flex flex-wrap items-center gap-4">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('searchPlaceholder')}
        className="w-full sm:w-80"
      />

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder={t('allStatus')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatus')}</SelectItem>
          <SelectItem value="pending">{t('statusPending')}</SelectItem>
          <SelectItem value="sent">{t('statusSent')}</SelectItem>
          <SelectItem value="failed">{t('statusFailed')}</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearchChange('')
            onStatusChange('all')
          }}
        >
          <X className="mr-2 h-4 w-4" />
          {t('clearFilters')}
        </Button>
      )}

      <Button className="ml-auto" onClick={onCompose}>
        <Mail className="mr-2 h-4 w-4" />
        {t('composeMessage')}
      </Button>
    </div>
  )
}
