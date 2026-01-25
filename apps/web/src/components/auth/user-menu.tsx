'use client'

import { useRouter } from 'next/navigation'
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
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  if (!isAuthenticated || !user) {
    return (
      <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
        Sign In
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <span className="text-muted-foreground">Signed in as </span>
        <span className="font-medium">{user.display_name}</span>
        <span className="ml-2 text-xs text-muted-foreground">({user.role})</span>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Sign Out
      </Button>
    </div>
  )
}
