'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Mail, Phone, Smartphone, UserCheck } from 'lucide-react'
import type { components } from '@/lib/api/types'

type EmployeeContact = NonNullable<components['schemas']['Employee']['contacts']>[number]

interface ContactListItemProps {
  contact: EmployeeContact
  onDelete: (id: string) => void
  isDeleting: boolean
}

const contactTypeConfig: Record<
  string,
  { icon: typeof Mail; label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  email: { icon: Mail, label: 'Email', variant: 'secondary' },
  phone: { icon: Phone, label: 'Phone', variant: 'secondary' },
  mobile: { icon: Smartphone, label: 'Mobile', variant: 'secondary' },
  emergency: { icon: UserCheck, label: 'Emergency', variant: 'default' },
}

/**
 * Individual contact list item with delete functionality.
 */
export function ContactListItem({
  contact,
  onDelete,
  isDeleting,
}: ContactListItemProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const config = contactTypeConfig[contact.contact_type] || contactTypeConfig.phone
  const Icon = config?.icon || Phone

  const handleDeleteClick = () => {
    if (showConfirm) {
      onDelete(contact.id)
      setShowConfirm(false)
    } else {
      setShowConfirm(true)
    }
  }

  const handleCancelDelete = () => {
    setShowConfirm(false)
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{contact.value}</span>
            <Badge variant={config?.variant || 'secondary'} className="text-xs">
              {config?.label || 'Contact'}
            </Badge>
            {contact.is_primary && (
              <Badge variant="outline" className="text-xs">
                Primary
              </Badge>
            )}
          </div>
          {contact.label && (
            <p className="text-xs text-muted-foreground">{contact.label}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showConfirm ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelDelete}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Confirm'}
            </Button>
          </>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete contact</span>
          </Button>
        )}
      </div>
    </div>
  )
}
