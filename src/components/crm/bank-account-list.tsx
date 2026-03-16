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

interface CrmBankAccount {
  id: string
  iban: string
  bic: string | null
  bankName: string | null
  accountHolder: string | null
  isDefault: boolean
}

interface BankAccountListProps {
  bankAccounts: CrmBankAccount[]
  onAdd: () => void
  onEdit: (bankAccount: CrmBankAccount) => void
  onDelete: (bankAccount: CrmBankAccount) => void
}

export function BankAccountList({ bankAccounts, onAdd, onEdit, onDelete }: BankAccountListProps) {
  const t = useTranslations('crmAddresses')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('bankAccountsTitle')}</h3>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addBankAccount')}
        </Button>
      </div>

      {bankAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('emptyTitle')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('labelIban')}</TableHead>
              <TableHead>{t('labelBic')}</TableHead>
              <TableHead>{t('labelBankName')}</TableHead>
              <TableHead>{t('labelAccountHolder')}</TableHead>
              <TableHead className="w-24">{t('labelIsDefault')}</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">{t('columnActions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-mono text-sm">{account.iban}</TableCell>
                <TableCell>{account.bic || '—'}</TableCell>
                <TableCell>{account.bankName || '—'}</TableCell>
                <TableCell>{account.accountHolder || '—'}</TableCell>
                <TableCell>
                  {account.isDefault && (
                    <Badge variant="default">{t('labelIsDefault')}</Badge>
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
                      <DropdownMenuItem onClick={() => onEdit(account)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(account)}
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
