# i18n Implementation with German Translations

## Overview

Implement internationalization (i18n) for the Next.js frontend using `next-intl`. The application currently has all user-facing text hardcoded in English across 136+ files. This plan adds full German and English translation support with German (`de`) as the default locale, formal "Sie" address, and a language switcher in the sidebar.

## Current State Analysis

- **No i18n infrastructure**: No library, translation files, middleware, or `[locale]` route segments
- **Hardcoded `lang="en"`** in root layout (`apps/web/src/app/layout.tsx:25`)
- **Inconsistent locale formatting**: `de-DE` in `time-utils.ts`, `en-US` in UI components like calendar and date-range-picker
- **22 pages**, **189 .tsx files**, **136+ files** with hardcoded English strings
- **89% client components** (use `'use client'` directive)
- **Provider hierarchy**: ThemeProvider > QueryProvider > AuthProvider (root), TenantProvider (dashboard)
- **App router structure**: route groups `(auth)` and `(dashboard)` under `app/`

### Key Discoveries:
- `apps/web/src/app/layout.tsx:25` — hardcoded `lang="en"`
- `apps/web/src/lib/time-utils.ts:276-292` — `formatDisplayDate()` hardcoded to `de-DE`
- `apps/web/src/components/ui/calendar.tsx:48` — hardcoded English weekday labels `['Mon', 'Tue', ...]`
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` — all nav labels in English
- `apps/web/src/app/page.tsx` — root redirect page with hardcoded "Loading..." text
- `apps/web/next.config.ts` — empty config, needs `next-intl` plugin
- No `middleware.ts` exists yet
- No `global.d.ts` for type augmentation

## Desired End State

After completing all phases:

1. All user-facing strings are translated to German (default) and English
2. `next-intl` is fully integrated with App Router under `[locale]` segment
3. Date/time/number formatting uses locale-aware `next-intl` formatters instead of hardcoded locale strings
4. Language switcher in sidebar allows users to switch between DE and EN
5. URLs follow the pattern: `/dashboard` (German, no prefix) and `/en/dashboard` (English)
6. TypeScript provides autocomplete and compile-time checking for translation keys
7. All components use `useTranslations()` or `getTranslations()` instead of inline strings

### Verification:
- `pnpm run typecheck` passes with no errors
- `pnpm run build` succeeds (catches missing translations at build time)
- Navigating to `/dashboard` shows German text
- Navigating to `/en/dashboard` shows English text
- Language switcher toggles between locales and persists preference
- All date/number formatting respects the active locale

## What We're NOT Doing

- **RTL support** — not needed for DE/EN
- **Server-side locale from user profile/DB** — locale is browser/cookie-based only
- **Backend API translations** — API error messages remain in English (frontend can map them)
- **Translating the design system page** (`/design-system`) — dev-only page
- **Translating Storybook** — dev tooling remains English
- **Pluralization rules** — keeping simple string translations for now, can add ICU message format later
- **Per-namespace file splitting** — using single `de.json` / `en.json` files

## Implementation Approach

Use `next-intl` (the standard i18n library for Next.js App Router). The implementation proceeds infrastructure-first: set up the library, restructure routes under `[locale]`, then progressively translate components in logical groups.

Since 89% of components are client components, the primary API is `useTranslations()` hook via `NextIntlClientProvider`. Server components use `getTranslations()`.

Navigation uses locale-aware `Link` and `useRouter` from `@/i18n/navigation` to automatically handle locale prefixes.

---

## Phase 1: Infrastructure Setup

### Overview
Install `next-intl`, create the i18n configuration files, restructure the app router under a `[locale]` segment, and set up TypeScript type safety. After this phase the app runs identically to before but with i18n plumbing in place.

### Changes Required:

#### 1. Install next-intl
```bash
cd apps/web && pnpm add next-intl
```

#### 2. Create i18n routing config
**File**: `apps/web/src/i18n/routing.ts` (new)
```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'as-needed' // No prefix for default locale (de)
});
```

#### 3. Create i18n request config
**File**: `apps/web/src/i18n/request.ts` (new)
```typescript
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

#### 4. Create locale-aware navigation utilities
**File**: `apps/web/src/i18n/navigation.ts` (new)
```typescript
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

#### 5. Create middleware
**File**: `apps/web/src/middleware.ts` (new)
```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
```

#### 6. Update next.config.ts
**File**: `apps/web/next.config.ts`
```typescript
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /* config options here */
}

export default withNextIntl(nextConfig)
```

#### 7. Create initial translation files (scaffold only)
**File**: `apps/web/messages/de.json` (new)
```json
{
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen",
    "delete": "Löschen",
    "edit": "Bearbeiten",
    "create": "Erstellen",
    "loading": "Laden...",
    "retry": "Erneut versuchen",
    "error": "Fehler",
    "export": "Exportieren",
    "search": "Suchen...",
    "noResults": "Keine Ergebnisse",
    "confirm": "Bestätigen",
    "close": "Schließen",
    "back": "Zurück",
    "next": "Weiter",
    "yes": "Ja",
    "no": "Nein",
    "all": "Alle",
    "actions": "Aktionen",
    "details": "Details",
    "status": "Status",
    "description": "Beschreibung",
    "name": "Name",
    "active": "Aktiv",
    "inactive": "Inaktiv"
  },
  "metadata": {
    "title": "Terp",
    "description": "Zeiterfassungs- und Personalverwaltungssystem"
  }
}
```

**File**: `apps/web/messages/en.json` (new)
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "loading": "Loading...",
    "retry": "Retry",
    "error": "Error",
    "export": "Export",
    "search": "Search...",
    "noResults": "No results",
    "confirm": "Confirm",
    "close": "Close",
    "back": "Back",
    "next": "Next",
    "yes": "Yes",
    "no": "No",
    "all": "All",
    "actions": "Actions",
    "details": "Details",
    "status": "Status",
    "description": "Description",
    "name": "Name",
    "active": "Active",
    "inactive": "Inactive"
  },
  "metadata": {
    "title": "Terp",
    "description": "Time tracking and employee management system"
  }
}
```

#### 8. Create TypeScript type augmentation
**File**: `apps/web/global.d.ts` (new)
```typescript
import { routing } from './src/i18n/routing';
import messages from './messages/de.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
```

Update `tsconfig.json` to include the global declaration file (should already be covered by `**/*.ts` include pattern).

#### 9. Restructure app router under [locale]

Move all existing routes under a `[locale]` dynamic segment:

**Before:**
```
app/
├── layout.tsx
├── page.tsx
├── globals.css
├── (auth)/
│   ├── layout.tsx
│   └── login/page.tsx
└── (dashboard)/
    ├── layout.tsx
    └── [all pages...]
```

**After:**
```
app/
├── globals.css          (stays — CSS doesn't need locale)
└── [locale]/
    ├── layout.tsx       (moved + modified)
    ├── page.tsx         (moved + modified)
    ├── (auth)/
    │   ├── layout.tsx   (moved as-is)
    │   └── login/page.tsx (moved as-is)
    └── (dashboard)/
        ├── layout.tsx   (moved as-is)
        └── [all pages...] (moved as-is)
```

#### 10. Update root layout for locale support
**File**: `apps/web/src/app/[locale]/layout.tsx` (moved from `app/layout.tsx`)
```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../globals.css'
import { QueryProvider } from '@/providers/query-provider'
import { AuthProvider } from '@/providers/auth-provider'
import { ThemeProvider } from '@/providers/theme-provider'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { notFound } from 'next/navigation'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata')
  return {
    title: t('title'),
    description: t('description'),
  }
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider defaultTheme="system">
            <QueryProvider>
              <AuthProvider>
                {children}
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

#### 11. Update root page redirect
**File**: `apps/web/src/app/[locale]/page.tsx` (moved from `app/page.tsx`)
```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/providers/auth-provider'
import { useTranslations } from 'next-intl'

export default function HomePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const t = useTranslations('common')

  useEffect(() => {
    if (isLoading) return

    if (isAuthenticated) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">{t('loading')}</div>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && pnpm install` succeeds (next-intl installed)
- [x] `pnpm run typecheck` passes with no errors
- [x] `pnpm run build` succeeds
- [ ] `pnpm run dev` starts without errors

#### Manual Verification:
- [ ] Navigating to `http://localhost:3001/` redirects to `/dashboard` (German, no locale prefix)
- [ ] Navigating to `http://localhost:3001/en` redirects to `/en/dashboard` (English)
- [ ] The app renders and functions identically to before (no visual regressions)
- [ ] Browser console shows no i18n-related warnings

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Navigation, Layout & Common Components

### Overview
Translate the sidebar navigation, header, breadcrumbs, user menu, and shared UI components. Update `time-utils.ts` formatting functions. This phase makes the app's chrome/shell appear in the correct language.

### Changes Required:

#### 1. Add navigation translations
**Files**: `apps/web/messages/de.json` and `apps/web/messages/en.json`

Add `nav` namespace:
```json
// de.json additions
{
  "nav": {
    "main": "Hauptmenü",
    "dashboard": "Dashboard",
    "teamOverview": "Teamübersicht",
    "timeClock": "Stempeluhr",
    "timesheet": "Zeitnachweis",
    "absences": "Abwesenheiten",
    "vacation": "Urlaub",
    "monthlyEvaluation": "Monatsauswertung",
    "yearOverview": "Jahresübersicht",
    "management": "Verwaltung",
    "approvals": "Genehmigungen",
    "employees": "Mitarbeiter",
    "teams": "Teams",
    "departments": "Abteilungen",
    "employmentTypes": "Beschäftigungsarten",
    "dayPlans": "Tagespläne",
    "weekPlans": "Wochenpläne",
    "tariffs": "Tarife",
    "holidays": "Feiertage",
    "absenceTypes": "Abwesenheitsarten",
    "accounts": "Konten",
    "administration": "Administration",
    "users": "Benutzer",
    "reports": "Berichte",
    "settings": "Einstellungen",
    "tenants": "Mandanten"
  },
  "sidebar": {
    "collapse": "Einklappen",
    "expand": "Ausklappen"
  },
  "header": {
    "search": "Suchen...",
    "notifications": "Benachrichtigungen",
    "noNotifications": "Keine neuen Benachrichtigungen"
  },
  "userMenu": {
    "profile": "Profil",
    "settings": "Einstellungen",
    "signOut": "Abmelden",
    "switchTenant": "Mandant wechseln"
  }
}
```

(English `en.json` gets corresponding English values.)

#### 2. Convert sidebar-nav-config to use translation keys
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Change `title` fields from hardcoded strings to translation keys. The nav config becomes a mapping of keys + hrefs + icons. Components that render the nav will call `useTranslations('nav')` to resolve the display strings.

Two approaches:
- **Option A**: Store translation keys in config, resolve in component → cleaner separation
- **Option B**: Make nav config a function that takes `t` → more explicit

**Recommended (Option A)**: Change `title` to `titleKey` (translation key), resolve in rendering component.

```typescript
export interface NavItem {
  titleKey: string        // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
  badge?: number
  descriptionKey?: string // Translation key for description
}

export interface NavSection {
  titleKey: string        // Translation key in 'nav' namespace
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [
  {
    titleKey: 'main',
    items: [
      { titleKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard, descriptionKey: 'dashboardDesc' },
      { titleKey: 'teamOverview', href: '/team-overview', icon: UsersRound },
      // ... etc
    ],
  },
  // ... etc
]
```

#### 3. Update sidebar rendering components
**Files**:
- `apps/web/src/components/layout/sidebar/sidebar-nav.tsx`
- `apps/web/src/components/layout/sidebar/sidebar.tsx`
- `apps/web/src/components/layout/mobile-nav.tsx`

Replace hardcoded string rendering with `useTranslations('nav')`:
```typescript
const t = useTranslations('nav')
// Then: t(item.titleKey) instead of item.title
```

Update sidebar collapse/expand labels:
```typescript
const tSidebar = useTranslations('sidebar')
// tSidebar('collapse'), tSidebar('expand')
```

#### 4. Update header component
**File**: `apps/web/src/components/layout/header.tsx`

Replace "Search..." placeholder and other strings with `useTranslations('header')`.

#### 5. Update user menu component
**File**: `apps/web/src/components/layout/user-menu.tsx`

Replace "Sign Out", "Profile", etc. with `useTranslations('userMenu')`.

#### 6. Replace next/link with locale-aware Link
**All layout/navigation components** that use `import Link from 'next/link'`:
- Change to `import { Link } from '@/i18n/navigation'`

Similarly, replace `useRouter` from `next/navigation` with `useRouter` from `@/i18n/navigation` in components that use programmatic navigation.

**Key files to update:**
- `apps/web/src/components/layout/sidebar/sidebar.tsx` — Link for logo
- `apps/web/src/components/layout/sidebar/sidebar-nav.tsx` — Link for nav items
- `apps/web/src/components/layout/mobile-nav.tsx` — Link for mobile nav items
- `apps/web/src/components/layout/breadcrumbs.tsx` — Link for breadcrumb items
- Any component using `useRouter().push()` for navigation

#### 7. Update calendar weekday labels
**File**: `apps/web/src/components/ui/calendar.tsx`

Replace hardcoded `WEEK_DAYS = ['Mon', 'Tue', ...]` with locale-derived weekday names. Use `useFormatter` from `next-intl` or compute from `Intl.DateTimeFormat` using the current locale.

#### 8. Update date-range-picker locale
**File**: `apps/web/src/components/ui/date-range-picker.tsx`

Replace hardcoded `en-US` locale calls with `useFormatter` from `next-intl`.

#### 9. Update time-utils.ts
**File**: `apps/web/src/lib/time-utils.ts`

For functions that use hardcoded locale strings:
- `formatDisplayDate()` — replace `'de-DE'` with a locale parameter
- `formatRelativeDate()` — replace `'en-US'` and hardcoded "Today"/"Yesterday" strings
- `getGreeting()` — replace hardcoded English greetings

These utility functions are called from client components, so they can either:
- Accept a `locale` parameter
- Or callers can use `useFormatter()` from `next-intl` directly instead of these utils

**Recommended approach**: Add a `locale` parameter to `formatDisplayDate()` and `formatRelativeDate()`. For `getGreeting()`, move to translations since it's a UI string.

Add to translation files:
```json
// de.json
{
  "time": {
    "today": "Heute",
    "yesterday": "Gestern",
    "greeting": {
      "morning": "Guten Morgen",
      "afternoon": "Guten Tag",
      "evening": "Guten Abend"
    }
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm run typecheck` passes
- [x] `pnpm run build` succeeds
- [ ] `pnpm run lint` passes

#### Manual Verification:
- [ ] Sidebar shows German labels when visiting `/dashboard`
- [ ] Sidebar shows English labels when visiting `/en/dashboard`
- [ ] Header search placeholder is in correct language
- [ ] User menu shows translated items
- [ ] Calendar weekdays display in correct language
- [ ] Date formatting respects active locale
- [ ] Breadcrumbs show translated page names
- [ ] Mobile navigation shows translated labels

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard, Time Clock & Timesheet

### Overview
Translate the three most-used employee-facing pages: Dashboard, Time Clock, and Timesheet with all their components.

### Changes Required:

#### 1. Add translation namespaces

Add to `de.json` and `en.json`:
- `dashboard` — "No Employee Profile", "Your user account is not linked...", "Pending Actions", "Recent Activity", "Vacation Days", "All caught up!", "Clock In", "Clock Out", "Request Time Off", "View Timesheet", "Hours This Week", "Flextime Balance", etc.
- `timeClock` — "Clock In", "Clock Out", "Start Break", "End Break", "Start Errand", "End Errand", "Clocked In", "Not Clocked In", "On Break", "On Errand", "Today's Summary", "Gross Time", "Break Time", "Target", "Balance", "No bookings today", "Booking History", etc.
- `timesheet` — "Timesheet", "Day", "Week", "Month", "Target", "Gross", "Breaks", "Net", "Balance", "No data", "Edit Booking", "Export", etc.

#### 2. Update dashboard components
**Files** (~10 files):
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/components/dashboard/dashboard-header.tsx`
- `apps/web/src/components/dashboard/quick-actions.tsx`
- `apps/web/src/components/dashboard/stats-card.tsx`
- `apps/web/src/components/dashboard/hours-this-week-card.tsx`
- `apps/web/src/components/dashboard/vacation-balance-card.tsx`
- `apps/web/src/components/dashboard/flextime-balance-card.tsx`

Each component: add `const t = useTranslations('dashboard')` and replace all hardcoded strings.

#### 3. Update time clock components
**Files** (~9 files):
- `apps/web/src/app/(dashboard)/time-clock/page.tsx`
- `apps/web/src/components/time-clock/clock-button.tsx`
- `apps/web/src/components/time-clock/clock-status-badge.tsx`
- `apps/web/src/components/time-clock/clock-error-alert.tsx`
- `apps/web/src/components/time-clock/clock-success-toast.tsx`
- `apps/web/src/components/time-clock/current-time.tsx`
- `apps/web/src/components/time-clock/booking-history.tsx`
- `apps/web/src/components/time-clock/secondary-actions.tsx`
- `apps/web/src/components/time-clock/today-stats.tsx`

#### 4. Update timesheet components
**Files** (~10 files):
- `apps/web/src/app/(dashboard)/timesheet/page.tsx`
- `apps/web/src/components/timesheet/day-view.tsx`
- `apps/web/src/components/timesheet/week-view.tsx`
- `apps/web/src/components/timesheet/month-view.tsx`
- `apps/web/src/components/timesheet/daily-summary.tsx`
- `apps/web/src/components/timesheet/booking-list.tsx`
- `apps/web/src/components/timesheet/booking-edit-dialog.tsx`
- `apps/web/src/components/timesheet/booking-pair.tsx`
- `apps/web/src/components/timesheet/error-badge.tsx`
- `apps/web/src/components/timesheet/export-buttons.tsx`

#### 5. Update date formatting in these components
Replace any `toLocaleDateString('en-US', ...)` or `toLocaleDateString('de-DE', ...)` calls with `useFormatter()` from `next-intl`.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds

#### Manual Verification:
- [ ] Dashboard page shows all text in German at `/dashboard`
- [ ] Dashboard page shows all text in English at `/en/dashboard`
- [ ] Time clock page fully translated in both languages
- [ ] Timesheet page fully translated in both languages
- [ ] Clock in/out flow works correctly with translated labels
- [ ] Time clock status badges show correct translated text
- [ ] Timesheet export buttons show correct language
- [ ] No untranslated English strings visible on these three pages

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Absence, Vacation & Evaluation Pages

### Overview
Translate the absence management, vacation balance, monthly evaluation, and year overview pages.

### Changes Required:

#### 1. Add translation namespaces

Add to `de.json` and `en.json`:
- `absences` — "Request Absence", "Absence Type", "Start Date", "End Date", "Half Day", "Reason", "Pending", "Approved", "Rejected", "Pending Requests", etc.
- `vacation` — "Vacation Balance", "Entitlement", "Used", "Remaining", "Carried Over", "Upcoming Vacation", "Transaction History", "Carryover Warning", etc.
- `monthlyEvaluation` — "Monthly Evaluation", "Summary", "Daily Breakdown", "Close Month", "Reopen Month", "Net Time", "Overtime", "Export", month names, etc.
- `yearOverview` — "Year Overview", "Monthly Summary", "Flextime Chart", "Year Summary", etc.

#### 2. Update absence components
**Files** (~4 files):
- `apps/web/src/app/(dashboard)/absences/page.tsx`
- `apps/web/src/components/absences/absence-request-form.tsx`
- `apps/web/src/components/absences/pending-requests.tsx`
- `apps/web/src/components/absences/absence-calendar-view.tsx`

#### 3. Update vacation components
**Files** (~6 files):
- `apps/web/src/app/(dashboard)/vacation/page.tsx`
- `apps/web/src/components/vacation/balance-breakdown.tsx`
- `apps/web/src/components/vacation/upcoming-vacation.tsx`
- `apps/web/src/components/vacation/transaction-history.tsx`
- `apps/web/src/components/vacation/carryover-warning.tsx`
- `apps/web/src/components/vacation/year-selector.tsx`

#### 4. Update monthly evaluation components
**Files** (~6 files):
- `apps/web/src/app/(dashboard)/monthly-evaluation/page.tsx`
- `apps/web/src/components/monthly-evaluation/monthly-summary-cards.tsx`
- `apps/web/src/components/monthly-evaluation/daily-breakdown-table.tsx`
- `apps/web/src/components/monthly-evaluation/close-month-sheet.tsx`
- `apps/web/src/components/monthly-evaluation/reopen-month-sheet.tsx`
- `apps/web/src/components/monthly-evaluation/monthly-export-buttons.tsx`

#### 5. Update year overview components
**Files** (~4 files):
- `apps/web/src/app/(dashboard)/year-overview/page.tsx`
- `apps/web/src/components/year-overview/year-overview-table.tsx`
- `apps/web/src/components/year-overview/year-summary-cards.tsx`
- `apps/web/src/components/year-overview/flextime-chart.tsx`
- `apps/web/src/components/year-overview/year-export-buttons.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds

#### Manual Verification:
- [ ] Absence request form fully translated
- [ ] Pending requests list shows translated status labels
- [ ] Vacation balance page shows all German text at `/vacation`
- [ ] Carryover warning displays in correct language
- [ ] Monthly evaluation summary, daily breakdown, and export buttons translated
- [ ] Close/reopen month dialogs translated
- [ ] Year overview table and charts show translated labels
- [ ] Month names display in correct language throughout

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Profile, Auth & Team Overview

### Overview
Translate the login page, profile page, and team overview page with all their components.

### Changes Required:

#### 1. Add translation namespaces

Add to `de.json` and `en.json`:
- `auth` — "Welcome to Terp", "Sign In", "Email", "Password", "Sign in with email", "Don't have an account?", "Invalid credentials", etc.
- `profile` — "Personal Information", "Employment Details", "Access Cards", "Time Plan", "Account Settings", "Emergency Contacts", "Contact Form", etc.
- `teamOverview` — "Team Overview", "Team Attendance", "Upcoming Absences", "Quick Actions", status labels ("Present", "Absent", "On Break", etc.)

#### 2. Update auth components
**Files** (~3 files):
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/components/auth/protected-route.tsx` (if has visible strings)
- `apps/web/src/components/auth/tenant-guard.tsx` (if has visible strings)

#### 3. Update profile components
**Files** (~10 files):
- `apps/web/src/app/(dashboard)/profile/page.tsx`
- `apps/web/src/components/profile/profile-header.tsx`
- `apps/web/src/components/profile/personal-info-card.tsx`
- `apps/web/src/components/profile/employment-details-card.tsx`
- `apps/web/src/components/profile/access-cards-card.tsx`
- `apps/web/src/components/profile/time-plan-card.tsx`
- `apps/web/src/components/profile/account-settings-card.tsx`
- `apps/web/src/components/profile/emergency-contacts-card.tsx`
- `apps/web/src/components/profile/contact-form-dialog.tsx`
- `apps/web/src/components/profile/contact-list-item.tsx`

#### 4. Update team overview components
**Files** (~6 files):
- `apps/web/src/app/(dashboard)/team-overview/page.tsx`
- `apps/web/src/components/team-overview/team-attendance-list.tsx`
- `apps/web/src/components/team-overview/team-member-status-row.tsx`
- `apps/web/src/components/team-overview/team-quick-actions.tsx`
- `apps/web/src/components/team-overview/team-upcoming-absences.tsx`
- `apps/web/src/components/team-overview/team-stats-cards.tsx`
- `apps/web/src/components/team-overview/team-selector.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds

#### Manual Verification:
- [ ] Login page fully translated in both languages
- [ ] Profile page shows all sections translated
- [ ] Team overview page shows translated status labels, actions, and headers
- [ ] Auth error messages display in correct language

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Admin Pages

### Overview
Translate all admin/management pages. These share common patterns (data tables, detail sheets, form sheets) so this phase is repetitive but large.

### Changes Required:

#### 1. Add translation namespaces

Add to `de.json` and `en.json`:
- `admin` — shared admin strings: "Created", "Updated", "ID", table headers
- `adminEmployees` — employee management strings
- `adminTeams` — team management strings
- `adminDepartments` — department management strings
- `adminDayPlans` — day plan management strings
- `adminWeekPlans` — week plan management strings
- `adminTariffs` — tariff management strings
- `adminHolidays` — holiday management strings
- `adminAbsenceTypes` — absence type management strings
- `adminAccounts` — account management strings
- `adminApprovals` — approval management strings

#### 2. Update admin page files
For each admin section, update:
- Page component (`page.tsx`)
- Data table component (`*-data-table.tsx`)
- Detail sheet component (`*-detail-sheet.tsx`)
- Form sheet component (`*-form-sheet.tsx`)

**Admin sections** (10 total):
1. Employees
2. Teams
3. Departments
4. Day Plans
5. Week Plans
6. Tariffs
7. Holidays
8. Absence Types
9. Accounts
10. Approvals

Estimated ~30-40 files total.

#### 3. Common pattern for data tables
Each data table has column headers, action buttons, and status labels. Use a shared translation pattern:
```typescript
const t = useTranslations('adminEmployees')
const tCommon = useTranslations('common')

// Column headers
{ header: t('firstName'), ... }
{ header: t('lastName'), ... }

// Actions
<Button>{tCommon('edit')}</Button>
<Button>{tCommon('delete')}</Button>
```

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds

#### Manual Verification:
- [ ] Each admin page shows translated table headers, labels, and actions
- [ ] Create/edit forms show translated field labels and placeholders
- [ ] Detail sheets show translated information
- [ ] Approval page shows translated status labels and action buttons
- [ ] All 10 admin sections verified

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Language Switcher & Final Polish

### Overview
Add a language switcher to the sidebar, perform a final audit for any remaining hardcoded strings, and ensure consistent date/number formatting throughout.

### Changes Required:

#### 1. Create language switcher component
**File**: `apps/web/src/components/layout/sidebar/language-switcher.tsx` (new)

A small toggle in the sidebar footer (above or near the collapse button) that switches between DE and EN.

```typescript
'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { Globe } from 'lucide-react'

export function LanguageSwitcher({ isCollapsed }: { isCollapsed: boolean }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale() {
    const nextLocale = locale === 'de' ? 'en' : 'de'
    router.replace(pathname, { locale: nextLocale })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      className={cn('w-full justify-start gap-2', isCollapsed && 'justify-center px-2')}
    >
      <Globe className="h-4 w-4" />
      {!isCollapsed && (locale === 'de' ? 'English' : 'Deutsch')}
    </Button>
  )
}
```

#### 2. Add language switcher to sidebar
**File**: `apps/web/src/components/layout/sidebar/sidebar.tsx`

Add `<LanguageSwitcher />` in the sidebar footer area, above the collapse toggle.

#### 3. Final string audit
Search the entire `apps/web/src/` directory for remaining hardcoded English strings:
- Search for common patterns: `"Loading"`, `"Error"`, `"Save"`, `"Cancel"`, `"Delete"`, etc.
- Check all `aria-label` attributes
- Check all `placeholder` attributes
- Check all toast/notification messages
- Verify no `toLocaleDateString('en-US')` or `toLocaleDateString('de-DE')` calls remain

#### 4. Standardize date/number formatting
Audit all components for manual locale formatting and replace with `useFormatter()` from `next-intl`:

```typescript
// Before
date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

// After
const format = useFormatter()
format.dateTime(date, { day: '2-digit', month: '2-digit' })
```

#### 5. Update export functionality
Export buttons (timesheet, monthly evaluation, year overview) generate filenames and content. Ensure exported filenames and any exported text content respect the active locale.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` succeeds
- [ ] `pnpm run lint` passes
- [ ] No hardcoded English strings found in grep scan (excluding code comments and variable names)

#### Manual Verification:
- [ ] Language switcher appears in sidebar
- [ ] Clicking language switcher toggles between DE and EN
- [ ] Language preference persists across page navigations
- [ ] All pages display correctly in both German and English
- [ ] Date formatting shows DD.MM.YYYY in German and MM/DD/YYYY in English
- [ ] Number formatting shows 1.234,56 in German and 1,234.56 in English
- [ ] No untranslated strings visible anywhere in the app
- [ ] Export filenames reflect the active locale

**Implementation Note**: This is the final phase. After all verifications pass, the i18n implementation is complete.

---

## Testing Strategy

### Automated Testing:
- `pnpm run typecheck` — TypeScript catches missing translation key references via `global.d.ts` type augmentation
- `pnpm run build` — Next.js build catches runtime errors in server components
- Consider adding a CI check that compares keys between `de.json` and `en.json` to ensure parity

### Manual Testing Checklist:
1. Visit each of the 22 pages in German (default)
2. Switch to English and verify each page
3. Test clock in/out flow in both languages
4. Test absence request flow in both languages
5. Test admin CRUD operations (create/edit/delete) in both languages
6. Test export functionality in both languages
7. Verify date/number formatting on evaluation and overview pages
8. Test mobile responsive view with translated text (German is ~20-30% longer)
9. Verify the language preference persists after browser refresh

## Performance Considerations

- Single JSON file per locale keeps bundle manageable (~10-20KB per locale)
- `next-intl` supports tree-shaking of unused translations in production
- All translations loaded via `getMessages()` in the root layout — no per-page loading needed
- No additional network requests for translations (bundled at build time)

## Migration Notes

- No database changes required
- No API changes required
- All changes are frontend-only in `apps/web/`
- The URL structure changes (adding `[locale]` segment) but the middleware ensures backward compatibility — existing bookmarked URLs like `/dashboard` continue to work (resolved as German locale)

## German Translation Guidelines

- **Formality**: Use "Sie" (formal address) throughout
- **Noun capitalization**: All German nouns are capitalized
- **Date format**: DD.MM.YYYY (handled by `next-intl` locale)
- **Time format**: 24-hour (14:30) — standard in German
- **Number format**: 1.234,56 (period for thousands, comma for decimal)
- **Text expansion**: German text is 20-30% longer than English — UI should accommodate with flexible layouts (already using Tailwind responsive utilities)

## References

- Research document: `thoughts/shared/research/2026-01-27-german-translations-i18n-implementation.md`
- next-intl documentation: https://next-intl.dev
- Root layout: `apps/web/src/app/layout.tsx`
- Nav config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- Time utils: `apps/web/src/lib/time-utils.ts`
