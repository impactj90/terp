'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { Building2, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCrmAddresses, useSetCrmAddressParent } from '@/hooks'

interface ParentInfo {
  id: string
  company: string
  number: string
  type: string
  city: string | null
}

interface AddressGroupSectionProps {
  addressId: string
  addressType: string
  parentAddress: ParentInfo | null
  childAddresses: ParentInfo[]
  canEdit: boolean
}

export function AddressGroupSection({
  addressId,
  addressType,
  parentAddress,
  childAddresses,
  canEdit,
}: AddressGroupSectionProps) {
  const t = useTranslations('crmAddresses')
  const tc = useTranslations('common')
  const params = useParams<{ locale: string }>()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')

  const setParent = useSetCrmAddressParent()

  const { data: searchResults } = useCrmAddresses({
    search: searchTerm || undefined,
    type: addressType as "CUSTOMER" | "SUPPLIER" | "BOTH" | undefined,
    isActive: true,
    page: 1,
    pageSize: 10,
    enabled: searchOpen,
  })

  const handleSelectParent = async (parentId: string) => {
    try {
      await setParent.mutateAsync({ id: addressId, parentAddressId: parentId })
      toast.success(t('parentSetSuccess'))
      setSearchOpen(false)
      setSearchTerm('')
    } catch {
      toast.error(t('parentSetFailed'))
    }
  }

  const handleRemoveParent = async () => {
    try {
      await setParent.mutateAsync({ id: addressId, parentAddressId: null })
      toast.success(t('parentRemovedSuccess'))
      setRemoveConfirmOpen(false)
    } catch {
      toast.error(t('parentSetFailed'))
    }
  }

  // Filter out self and existing children from search results
  const filteredResults = searchResults?.items.filter(
    (a) => a.id !== addressId && !childAddresses.some((c) => c.id === a.id)
  ) ?? []

  const isParent = childAddresses.length > 0
  const isChild = parentAddress !== null
  const hasHierarchy = isParent || isChild

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t('sectionGroup')}
          </h3>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('')
                setSearchOpen(true)
              }}
            >
              {t('setParent')}
            </Button>
          )}
        </div>

        {!hasHierarchy && (
          <p className="text-sm text-muted-foreground">{t('noParent')}</p>
        )}

        {/* Show parent link if this is a subsidiary */}
        {isChild && parentAddress && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('labelParentAddress')}</p>
            <div className="flex items-center justify-between">
              <Link
                href={`/${params.locale}/crm/addresses/${parentAddress.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {parentAddress.company} ({parentAddress.number})
              </Link>
              {canEdit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setRemoveConfirmOpen(true)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{tc('remove')}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )}

        {/* Show children list if this is a parent */}
        {isParent && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('labelChildAddresses')} ({childAddresses.length})
            </p>
            <div className="divide-y">
              {childAddresses.map((child) => (
                <div key={child.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/${params.locale}/crm/addresses/${child.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {child.company} ({child.number})
                  </Link>
                  <span className="text-xs text-muted-foreground">{child.city || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parent search dialog */}
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('selectParent')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('searchParentPlaceholder')}
                  className="pl-9"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredResults.map((address) => (
                  <button
                    key={address.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm"
                    onClick={() => handleSelectParent(address.id)}
                  >
                    <span className="font-medium">{address.company}</span>
                    <span className="text-muted-foreground ml-2">({address.number})</span>
                    {address.city && (
                      <span className="text-muted-foreground ml-2">— {address.city}</span>
                    )}
                  </button>
                ))}
                {filteredResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('emptyTitle')}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSearchOpen(false)}>
                {t('cancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove parent confirmation */}
        <ConfirmDialog
          open={removeConfirmOpen}
          onOpenChange={setRemoveConfirmOpen}
          title={t('removeParent')}
          description={t('removeParentConfirm')}
          onConfirm={handleRemoveParent}
        />
      </CardContent>
    </Card>
  )
}
