'use client'

import { type ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/providers/tenant-provider'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface TenantGuardProps {
  children: ReactNode
  /** Content to show while loading tenant data */
  loadingFallback?: ReactNode
}

/**
 * Wrapper component that ensures a tenant is selected before rendering children.
 * Shows a tenant selector if multiple tenants are available.
 */
export function TenantGuard({ children, loadingFallback }: TenantGuardProps) {
  const t = useTranslations('auth')
  const { hasTenant, isLoading, tenants, selectTenant } = useTenant()

  // Show loading state while fetching tenants
  if (isLoading) {
    return (
      loadingFallback ?? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-muted-foreground">{t('loading')}</div>
        </div>
      )
    )
  }

  // If no tenants available, show error
  if (tenants.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Building2 className="h-6 w-6" />
            </div>
            <CardTitle>{t('noOrganizationFound')}</CardTitle>
            <CardDescription>
              {t('noOrganizationAccess')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // If tenant is selected, render children
  if (hasTenant) {
    return <>{children}</>
  }

  // Show tenant selector for multiple tenants
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle>{t('selectOrganization')}</CardTitle>
          <CardDescription>
            {t('selectOrganizationDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tenants.map((tenant) => (
            <Button
              key={tenant.id}
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => selectTenant(tenant)}
            >
              <Building2 className="h-4 w-4" />
              {tenant.name}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
