'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  ChevronUp,
  ChevronDown,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useAccounts } from '@/hooks/api/use-accounts'
import {
  useExportInterfaceAccounts,
  useSetExportInterfaceAccounts,
} from '@/hooks/api/use-export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']
type Account = components['schemas']['Account']
type ExportInterfaceAccount = components['schemas']['ExportInterfaceAccount']

interface AccountMappingDialogProps {
  item: ExportInterface | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AccountMappingDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: AccountMappingDialogProps) {
  const t = useTranslations('adminExportInterfaces')
  const tm = useTranslations('adminExportInterfaces.accountMapping')

  // Local state for assigned account IDs (ordered array)
  const [assignedIds, setAssignedIds] = React.useState<string[]>([])
  // Selected checkboxes for each panel
  const [selectedAvailable, setSelectedAvailable] = React.useState<Set<string>>(new Set())
  const [selectedAssigned, setSelectedAssigned] = React.useState<Set<string>>(new Set())
  // Search filters
  const [searchAvailable, setSearchAvailable] = React.useState('')
  const [searchAssigned, setSearchAssigned] = React.useState('')
  // Error/success state
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Data loading
  const { data: accountsData } = useAccounts({ active: true, enabled: open && !!item })
  const { data: assignedData } = useExportInterfaceAccounts(item?.id ?? '', open && !!item)
  const setAccountsMutation = useSetExportInterfaceAccounts()

  // Extract data from wrapped responses
  const allAccounts: Account[] = (accountsData as { data?: Account[] })?.data ?? []
  const assignedAccountsData: ExportInterfaceAccount[] =
    (assignedData as { data?: ExportInterfaceAccount[] })?.data ?? []

  // Build a lookup map from account ID to account object
  const accountMap = React.useMemo(() => {
    const map = new Map<string, Account>()
    allAccounts.forEach((a) => map.set(a.id, a))
    return map
  }, [allAccounts])

  // Initialize state when dialog opens
  React.useEffect(() => {
    if (open && item) {
      // Sort assigned accounts by sort_order and extract their IDs
      const sorted = [...assignedAccountsData].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
      setAssignedIds(sorted.map((a) => a.account_id))
      setSelectedAvailable(new Set())
      setSelectedAssigned(new Set())
      setSearchAvailable('')
      setSearchAssigned('')
      setError(null)
      setSuccess(null)
    }
  }, [open, item, assignedAccountsData])

  // Compute available accounts (not assigned), filtered by search
  const availableAccounts = React.useMemo(() => {
    const assignedSet = new Set(assignedIds)
    return allAccounts
      .filter((a) => !assignedSet.has(a.id))
      .filter((a) => {
        if (!searchAvailable) return true
        const s = searchAvailable.toLowerCase()
        return (
          a.code?.toLowerCase().includes(s) ||
          a.name?.toLowerCase().includes(s)
        )
      })
  }, [allAccounts, assignedIds, searchAvailable])

  // Compute assigned accounts list with full account info, filtered by search
  const assignedAccountsFull = React.useMemo(() => {
    return assignedIds
      .map((id) => {
        const account = accountMap.get(id)
        // Fallback: try to find from assignedAccountsData
        const assigned = assignedAccountsData.find((a) => a.account_id === id)
        return {
          id,
          code: account?.code ?? assigned?.account_code ?? '',
          name: account?.name ?? assigned?.account_name ?? '',
        }
      })
      .filter((a) => {
        if (!searchAssigned) return true
        const s = searchAssigned.toLowerCase()
        return (
          a.code.toLowerCase().includes(s) ||
          a.name.toLowerCase().includes(s)
        )
      })
  }, [assignedIds, accountMap, assignedAccountsData, searchAssigned])

  // Transfer actions
  const handleAddSelected = () => {
    const toAdd = Array.from(selectedAvailable)
    if (toAdd.length === 0) return
    setAssignedIds((prev) => [...prev, ...toAdd])
    setSelectedAvailable(new Set())
  }

  const handleRemoveSelected = () => {
    const toRemove = new Set(selectedAssigned)
    if (toRemove.size === 0) return
    setAssignedIds((prev) => prev.filter((id) => !toRemove.has(id)))
    setSelectedAssigned(new Set())
  }

  const handleAddAll = () => {
    const availableIds = availableAccounts.map((a) => a.id)
    setAssignedIds((prev) => [...prev, ...availableIds])
    setSelectedAvailable(new Set())
  }

  const handleRemoveAll = () => {
    setAssignedIds([])
    setSelectedAssigned(new Set())
  }

  // Reorder actions
  const handleMoveUp = () => {
    const selected = new Set(selectedAssigned)
    setAssignedIds((prev) => {
      const newOrder = [...prev]
      for (let i = 1; i < newOrder.length; i++) {
        const current = newOrder[i]!
        const previous = newOrder[i - 1]!
        if (selected.has(current) && !selected.has(previous)) {
          newOrder[i - 1] = current
          newOrder[i] = previous
        }
      }
      return newOrder
    })
  }

  const handleMoveDown = () => {
    const selected = new Set(selectedAssigned)
    setAssignedIds((prev) => {
      const newOrder = [...prev]
      for (let i = newOrder.length - 2; i >= 0; i--) {
        const current = newOrder[i]!
        const next = newOrder[i + 1]!
        if (selected.has(current) && !selected.has(next)) {
          newOrder[i] = next
          newOrder[i + 1] = current
        }
      }
      return newOrder
    })
  }

  // Selection toggles
  const toggleAvailableSelection = (id: string) => {
    setSelectedAvailable((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAssignedSelection = (id: string) => {
    setSelectedAssigned((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Save action
  const handleSave = async () => {
    if (!item) return
    setError(null)
    setSuccess(null)

    try {
      await setAccountsMutation.mutateAsync({
        path: { id: item.id },
        body: { account_ids: assignedIds },
      })
      setSuccess(tm('saveSuccess'))
      // Brief delay then notify parent
      setTimeout(() => {
        onSuccess?.()
      }, 500)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? tm('saveFailed'))
    }
  }

  const isSubmitting = setAccountsMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{tm('title')}</SheetTitle>
          <SheetDescription>
            {item ? tm('description', { name: item.name }) : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 py-4 min-h-0">
          {/* Error/Success alerts */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Dual-list layout */}
          <div className="flex-1 flex gap-2 min-h-0">
            {/* Available Accounts Panel */}
            <div className="flex-1 flex flex-col border rounded-lg min-h-0">
              <div className="p-3 border-b space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{tm('availableAccounts')}</h4>
                  <span className="text-xs text-muted-foreground">
                    {tm('accountCount', { count: availableAccounts.length })}
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9"
                    placeholder={tm('searchAvailable')}
                    value={searchAvailable}
                    onChange={(e) => setSearchAvailable(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {availableAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {searchAvailable ? tm('noSearchResults') : tm('noAvailable')}
                    </p>
                  ) : (
                    availableAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                        onClick={() => toggleAvailableSelection(account.id)}
                      >
                        <Checkbox
                          checked={selectedAvailable.has(account.id)}
                          onCheckedChange={() => toggleAvailableSelection(account.id)}
                        />
                        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
                          {account.code}
                        </span>
                        <span className="text-sm truncate">{account.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {selectedAvailable.size > 0 && (
                <div className="p-2 border-t text-xs text-muted-foreground text-center">
                  {tm('selectedCount', { count: selectedAvailable.size })}
                </div>
              )}
            </div>

            {/* Transfer Buttons */}
            <div className="flex flex-col items-center justify-center gap-1 py-4">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleAddAll}
                disabled={availableAccounts.length === 0}
                title={tm('addAll')}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleAddSelected}
                disabled={selectedAvailable.size === 0}
                title={tm('addSelected')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleRemoveSelected}
                disabled={selectedAssigned.size === 0}
                title={tm('removeSelected')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleRemoveAll}
                disabled={assignedIds.length === 0}
                title={tm('removeAll')}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </div>

            {/* Assigned Accounts Panel */}
            <div className="flex-1 flex flex-col border rounded-lg min-h-0">
              <div className="p-3 border-b space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{tm('assignedAccounts')}</h4>
                  <span className="text-xs text-muted-foreground">
                    {tm('accountCount', { count: assignedIds.length })}
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9"
                    placeholder={tm('searchAssigned')}
                    value={searchAssigned}
                    onChange={(e) => setSearchAssigned(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {assignedAccountsFull.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {searchAssigned ? tm('noSearchResults') : tm('noAssigned')}
                    </p>
                  ) : (
                    assignedAccountsFull.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                        onClick={() => toggleAssignedSelection(account.id)}
                      >
                        <Checkbox
                          checked={selectedAssigned.has(account.id)}
                          onCheckedChange={() => toggleAssignedSelection(account.id)}
                        />
                        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
                          {account.code}
                        </span>
                        <span className="text-sm truncate">{account.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="p-2 border-t flex items-center justify-between">
                {selectedAssigned.size > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {tm('selectedCount', { count: selectedAssigned.size })}
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleMoveUp}
                    disabled={selectedAssigned.size === 0}
                    title={tm('moveUp')}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleMoveDown}
                    disabled={selectedAssigned.size === 0}
                    title={tm('moveDown')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? tm('saving') : tm('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
