---
topic: Weitere Branchen-Templates (Gebäudereinigung, Büro, Handwerk)
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
---

# Weitere Branchen-Templates

## Kontext

Der Tenant-Template-Plan (Phase 1–9) bereitet die Architektur so vor,
dass zusätzliche Branchen additiv eingefügt werden können:

- `src/lib/tenant-templates/templates/<branche>/shared-config.ts`
- `src/lib/tenant-templates/templates/<branche>/showcase.ts`
- `src/lib/tenant-templates/templates/<branche>/starter.ts`
- Registry-Eintrag in `src/lib/tenant-templates/registry.ts`
- Industry-Gruppierung im Platform-UI-Dropdown (bereits implementiert,
  liest `INDUSTRY_LABELS` in `src/app/platform/(authed)/tenants/new/page.tsx`)

Heute existiert nur `industriedienstleister`. Folgende Branchen sind
als nächstes priorisiert:

1. **Gebäudereinigung** — Schichtmodelle 6h/8h, objektbasierte Einsatz-
   Planung, typische Abrechnungseinheiten "Qm bereinigte Fläche".
2. **Büro / Verwaltung** — 8h-Standard, Gleitzeit, 30 Urlaubstage,
   klassische Gehaltsstrukturen.
3. **Handwerk** — Baustellen-basierte Stundenzettel, Monteur-Tarife,
   Werkzeug-Zuschüsse.

## Scope pro Branche

Jede neue Branche:

- [ ] `shared-config.ts` mit Departments, Tariffs, DayPlans, WeekPlans,
      BookingTypes, AbsenceTypes, WhArticleGroups, Accounts
- [ ] `showcase.ts` mit `kind: "showcase"` + `applySeedData` (Fake-
      Employees + Beispiel-Belege)
- [ ] `starter.ts` mit `kind: "starter"` (nur Shared-Config +
      `seedUniversalDefaults`)
- [ ] Registry-Eintrag
- [ ] Integration-Tests analog zu
      `industriedienstleister_150.integration.test.ts` und
      `industriedienstleister_starter.integration.test.ts`
- [ ] `INDUSTRY_LABELS`-Map im Platform-UI erweitern

## Referenzen

- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md`
- Heutiges Beispiel: `src/lib/tenant-templates/templates/industriedienstleister/`
