---
date: 2026-01-27T12:00:00+01:00
researcher: Claude
git_commit: 7467879c158132365d0762639ebd876d7cf6237b
branch: master
repository: terp
topic: "German translations and i18n implementation best practices"
tags: [research, i18n, translations, german, next-intl, localization]
status: complete
last_updated: 2026-01-27
last_updated_by: Claude
---

# Research: German Translations & i18n Implementation Best Practices

**Date**: 2026-01-27
**Researcher**: Claude
**Git Commit**: 7467879c158132365d0762639ebd876d7cf6237b
**Branch**: master
**Repository**: terp

## Research Question

The application has missing German translations. Investigate the current state of i18n in the codebase and document best practices for implementing it properly.

## Summary

The codebase currently has **no i18n framework**. All user-facing text is hardcoded in English across ~50+ components. Date/number formatting uses a mix of `de-DE` and `en-US` locale codes via native JavaScript `Intl` APIs, inconsistently applied across the app. The recommended approach is to implement **next-intl**, the de-facto i18n library for Next.js App Router applications.

## Detailed Findings

### Current State: No i18n Infrastructure

The `apps/web/` Next.js application has:

- **No i18n library** in `package.json` dependencies
- **No translation files** (no JSON, YAML, or locale directories)
- **No middleware** for locale detection or routing
- **No `[locale]/` route segments** in the App Router structure
- **Hardcoded `lang="en"`** in `apps/web/src/app/layout.tsx:25`
- **No i18n config** in `apps/web/next.config.ts`

### Inconsistent Locale Usage in Date/Number Formatting

The app mixes `de-DE` and `en-US` locale strings across components:

**German locale (de-DE) usage:**
- `apps/web/src/lib/time-utils.ts` — `formatDisplayDate()` and related functions use `de-DE`
- `apps/web/src/components/timesheet/day-view.tsx:160` — calculation timestamp
- `apps/web/src/components/monthly-evaluation/monthly-export-buttons.tsx` — month labels and export timestamps
- `apps/web/src/components/timesheet/export-buttons.tsx` — export timestamps
- `apps/web/src/components/year-overview/year-export-buttons.tsx` — export timestamps

**English locale (en-US) usage:**
- `apps/web/src/components/ui/calendar.tsx:116` — month label
- `apps/web/src/components/ui/date-range-picker.tsx` — date range display (3 instances)
- `apps/web/src/components/dashboard/dashboard-header.tsx` — date display
- `apps/web/src/components/time-clock/current-time.tsx` — time and date display
- `apps/web/src/components/vacation/carryover-warning.tsx` — date formatting
- `apps/web/src/components/profile/employment-details-card.tsx` — date formatting
- `apps/web/src/components/absences/pending-requests.tsx` — date formatting

**Hardcoded English labels:**
- `apps/web/src/components/ui/calendar.tsx:48` — `WEEK_DAYS = ['Mon', 'Tue', 'Wed', ...]`

### Hardcoded English Strings (Comprehensive Inventory)

All user-facing text is inline English. Key areas include:

**Navigation** (`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`):
- "Dashboard", "Team Overview", "Time Clock", "Timesheet", "Absences", "Vacation", "Monthly Evaluation", "Year Overview"
- "Management" section: "Employees", "Teams", "Departments", "Day Plans", "Week Plans", "Tariffs", "Holidays", "Absence Types"
- "Administration" section: "Users", "Reports", "Settings", "Tenants"

**Dashboard** (`apps/web/src/app/(dashboard)/dashboard/page.tsx` and components):
- "No Employee Profile", "Clock In", "Clock Out", "Request Time Off", "View Timesheet"
- "Pending Actions", "Recent Activity", "Vacation Days", "All caught up!"

**Time Clock** (`apps/web/src/app/(dashboard)/time-clock/page.tsx` and components):
- "Clock In", "Clock Out", "Break started", "Break ended", "Errand started", "Errand ended"
- "Today's Summary", "Gross Time", "Break Time", "Target", "Balance"

**Authentication** (`apps/web/src/app/(auth)/login/page.tsx`):
- "Welcome to Terp", "Sign In", "Email", "Password", "Don't have an account?"

**Common patterns**: "Loading...", "Retry", "Failed to load", "Save", "Cancel", "Delete", "Export"

### Existing Thoughts/Plans

From `thoughts/shared/plans/2026-01-26-NOK-228-day-plan-management.md`: "Localization (German labels) - English only for now" is listed as a future consideration. No dedicated i18n tickets or plans exist.

## Recommended Approach: next-intl

### Why next-intl

- **Only viable option** for Next.js App Router — `next-i18next` is not compatible with App Router
- **Production-proven** — used by the Node.js website
- **Built-in** date/number formatting that respects locale
- **Full TypeScript support** with type-safe translation keys
- **Server Component support** with `getTranslations()` async API
- **ICU message format** for pluralization and interpolation

### Setup Overview

**1. Install:**
```bash
npm install next-intl
```

**2. Directory structure to add:**
```
apps/web/
├── messages/
│   ├── en.json              # English translations
│   └── de.json              # German translations
├── global.d.ts              # TypeScript augmentation
└── src/
    ├── i18n/
    │   ├── routing.ts       # Locale routing config
    │   ├── request.ts       # Request-level config
    │   └── navigation.ts    # Locale-aware Link/redirect
    └── middleware.ts         # Locale detection middleware
```

**3. Routing config** (`src/i18n/routing.ts`):
```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de'  // German-first since this is a German workforce app
});
```

**4. Next.js config** (`next.config.ts`):
```typescript
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin();
export default withNextIntl({ /* existing config */ });
```

**5. Middleware** (`src/middleware.ts`):
```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
```

**6. App router restructure** — Move routes under `[locale]/`:
```
app/
├── [locale]/
│   ├── layout.tsx           # Locale-aware root layout
│   ├── (auth)/
│   │   └── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx
│       ├── dashboard/page.tsx
│       └── ...
```

**7. Root layout** (`app/[locale]/layout.tsx`):
```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { notFound } from 'next/navigation';

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

### Translation File Structure

**Recommended namespace-based approach for this project:**

```json
// messages/de.json
{
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen",
    "delete": "Löschen",
    "edit": "Bearbeiten",
    "loading": "Laden...",
    "retry": "Erneut versuchen",
    "error": "Fehler",
    "export": "Exportieren"
  },
  "nav": {
    "dashboard": "Dashboard",
    "teamOverview": "Teamübersicht",
    "timeClock": "Stempeluhr",
    "timesheet": "Zeitnachweis",
    "absences": "Abwesenheiten",
    "vacation": "Urlaub",
    "monthlyEvaluation": "Monatsauswertung",
    "yearOverview": "Jahresübersicht",
    "management": "Verwaltung",
    "employees": "Mitarbeiter",
    "teams": "Teams",
    "departments": "Abteilungen"
  },
  "timeClock": {
    "clockIn": "Einstempeln",
    "clockOut": "Ausstempeln",
    "startBreak": "Pause beginnen",
    "endBreak": "Pause beenden",
    "todaySummary": "Tagesübersicht",
    "grossTime": "Bruttozeit",
    "breakTime": "Pausenzeit",
    "target": "Soll",
    "balance": "Saldo"
  }
}
```

### Usage in Components

**Client components:**
```typescript
'use client';
import { useTranslations } from 'next-intl';

export function ClockButton() {
  const t = useTranslations('timeClock');
  return <button>{t('clockIn')}</button>;
}
```

**Server components:**
```typescript
import { getTranslations } from 'next-intl/server';

export default async function TimesheetPage() {
  const t = await getTranslations('timesheet');
  return <h1>{t('title')}</h1>;
}
```

**Date/number formatting (replaces all manual locale calls):**
```typescript
import { useFormatter } from 'next-intl';

function DateDisplay({ date }: { date: Date }) {
  const format = useFormatter();
  // Automatically uses de-DE or en-US based on active locale
  return <span>{format.dateTime(date, { dateStyle: 'medium' })}</span>;
}
```

### German-Specific Considerations

- **Sie vs Du**: For a workforce/B2B application, **"Sie" (formal)** is appropriate
- **Date format**: `DD.MM.YYYY` — handled automatically by `next-intl` when locale is `de`
- **Number format**: `1.234,56` — handled automatically by `next-intl`
- **Time format**: 24-hour (`14:30`) is standard in German
- **Text expansion**: German text is ~20-30% longer than English — UI must accommodate this
- **Noun capitalization**: All German nouns are capitalized

### TypeScript Type Safety

```typescript
// global.d.ts
import { routing } from './src/i18n/routing';
import messages from './messages/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
```

This provides autocomplete for translation keys and compile-time checking for missing translations.

## Code References

- `apps/web/src/app/layout.tsx:25` — Hardcoded `lang="en"`
- `apps/web/next.config.ts` — No i18n configuration
- `apps/web/package.json` — No i18n dependencies
- `apps/web/src/lib/time-utils.ts:279-290` — `formatDisplayDate()` with hardcoded `de-DE`
- `apps/web/src/components/ui/calendar.tsx:48` — Hardcoded English weekday labels
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` — All navigation labels in English

## Architecture Documentation

The current app structure uses Next.js App Router with route groups `(auth)` and `(dashboard)`. Implementing i18n requires adding a `[locale]` dynamic segment at the top level, wrapping the existing route groups. The provider hierarchy (ThemeProvider > QueryProvider > AuthProvider > TenantProvider) would gain `NextIntlClientProvider` at the layout level.

## Historical Context (from thoughts/)

- `thoughts/shared/plans/2026-01-26-NOK-228-day-plan-management.md` — Lists "Localization (German labels)" as a deferred future feature
- No dedicated i18n tickets or implementation plans exist in the project

## Open Questions

1. Should the default locale be `de` (German-first) or `en` (English-first)?
2. Should the URL structure include the locale prefix for the default language (e.g., `/de/dashboard` vs `/dashboard`)?
3. Should translations be single-file (`de.json`) or split by namespace (`de/common.json`, `de/nav.json`, etc.)?
4. Should a language switcher be added to the UI, or should the app be German-only with English as a secondary option?
5. What formality level for German — "Sie" (formal) or "Du" (informal)?
