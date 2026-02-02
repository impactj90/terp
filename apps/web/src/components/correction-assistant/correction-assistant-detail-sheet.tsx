'use client'

import * as React from 'react'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { CorrectionAssistantItem } from '@/hooks/api/use-correction-assistant'

interface CorrectionAssistantDetailSheetProps {
  item: CorrectionAssistantItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function CorrectionAssistantDetailSheet({
  item,
  open,
  onOpenChange,
}: CorrectionAssistantDetailSheetProps) {
  const t = useTranslations('correctionAssistant')
  const router = useRouter()

  const handleGoToEmployee = () => {
    if (item) {
      router.push(`/admin/employees/${item.employee_id}`)
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {item ? `${item.employee_name} - ${formatDateDisplay(item.value_date)}` : t('detail.title')}
          </SheetTitle>
          <SheetDescription>
            {item?.department_name || t('detail.description')}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Employee info */}
              <div className="space-y-2">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.employee')}</span>
                    <span className="text-sm font-medium">{item.employee_name}</span>
                  </div>
                  {item.department_name && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm text-muted-foreground">{t('detail.department')}</span>
                      <span className="text-sm font-medium">{item.department_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.date')}</span>
                    <span className="text-sm font-medium">{formatDateDisplay(item.value_date)}</span>
                  </div>
                </div>
              </div>

              {/* Errors list */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.errorsTitle')} ({item.errors.length})
                </h4>
                {item.errors.map((error, index) => (
                  <div
                    key={`${error.code}-${index}`}
                    className="rounded-lg border p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{error.code}</span>
                      <Badge variant={error.severity === 'error' ? 'destructive' : 'secondary'}>
                        {error.severity === 'error' ? t('severity.error') : t('severity.hint')}
                      </Badge>
                    </div>
                    <p className="text-sm">{error.message}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('detail.errorType')}:</span>
                      <Badge variant="outline" className="text-xs">
                        {error.error_type}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('detail.close')}
          </Button>
          <Button onClick={handleGoToEmployee} disabled={!item} className="flex-1">
            <User className="mr-2 h-4 w-4" />
            {t('detail.goToEmployee')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
