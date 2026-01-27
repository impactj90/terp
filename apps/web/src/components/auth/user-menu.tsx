'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/auth-provider'

/**
 * User menu component showing current user and logout button.
 *
 * @example
 * ```tsx
 * <header>
 *   <UserMenu />
 * </header>
 * ```
 */
export function UserMenu() {
  const router = useRouter()
  const t = useTranslations('auth')
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t('loading')}</div>
  }

  if (!isAuthenticated || !user) {
    return (
      <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
        {t('signIn')}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <span className="text-muted-foreground">{t('signedInAs')} </span>
        <span className="font-medium">{user.display_name}</span>
        <span className="ml-2 text-xs text-muted-foreground">({user.role})</span>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        {t('signOut')}
      </Button>
    </div>
  )
}
