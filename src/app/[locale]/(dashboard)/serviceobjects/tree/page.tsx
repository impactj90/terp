'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCrmAddresses } from '@/hooks'
import { useServiceObjectTree } from '@/hooks/use-service-objects'
import { ServiceObjectTreeView } from '@/components/serviceobjects/service-object-tree-view'

export default function ServiceObjectTreePage() {
  const [customerAddressId, setCustomerAddressId] = React.useState<string>('')

  const { data: addresses } = useCrmAddresses({
    page: 1,
    pageSize: 100,
    type: 'CUSTOMER',
    isActive: true,
  })
  const { data: tree, isLoading } = useServiceObjectTree(
    customerAddressId,
    !!customerAddressId
  )

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/serviceobjects">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zur Liste
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">Serviceobjekte — Baum</h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/serviceobjects">
            <List className="mr-2 h-4 w-4" />
            Listen-Ansicht
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Select value={customerAddressId} onValueChange={setCustomerAddressId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Kunde wählen" />
            </SelectTrigger>
            <SelectContent>
              {addresses?.items.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.company} ({a.number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {customerAddressId && (
        <Card>
          <CardHeader>
            <CardTitle>Hierarchie</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ServiceObjectTreeView nodes={tree} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
