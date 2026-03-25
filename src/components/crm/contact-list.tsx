'use client'

import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Edit, Trash2, Plus } from 'lucide-react'

interface CrmContact {
  id: string
  firstName: string
  lastName: string
  salutation: string | null
  title: string | null
  letterSalutation: string | null
  position: string | null
  department: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}

interface ContactListProps {
  contacts: CrmContact[]
  onAdd: () => void
  onEdit: (contact: CrmContact) => void
  onDelete: (contact: CrmContact) => void
}

export function ContactList({ contacts, onAdd, onEdit, onDelete }: ContactListProps) {
  const t = useTranslations('crmAddresses')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('contactsTitle')}</h3>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addContact')}
        </Button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('emptyTitle')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('labelName')}</TableHead>
              <TableHead>{t('labelPosition')}</TableHead>
              <TableHead>{t('labelDepartment')}</TableHead>
              <TableHead>{t('labelPhone')}</TableHead>
              <TableHead>{t('labelEmail')}</TableHead>
              <TableHead className="w-24">{t('labelIsPrimary')}</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">{t('columnActions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">
                  {[contact.salutation, contact.title, contact.firstName, contact.lastName].filter(Boolean).join(' ')}
                </TableCell>
                <TableCell>{contact.position || '—'}</TableCell>
                <TableCell>{contact.department || '—'}</TableCell>
                <TableCell>{contact.phone || '—'}</TableCell>
                <TableCell>{contact.email || '—'}</TableCell>
                <TableCell>
                  {contact.isPrimary && (
                    <Badge variant="default">{t('labelIsPrimary')}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(contact)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(contact)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
