'use client'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeCards } from '@/hooks/api'
import { CreditCard, Barcode, KeyRound, CreditCardIcon } from 'lucide-react'
import type { components } from '@/lib/api/types'

type EmployeeCard = NonNullable<components['schemas']['Employee']['cards']>[number]

interface AccessCardsCardProps {
  employeeId: string
}

/**
 * Format a date string to a readable format.
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const cardTypeConfig: Record<
  string,
  { icon: typeof CreditCard; label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  rfid: { icon: CreditCard, label: 'RFID', variant: 'default' },
  barcode: { icon: Barcode, label: 'Barcode', variant: 'secondary' },
  pin: { icon: KeyRound, label: 'PIN', variant: 'outline' },
}

/**
 * Access card list item.
 */
function AccessCardItem({ card }: { card: EmployeeCard }) {
  const config = cardTypeConfig[card.card_type] || cardTypeConfig.rfid
  const Icon = config?.icon || CreditCard
  const isActive = card.is_active !== false && !card.deactivated_at

  const isExpired = card.valid_to ? new Date(card.valid_to) < new Date() : false
  const effectiveActive = isActive && !isExpired

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{card.card_number}</span>
            <Badge variant={config?.variant || 'secondary'} className="text-xs">
              {config?.label || 'Unknown'}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Valid from {formatDate(card.valid_from)}</span>
            {card.valid_to && (
              <>
                <span>to</span>
                <span>{formatDate(card.valid_to)}</span>
              </>
            )}
            {!card.valid_to && <span className="text-muted-foreground">(No expiry)</span>}
          </div>
        </div>
      </div>

      <Badge
        variant={effectiveActive ? 'default' : 'secondary'}
        className={effectiveActive ? 'bg-green-500 hover:bg-green-500' : ''}
      >
        {isExpired ? 'Expired' : effectiveActive ? 'Active' : 'Inactive'}
      </Badge>
    </div>
  )
}

/**
 * Access cards card showing read-only list of employee access cards.
 */
export function AccessCardsCard({ employeeId }: AccessCardsCardProps) {
  const { data: cards, isLoading } = useEmployeeCards(employeeId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Cards</CardTitle>
          <CardDescription>Your assigned access cards (read-only)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const cardList = Array.isArray(cards) ? cards : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access Cards</CardTitle>
        <CardDescription>Your assigned access cards (read-only)</CardDescription>
      </CardHeader>

      <CardContent>
        {cardList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <CreditCardIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              No access cards assigned
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Contact your administrator to request an access card.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {cardList.map((card) => (
              <AccessCardItem key={card.id} card={card} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
