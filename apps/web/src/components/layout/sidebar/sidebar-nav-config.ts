import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Clock,
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarHeart,
  ClipboardCheck,
  ClipboardList,
  Users,
  UsersRound,
  Building2,
  Briefcase,
  Landmark,
  MapPin,
  Settings,
  FileText,
  CalendarOff,
  Palmtree,
  UserCog,
  Shield,
  ShieldCheck,
  ScrollText,
  Wallet,
  AlertTriangle,
  CalendarCheck,
  FileOutput,
  Settings2,
  BarChart3,
  FileClock,
  Contact,
  Calculator,
  Umbrella,
  Layers,
  Package,
} from 'lucide-react'
import type { UserRole } from '@/hooks/use-has-role'

/**
 * Navigation item configuration
 */
export interface NavItem {
  /** Translation key in 'nav' namespace */
  titleKey: string
  /** Navigation href */
  href: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Required roles to see this item (if undefined, all roles can see) */
  roles?: UserRole[]
  /** Optional badge count */
  badge?: number
}

/**
 * Navigation section configuration
 */
export interface NavSection {
  /** Translation key in 'nav' namespace */
  titleKey: string
  /** Required roles to see this section (if undefined, all roles can see) */
  roles?: UserRole[]
  /** Navigation items in this section */
  items: NavItem[]
}

/**
 * Main navigation configuration.
 * Organized by sections for better user experience.
 */
export const navConfig: NavSection[] = [
  {
    titleKey: 'main',
    items: [
      {
        titleKey: 'dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
      {
        titleKey: 'teamOverview',
        href: '/team-overview',
        icon: UsersRound,
      },
      {
        titleKey: 'timeClock',
        href: '/time-clock',
        icon: Clock,
      },
      {
        titleKey: 'timesheet',
        href: '/timesheet',
        icon: Calendar,
      },
      {
        titleKey: 'absences',
        href: '/absences',
        icon: CalendarOff,
      },
      {
        titleKey: 'vacation',
        href: '/vacation',
        icon: Palmtree,
      },
      {
        titleKey: 'monthlyEvaluation',
        href: '/monthly-evaluation',
        icon: FileText,
      },
      {
        titleKey: 'yearOverview',
        href: '/year-overview',
        icon: CalendarRange,
      },
    ],
  },
  {
    titleKey: 'management',
    roles: ['admin'],
    items: [
      {
        titleKey: 'approvals',
        href: '/admin/approvals',
        icon: ClipboardCheck,
        roles: ['admin'],
      },
      {
        titleKey: 'employees',
        href: '/admin/employees',
        icon: Users,
        roles: ['admin'],
      },
      {
        titleKey: 'teams',
        href: '/admin/teams',
        icon: UsersRound,
        roles: ['admin'],
      },
      {
        titleKey: 'departments',
        href: '/admin/departments',
        icon: Building2,
        roles: ['admin'],
      },
      {
        titleKey: 'costCenters',
        href: '/admin/cost-centers',
        icon: Landmark,
        roles: ['admin'],
      },
      {
        titleKey: 'locations',
        href: '/admin/locations',
        icon: MapPin,
        roles: ['admin'],
      },
      {
        titleKey: 'employmentTypes',
        href: '/admin/employment-types',
        icon: Briefcase,
        roles: ['admin'],
      },
      {
        titleKey: 'dayPlans',
        href: '/admin/day-plans',
        icon: CalendarDays,
        roles: ['admin'],
      },
{
        titleKey: 'weekPlans',
        href: '/admin/week-plans',
        icon: CalendarRange,
        roles: ['admin'],
      },
      {
        titleKey: 'tariffs',
        href: '/admin/tariffs',
        icon: ScrollText,
        roles: ['admin'],
      },
      {
        titleKey: 'holidays',
        href: '/admin/holidays',
        icon: CalendarHeart,
        roles: ['admin'],
      },
      {
        titleKey: 'absenceTypes',
        href: '/admin/absence-types',
        icon: CalendarOff,
        roles: ['admin'],
      },
      {
        titleKey: 'bookingTypes',
        href: '/admin/booking-types',
        icon: Clock,
        roles: ['admin'],
      },
      {
        titleKey: 'contactTypes',
        href: '/admin/contact-types',
        icon: Contact,
        roles: ['admin'],
      },
      {
        titleKey: 'calculationRules',
        href: '/admin/calculation-rules',
        icon: Calculator,
        roles: ['admin'],
      },
      {
        titleKey: 'accounts',
        href: '/admin/accounts',
        icon: Wallet,
        roles: ['admin'],
      },
      {
        titleKey: 'correctionAssistant',
        href: '/admin/correction-assistant',
        icon: AlertTriangle,
        roles: ['admin'],
      },
      {
        titleKey: 'evaluations',
        href: '/admin/evaluations',
        icon: BarChart3,
        roles: ['admin'],
      },
      {
        titleKey: 'monthlyValues',
        href: '/admin/monthly-values',
        icon: CalendarCheck,
        roles: ['admin'],
      },
      {
        titleKey: 'vacationBalances',
        href: '/admin/vacation-balances',
        icon: Palmtree,
        roles: ['admin'],
      },
      {
        titleKey: 'vacationConfig',
        href: '/admin/vacation-config',
        icon: Umbrella,
        roles: ['admin'],
      },
      {
        titleKey: 'shiftPlanning',
        href: '/admin/shift-planning',
        icon: Layers,
        roles: ['admin'],
      },
      {
        titleKey: 'orders',
        href: '/admin/orders',
        icon: Package,
        roles: ['admin'],
      },
    ],
  },
  {
    titleKey: 'administration',
    roles: ['admin'],
    items: [
      {
        titleKey: 'users',
        href: '/admin/users',
        icon: UserCog,
        roles: ['admin'],
      },
      {
        titleKey: 'userGroups',
        href: '/admin/user-groups',
        icon: ShieldCheck,
        roles: ['admin'],
      },
      {
        titleKey: 'reports',
        href: '/admin/reports',
        icon: FileText,
        roles: ['admin'],
      },
      {
        titleKey: 'auditLogs',
        href: '/admin/audit-logs',
        icon: FileClock,
        roles: ['admin'],
      },
      {
        titleKey: 'settings',
        href: '/admin/settings',
        icon: Settings,
        roles: ['admin'],
      },
      {
        titleKey: 'tenants',
        href: '/admin/tenants',
        icon: Shield,
        roles: ['admin'],
      },
      {
        titleKey: 'payrollExports',
        href: '/admin/payroll-exports',
        icon: FileOutput,
        roles: ['admin'],
      },
      {
        titleKey: 'exportInterfaces',
        href: '/admin/export-interfaces',
        icon: Settings2,
        roles: ['admin'],
      },
      {
        titleKey: 'monthlyEvaluations',
        href: '/admin/monthly-evaluations',
        icon: ClipboardList,
        roles: ['admin'],
      },
    ],
  },
]

/**
 * Mobile bottom navigation items.
 * Limited to 5 items for optimal mobile UX.
 */
export const mobileNavItems: NavItem[] = [
  {
    titleKey: 'dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    titleKey: 'time',
    href: '/time-clock',
    icon: Clock,
  },
  {
    titleKey: 'timesheet',
    href: '/timesheet',
    icon: Calendar,
  },
  {
    titleKey: 'absences',
    href: '/absences',
    icon: CalendarOff,
  },
]
