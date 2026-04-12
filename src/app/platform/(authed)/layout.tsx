"use client"

/**
 * Authenticated platform layout.
 *
 * Wraps all platform pages that require a valid `platform-session` cookie.
 * Uses the same shadcn `SidebarProvider` / `SidebarInset` shell as the
 * tenant `AppLayout` so operators see a consistent UX across the tenant
 * app and the platform console.
 *
 * Deliberately does NOT import `src/components/layout/app-layout.tsx`:
 * that mounts `TenantProvider` and auth hooks that have no meaning on
 * the platform tree.
 *
 * Server-side guard: each procedure re-verifies the JWT on every request.
 * We additionally run `auth.me` here so an expired cookie surfaces as a
 * 401, which the client's `platformFetch` wrapper turns into a hard
 * redirect to `/platform/login?reason=session`.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { LogOut, User, ChevronsUpDown } from "lucide-react"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PlatformSidebar } from "@/components/platform/sidebar"
import { usePlatformTRPC } from "@/trpc/platform/context"
import { usePlatformIdleTimeout } from "@/hooks/use-platform-idle-timeout"

function getInitials(name: string | undefined | null): string {
  if (!name) return "??"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export default function PlatformAuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  usePlatformIdleTimeout()
  const router = useRouter()
  const queryClient = useQueryClient()
  const trpc = usePlatformTRPC()

  const meQuery = useQuery(trpc.auth.me.queryOptions())
  const logout = useMutation({
    ...trpc.auth.logout.mutationOptions(),
    onSuccess: () => {
      queryClient.clear()
      router.push("/platform/login?reason=logout")
    },
    onError: (err) => {
      toast.error(err.message ?? "Abmelden fehlgeschlagen")
    },
  })

  const user = meQuery.data

  return (
    <SidebarProvider>
      <PlatformSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                <Avatar className="h-7 w-7 rounded-md">
                  <AvatarFallback className="rounded-md text-xs">
                    {getInitials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left md:block">
                  <div className="text-sm font-medium leading-tight">
                    {user.displayName}
                  </div>
                  <div className="text-xs leading-tight text-muted-foreground">
                    {user.email}
                  </div>
                </div>
                <ChevronsUpDown className="ml-1 size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Platform-Admin
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/platform/profile/mfa"
                    className="flex items-center"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profil &amp; MFA
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
