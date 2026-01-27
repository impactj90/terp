---
date: 2026-01-27T15:20:12+01:00
researcher: impactj90
git_commit: 7467879c158132365d0762639ebd876d7cf6237b
branch: master
repository: terp
topic: "Translation coverage for web app (EN/DE)"
tags: [research, codebase, i18n, translations, next-intl, apps-web]
status: complete
last_updated: 2026-01-27
last_updated_by: impactj90
last_updated_note: "Added follow-up checks for missing translations and hardcoded strings"
---

# Research: Translation coverage for web app (EN/DE)

**Date**: 2026-01-27T15:20:12+01:00
**Researcher**: impactj90
**Git Commit**: 7467879c158132365d0762639ebd876d7cf6237b
**Branch**: master
**Repository**: terp

## Research Question
in the last session i was handling the translation part. is everything properly translated?

## Summary
The web app uses next-intl with two locales (`de`, `en`) and loads translation messages from `apps/web/messages/{locale}.json`. The English and German message files have the same set of keys, so there are no missing entries between them. A subset of entries are identical between EN and DE, meaning the German file contains English (or unchanged) text for those keys.

## Detailed Findings

### i18n configuration and message loading
- Locales are defined as `de` and `en`, with `de` as the default, and locale prefixing set to “as-needed.” (`apps/web/src/i18n/routing.ts:1-6`)
- Requests resolve a locale and load messages from `apps/web/messages/{locale}.json` based on that locale. (`apps/web/src/i18n/request.ts:1-12`)
- Navigation helpers are generated from the routing config. (`apps/web/src/i18n/navigation.ts:1-5`)

### Translation message catalogs
- English strings live in `apps/web/messages/en.json` and German strings live in `apps/web/messages/de.json`. Both files share the same top-level structure (e.g., `common`, `nav`, etc.). (`apps/web/messages/en.json:2`, `apps/web/messages/de.json:2`)
- A comparison of flattened keys shows no missing keys in either file (EN and DE key sets match).
- 80 keys have identical values in EN and DE; this means those entries are not localized to German. Examples include `common.status`, `common.name`, `nav.dashboard`, `adminTeams.title`, `adminDayPlans.fieldCode`, and `adminAccounts.statusSystem`.

### Locale switching UI
- The locale switcher uses `useTranslations('common')` and `t('switchLanguage')` for accessibility labels and renders language labels for `de` and `en`. (`apps/web/src/components/layout/locale-switcher.tsx:1-58`)

## Code References
- `apps/web/src/i18n/routing.ts:1` - Routing config defines locales and default locale.
- `apps/web/src/i18n/request.ts:1` - Request config loads messages by locale.
- `apps/web/src/i18n/navigation.ts:1` - Navigation helpers bound to routing.
- `apps/web/messages/en.json:2` - English message catalog.
- `apps/web/messages/de.json:2` - German message catalog.
- `apps/web/src/components/layout/locale-switcher.tsx:1` - Locale switcher component and labels.

## Architecture Documentation
- The web app uses next-intl with a routing-based locale configuration (`apps/web/src/i18n/*`) and locale-specific JSON message bundles in `apps/web/messages/`. Locale selection is handled via a client-side switcher component that updates the router locale.

## Related Research
- `thoughts/shared/research/2026-01-27-german-translations-i18n-implementation.md`

## Open Questions
- None from code structure alone. Content-level correctness depends on product/translation review.

## Follow-up Research 2026-01-27T15:20:12+01:00

### Missing translation keys in code usage
- Scanned `apps/web/src` for `useTranslations(...)` usages and the corresponding `t('...')` keys. All detected keys resolve to existing entries in `apps/web/messages/en.json`, so no missing translation keys were found in code usage.

### Hardcoded strings in app pages
- The design system page contains extensive hardcoded English UI text and does not use translations. (`apps/web/src/app/[locale]/design-system/page.tsx:1`)
- Other pages were not flagged by the `t('...')`-key scan as missing translations, but this follow-up did not perform a full UI text audit beyond the design-system page and translation-key usage.
