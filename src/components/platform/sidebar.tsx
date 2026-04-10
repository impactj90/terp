"use client"

/**
 * Platform-admin sidebar.
 *
 * Uses the same shadcn sidebar primitives as the tenant `AppSidebar`
 * (`src/components/layout/sidebar/sidebar.tsx`) so the platform console
 * feels visually identical to the operator's muscle memory from the
 * tenant app.
 *
 * Intentionally does NOT import `src/components/layout/app-layout.tsx`
 * or `AppSidebar`: those mount `TenantProvider`, `useAuth`, modules
 * hooks, etc., none of which exist on the platform tree.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  LifeBuoy,
  ScrollText,
  UsersRound,
  UserCog,
} from "lucide-react"
import {
  Sidebar as ShadcnSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { href: "/platform/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/platform/tenants", label: "Tenants", icon: Building2 },
  {
    href: "/platform/support-sessions",
    label: "Support-Sessions",
    icon: LifeBuoy,
  },
  { href: "/platform/audit-logs", label: "Audit-Log", icon: ScrollText },
  {
    href: "/platform/platform-users",
    label: "Platform-Users",
    icon: UsersRound,
  },
  { href: "/platform/profile/mfa", label: "Profil", icon: UserCog },
]

export function PlatformSidebar() {
  const pathname = usePathname()

  return (
    <ShadcnSidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Terp Platform">
              <Link href="/platform/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-lg font-bold">T</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Terp Platform</span>
                  <span className="text-xs text-muted-foreground">
                    Admin-Konsole
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`)
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href} prefetch={false}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </ShadcnSidebar>
  )
}
