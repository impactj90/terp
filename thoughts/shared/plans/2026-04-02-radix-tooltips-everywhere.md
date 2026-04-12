# Radix Tooltips Everywhere — Implementation Plan

## Overview

Add Radix `<Tooltip>` from `@/components/ui/tooltip` to every icon-only interactive element across the entire app — **except** `DropdownMenuTrigger` buttons (mobile safety issue). Currently only **15 files** use Radix tooltips, while **75+ files** have icon-only buttons without any tooltip. Additionally, ~10 files use HTML `title=` attributes that should be converted to Radix tooltips for consistent UX. The ~61 `MoreHorizontal` dropdown triggers will use `sr-only` for accessibility instead.

**Date**: 2026-04-02
**Branch**: staging
**Git Commit**: 5884ab34

## Current State Analysis

### Tooltip component
- `src/components/ui/tooltip.tsx` — shadcn/ui wrapper over `@radix-ui/react-tooltip`
- Exports: `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`
- `<Tooltip>` internally wraps itself in `<TooltipProvider delayDuration={0}>`, so standalone usage works without a separate provider

### Files already using Radix Tooltip (15):
- `src/components/layout/sidebar/sidebar.tsx`
- `src/components/layout/sidebar/sidebar-nav-item.tsx`
- `src/components/timesheet/timeline-bar.tsx`
- `src/components/timesheet/error-badge.tsx`
- `src/components/team-overview/team-attendance-pattern.tsx`
- `src/components/profile/profile-header.tsx`
- `src/components/absence-types/absence-type-data-table.tsx`
- `src/components/absence-types/absence-type-detail-sheet.tsx`
- `src/components/accounts/account-data-table.tsx`
- `src/components/accounts/account-detail-sheet.tsx`
- `src/components/booking-types/booking-type-data-table.tsx`
- `src/components/vacation/balance-breakdown.tsx`
- `src/components/crm/address-data-table.tsx`
- `src/components/terminal-bookings/bookings-tab.tsx`
- `src/app/[locale]/(dashboard)/admin/users/page.tsx`

### Established pattern (from `profile-header.tsx`):
```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

<Tooltip>
  <TooltipTrigger asChild>
    <Button size="icon" variant="outline" ...>
      <Camera className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{t('changeAvatar')}</TooltipContent>
</Tooltip>
```

### Available i18n keys in `common` namespace:
- `back`, `edit`, `delete`, `close`, `cancel`, `save`, `actions`, `next`, `create`, `export`, `search`, `more`

### Missing i18n keys (to be added):
- `goBack`, `previousMonth`, `nextMonth`, `previousPeriod`, `nextPeriod`
- `download`, `upload`, `remove`, `add`
- `openMenu`, `toggleSidebar`, `bold`, `italic`
- `confirm`, `clearField`, `togglePanel`

## Desired End State

Every icon-only button, icon trigger, and icon action in the app has either:
- A Radix `<Tooltip>` showing a descriptive label on hover (standalone buttons), OR
- A `<span className="sr-only">` for accessibility (`MoreHorizontal` dropdown triggers — excluded from Radix tooltip due to mobile breakage)

No HTML `title=` attributes remain on interactive elements. All tooltip/sr-only text is internationalized via `next-intl`.

### Verification:
1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. Manual (desktop): hover over any standalone icon button → Radix tooltip appears
4. Manual (mobile): all dropdown triggers still work on tap — no broken interactions
5. Manual: no HTML native tooltips (delayed, unstyled) remain on buttons

## What We're NOT Doing

- Not changing tooltip component styling or behavior
- Not adding tooltips to text buttons (buttons that already have visible labels)
- Not adding tooltips to `DropdownMenuItem` entries (they already have text labels)
- Not adding tooltips to Recharts `<Tooltip />` (different component, chart-specific)
- Not refactoring existing tooltip usage that already works
- **Not wrapping `DropdownMenuTrigger` buttons with `<Tooltip>`** — see "Mobile Safety" below

## Mobile Safety: DropdownMenu + Tooltip Nesting

Nesting `<TooltipTrigger asChild>` around `<DropdownMenuTrigger asChild>` is a **known problematic pattern** with documented Radix issues:

1. **Mobile: dropdown may not open** — `TooltipTrigger` intercepts `pointerdown` before `DropdownMenuTrigger` receives it (radix-ui/primitives#3012)
2. **Desktop: ghost tooltip after close** — dropdown returns focus to trigger on close, re-firing the tooltip unexpectedly (radix-ui/primitives#2727)
3. **Event handler collision** — two `asChild` wrappers compete for pointer events on one DOM node (radix-ui/primitives#2487)

**Decision**: For all `MoreHorizontal` dropdown triggers (~61 files), keep `<span className="sr-only">` for accessibility instead of Radix tooltip. These buttons open a labeled menu immediately on click — the menu items themselves ("Bearbeiten", "Löschen", etc.) provide all the context needed. A tooltip on `⋯` adds minimal UX value vs. the mobile breakage risk.

## Implementation Approach

Work file-by-file within each phase. For each file:
1. Add `import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'`
2. Wrap each icon-only `<Button>` with `<Tooltip><TooltipTrigger asChild>...<TooltipContent>` 
3. Use existing i18n keys where available, add new ones where needed
4. Remove any `title=` attributes being replaced
5. Remove redundant `<span className="sr-only">` when tooltip provides the same text (tooltips already provide accessible names)

---

## Phase 1: i18n — Add Missing Common Translation Keys

### Overview
Add all tooltip-specific translation keys to both `messages/de.json` and `messages/en.json` so they're available for all subsequent phases.

### Changes Required:

#### 1. `messages/de.json` — `common` namespace
Add these keys:
```json
{
  "common": {
    "goBack": "Zurück",
    "previousMonth": "Vorheriger Monat",
    "nextMonth": "Nächster Monat",
    "previousPeriod": "Vorherige Periode",
    "nextPeriod": "Nächste Periode",
    "previousWeek": "Vorherige Woche",
    "nextWeek": "Nächste Woche",
    "download": "Herunterladen",
    "upload": "Hochladen",
    "remove": "Entfernen",
    "add": "Hinzufügen",
    "openMenu": "Menü öffnen",
    "toggleSidebar": "Seitenleiste umschalten",
    "bold": "Fett",
    "italic": "Kursiv",
    "clearField": "Feld leeren",
    "togglePanel": "Panel umschalten"
  }
}
```

#### 2. `messages/en.json` — `common` namespace
Add equivalent English keys:
```json
{
  "common": {
    "goBack": "Go back",
    "previousMonth": "Previous month",
    "nextMonth": "Next month",
    "previousPeriod": "Previous period",
    "nextPeriod": "Next period",
    "previousWeek": "Previous week",
    "nextWeek": "Next week",
    "download": "Download",
    "upload": "Upload",
    "remove": "Remove",
    "add": "Add",
    "openMenu": "Open menu",
    "toggleSidebar": "Toggle sidebar",
    "bold": "Bold",
    "italic": "Italic",
    "clearField": "Clear field",
    "togglePanel": "Toggle panel"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes

#### Manual Verification:
- [ ] Keys exist in both language files with correct values

**Implementation Note**: Complete this phase first — all subsequent phases depend on these keys.

---

## Phase 2: Layout & Navigation (6 files)

### Overview
Add tooltips to all icon-only buttons in layout components: header, mobile sidebar, locale switcher, theme toggle, notifications.

### Changes Required:

#### 1. `src/components/layout/header.tsx`
- Wrap mobile menu hamburger button with tooltip (`openMenu`)
- Wrap any icon-only action buttons

#### 2. `src/components/layout/mobile-sidebar-sheet.tsx`
- Wrap close/toggle button with tooltip

#### 3. `src/components/layout/locale-switcher.tsx`
- Wrap language switcher icon button with tooltip (`common.switchLanguage`)

#### 4. `src/components/layout/notifications.tsx`
- Wrap notification bell icon button with tooltip

#### 5. `src/components/ui/theme-toggle.tsx`
- Wrap theme toggle icon button with tooltip (`common.switchTheme`)

#### 6. `src/components/hilfe/hilfe-page.tsx`
- Wrap any icon-only buttons with tooltip

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes

#### Manual Verification:
- [ ] Hover over header hamburger menu → tooltip "Menü öffnen"
- [ ] Hover over theme toggle → tooltip "Design wechseln"
- [ ] Hover over locale switcher → tooltip "Sprache wechseln" (SKIPPED — DropdownMenuTrigger, kept aria-label only per Mobile Safety)
- [ ] Hover over notification bell → tooltip appears (SKIPPED — DropdownMenuTrigger, kept aria-label only per Mobile Safety)

---

## Phase 3: Admin Detail Pages — Back & Delete Buttons (7 files)

### Overview
Add tooltips to all `ArrowLeft` back buttons and `Trash2`/`UserX` delete buttons on admin detail pages.

### Changes Required:

#### Files (each gets back button + delete button tooltips):
1. `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` — ArrowLeft + UserX
2. `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` — ArrowLeft + Trash2
3. `src/app/[locale]/(dashboard)/admin/macros/[id]/page.tsx` — ArrowLeft
4. `src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx` — ArrowLeft
5. `src/app/[locale]/(dashboard)/admin/accounts/[id]/postings/page.tsx` — ChevronLeft/Right month nav
6. `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` — ArrowLeft
7. `src/app/[locale]/(dashboard)/hr/personnel-file/categories/page.tsx` — any icon buttons

#### Pattern for back button:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon" onClick={() => router.push('/admin/employees')}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{tc('goBack')}</TooltipContent>
</Tooltip>
```

#### Pattern for delete button:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{tc('delete')}</TooltipContent>
</Tooltip>
```

#### Month navigation (postings page):
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => goMonth(-1)}>
      <ChevronLeft className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{tc('previousMonth')}</TooltipContent>
</Tooltip>
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Navigate to any admin detail page → hover back arrow → "Zurück"
- [ ] Hover delete icon → "Löschen"
- [ ] Postings page: hover chevrons → "Vorheriger Monat" / "Nächster Monat"

---

## Phase 4: Data Tables — Ensure `sr-only` on MoreHorizontal Triggers (~61 files)

### Overview
The `MoreHorizontal` dropdown triggers are **excluded from Radix tooltip wrapping** due to mobile breakage risk (see "Mobile Safety" section above). Instead, ensure every `MoreHorizontal` trigger has a `<span className="sr-only">` for screen-reader accessibility. Many already have this — this phase audits and adds it where missing.

### Changes Required:

#### Pattern — ensure sr-only exists inside each trigger:
```tsx
<DropdownMenuTrigger asChild>
  <Button variant="ghost" size="icon-sm">
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">{tc('actions')}</span>
  </Button>
</DropdownMenuTrigger>
```

#### Files to audit (add `sr-only` where missing):

**Files that already have `sr-only`** (verify, no changes needed):
- `src/app/[locale]/(dashboard)/admin/users/page.tsx`
- Many `*-data-table.tsx` files

**Files likely missing `sr-only`** (based on research):
- `src/components/vacation-config/calculation-groups-tab.tsx`
- `src/components/vacation-config/capping-rule-groups-tab.tsx`
- `src/components/vacation-config/capping-rules-tab.tsx`
- `src/components/vacation-config/special-calculations-tab.tsx`
- `src/components/vacation-config/employee-exceptions-tab.tsx`
- `src/components/access-control/profiles-tab.tsx`
- `src/components/access-control/zones-tab.tsx`
- `src/components/access-control/assignments-tab.tsx`
- `src/components/hr/personnel-file-tab.tsx`
- `src/components/warehouse/purchase-order-list.tsx`
- `src/components/warehouse/supplier-invoice-list.tsx`
- `src/components/warehouse/article-list.tsx`
- `src/components/warehouse/article-group-tree.tsx`
- `src/components/warehouse/price-list-selector.tsx`
- `src/components/crm/bank-account-list.tsx`
- `src/components/crm/contact-list.tsx`
- `src/components/crm/correspondence-list.tsx`
- `src/components/crm/inquiry-list.tsx`
- `src/components/crm/task-list.tsx`
- `src/components/employees/tariff-assignments/tariff-assignment-list.tsx`
- `src/components/departments/department-tree-node.tsx`
- `src/components/contact-types/contact-kind-list-panel.tsx`
- `src/components/contact-types/contact-type-list-panel.tsx`
- `src/components/orders/order-assignment-data-table.tsx`
- `src/components/orders/order-booking-data-table.tsx`
- `src/components/macros/macro-assignment-list.tsx`
- `src/components/schedules/schedule-execution-log.tsx`
- `src/components/schedules/schedule-task-list.tsx`
- `src/components/teams/member-management-sheet.tsx`
- `src/components/team-overview/team-quick-actions.tsx`

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes
- [x] Every `MoreHorizontal` trigger has a `sr-only` span: `grep -rn 'MoreHorizontal' src/ --include="*.tsx"` — each match should have a nearby `sr-only`

#### Manual Verification:
- [ ] Screen reader announces "Aktionen" when focusing any `⋯` button
- [ ] No mobile regressions — dropdown menus still open on tap

---

## Phase 5: CRM Components (7 files)

### Overview
Add tooltips to icon-only buttons in CRM detail views and forms (not the MoreHorizontal triggers — those are Phase 4).

### Changes Required:

#### 1. `src/components/crm/address-group-section.tsx`
- X button to remove parent link → tooltip `tc('remove')`

#### 2. `src/components/crm/contact-form-dialog.tsx`
- Any icon-only buttons

#### 3. `src/components/crm/correspondence-attachment-list.tsx`
- Download button → tooltip `tc('download')` — **convert from `title=` to Radix**
- Delete button → tooltip `tc('delete')` — **convert from `title=` to Radix**

#### 4. `src/components/crm/correspondence-attachment-upload.tsx`
- X remove-pending-file button → tooltip `tc('remove')`

#### 5. `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`
- ArrowLeft back button → tooltip `tc('goBack')`

#### 6. `src/components/crm/task-list.tsx` *(non-MoreHorizontal buttons if any)*

#### 7. `src/components/crm/inquiry-list.tsx` *(non-MoreHorizontal buttons if any)*

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] CRM address detail → hover back arrow → "Zurück"
- [ ] Correspondence attachments → hover download/delete → styled Radix tooltip (not native)

---

## Phase 6: Billing Components (8 files)

### Overview
Add tooltips to all icon-only buttons in billing: document editor, position tables, template list, recurring invoices.

### Changes Required:

#### 1. `src/components/billing/document-editor.tsx`
- ArrowLeft back button → `tc('goBack')`
- Sidebar toggle ChevronLeft/Right → `tc('togglePanel')`

#### 2. `src/components/billing/document-detail.tsx`
- ArrowLeft back button → `tc('goBack')`

#### 3. `src/components/billing/document-detail-legacy.tsx`
- ArrowLeft back button → `tc('goBack')`

#### 4. `src/components/billing/document-form.tsx`
- ArrowLeft back button → `tc('goBack')`

#### 5. `src/components/billing/document-position-table.tsx`
- Trash2 delete buttons → `tc('delete')`

#### 6. `src/components/billing/price-list-entries-table.tsx`
- Pencil edit button → `tc('edit')`
- Trash2 delete button → `tc('delete')`

#### 7. `src/components/billing/recurring-detail.tsx` + `recurring-form.tsx`
- ArrowLeft back button → `tc('goBack')`

#### 8. `src/components/billing/recurring-position-editor.tsx`
- Trash2 remove position button → `tc('remove')`

#### 9. `src/components/billing/template-list.tsx`
- Star set-default button → keep existing `title=`, convert to Radix
- Pencil edit button → `tc('edit')`
- Trash2 delete button → `tc('delete')`

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Document editor → hover sidebar toggle → "Panel umschalten"
- [ ] Position table → hover trash icon → "Löschen"
- [ ] Template list → hover star/pencil/trash → each shows correct tooltip

---

## Phase 7: Warehouse Components (16 files)

### Overview
Add tooltips to all icon-only buttons across warehouse: articles, BOMs, suppliers, purchase orders, scanner, withdrawals, images.

### Changes Required:

#### Back buttons (ArrowLeft → `tc('goBack')`):
1. `src/components/warehouse/article-detail.tsx`
2. `src/components/warehouse/supplier-invoice-detail.tsx`
3. `src/components/warehouse/purchase-order-detail.tsx`
4. `src/components/warehouse/purchase-order-form.tsx`
5. `src/components/warehouse/reorder-suggestions-list.tsx`
6. `src/components/warehouse/scanner-terminal.tsx`

#### Inline edit/delete pairs (Edit → `tc('edit')`, Trash2 → `tc('delete')`):
7. `src/components/warehouse/article-bom-list.tsx`
8. `src/components/warehouse/article-supplier-list.tsx`
9. `src/components/warehouse/purchase-order-position-table.tsx` — also Check → `tc('confirm')`, X → `tc('cancel')`

#### Other icon buttons:
10. `src/components/warehouse/article-group-tree.tsx` — Plus `tc('add')`, convert `title=` to Radix
11. `src/components/warehouse/article-images-tab.tsx` — Star + Trash2, convert `title=` to Radix
12. `src/components/warehouse/article-image-upload.tsx` — X remove button → `tc('remove')`
13. `src/components/warehouse/withdrawal-terminal.tsx` — × remove item → `tc('remove')`
14. `src/components/warehouse/withdrawal-article-row.tsx` — Trash2 → `tc('remove')`
15. `src/components/warehouse/withdrawal-history.tsx` — ChevronLeft/Right pagination → `tc('previousPeriod')` / `tc('nextPeriod')`
16. `src/components/warehouse/qr-scanner.tsx` — any icon buttons

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Article BOM list → hover edit/delete → tooltips
- [ ] Purchase order positions → hover all four action icons → correct tooltips
- [ ] Article images → hover star/trash → Radix tooltip (not native)

---

## Phase 8: HR & Employee Components (5 files)

### Overview
Add tooltips to icon-only buttons in HR, employee detail, tariff assignments, absences.

### Changes Required:

#### 1. `src/components/employees/employee-detail-sheet.tsx`
- UserX delete button → `tc('delete')`

#### 2. `src/components/employees/tariff-assignments/tariff-assignment-form-sheet.tsx`
- X clear date field → `tc('clearField')`

#### 3. `src/components/hr/personnel-file-entry-dialog.tsx`
- Download attachment → `tc('download')`
- Trash2 delete attachment → `tc('delete')`

#### 4. `src/components/teams/team-detail-sheet.tsx`
- Trash2 delete button → `tc('delete')`

#### 5. `src/components/absences/pending-requests.tsx`
- Edit button → `tc('edit')` (already has sr-only — remove it, tooltip replaces it)
- Ban cancel button → tooltip with cancel absence text

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Employee detail sheet → hover delete → "Löschen"
- [ ] Personnel file dialog → hover download/delete attachment icons → tooltips

---

## Phase 9: Time & Planning Components (7 files)

### Overview
Add tooltips to month/week navigation chevrons and icon buttons in payroll, monthly-values, shift planning, timesheet, year overview.

### Changes Required:

#### Month navigation (ChevronLeft/Right):
1. `src/components/payroll-exports/payroll-export-toolbar.tsx` → `tc('previousMonth')` / `tc('nextMonth')`
2. `src/components/monthly-values/monthly-values-toolbar.tsx` → `tc('previousMonth')` / `tc('nextMonth')`
3. `src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx` → `tc('previousMonth')` / `tc('nextMonth')`
4. `src/app/[locale]/(dashboard)/timesheet/page.tsx` → `tc('previousMonth')` / `tc('nextMonth')`
5. `src/app/[locale]/(dashboard)/year-overview/page.tsx` → `tc('previousYear')` / `tc('nextYear')` (keys already exist)

#### Week/period navigation:
6. `src/components/shift-planning/shift-planning-board.tsx` — ChevronLeft/Right, **convert `title=` to Radix**
7. `src/components/tariffs/rolling-week-plan-selector.tsx` — ChevronLeft/Right if present

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Timesheet page → hover month nav chevrons → "Vorheriger Monat" / "Nächster Monat"
- [ ] Shift planning → hover nav → Radix tooltip (not native browser tooltip)

---

## Phase 10: Miscellaneous UI Components (6 files)

### Overview
Add tooltips to remaining icon-only buttons: rich text editor, calendar, contact items, vacation page, design system page.

### Changes Required:

#### 1. `src/components/ui/rich-text-editor.tsx`
- Bold button → `tc('bold')`
- Italic button → `tc('italic')`

#### 2. `src/components/ui/calendar.tsx`
- ChevronLeft/Right month navigation if icon-only

#### 3. `src/components/profile/contact-list-item.tsx`
- Any icon-only action buttons

#### 4. `src/app/[locale]/(dashboard)/vacation/page.tsx`
- Any icon-only buttons

#### 5. `src/app/[locale]/design-system/page.tsx`
- Any icon-only buttons (may skip if purely demo)

#### 6. `src/components/dsgvo/retention-rules-table.tsx`
- Pencil edit button → `tc('edit')`
- Check save button → `tc('save')`
- × cancel button → `tc('cancel')`

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Rich text editor → hover B/I buttons → "Fett" / "Kursiv"
- [ ] Calendar → hover nav arrows → tooltip

---

## Phase 11: HTML `title=` Cleanup

### Overview
Convert all remaining HTML `title=` attributes on interactive elements to Radix `<Tooltip>`. Some of these will already have been converted in earlier phases. This phase catches any stragglers.

### Changes Required:

Scan all files and convert any remaining `title=` on `<Button>` or interactive elements:

1. `src/components/ai-assistant/ai-assistant-panel.tsx` — resize handle `title=`, new chat button `title=`
2. `src/components/evaluations/daily-values-tab.tsx` — error dot `title=`
3. Any other files found via: `grep -rn 'title=' src/components/ src/app/ --include="*.tsx" | grep -i 'Button'`

**Note**: `title=` on non-interactive elements (plain `<div>`, `<span>` for truncated text) can stay — only convert interactive elements (buttons, links, icon triggers).

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `grep -rn 'title=' src/components/ --include="*.tsx" | grep -i '<Button'` returns 0 results

#### Manual Verification:
- [ ] AI assistant panel → hover resize/new chat → Radix tooltip

---

## Testing Strategy

### Automated:
- `pnpm typecheck` after each phase
- `pnpm lint` after final phase
- `pnpm build` before merge

### Manual Testing Steps (Desktop):
1. Navigate through every major section of the app
2. Hover over every icon-only button — each should show a Radix tooltip (except `⋯` dropdown triggers)
3. Verify tooltip appears instantly (delayDuration=0)
4. Verify tooltip has consistent styling (dark bg, light text, arrow)
5. Verify tooltip disappears when element loses focus/hover
6. Verify no duplicate tooltips (native + Radix) appear on any element
7. Test in both German and English locales

### Manual Testing Steps (Mobile):
1. Verify all `⋯` dropdown triggers still open their menus on tap
2. Verify back/delete/edit buttons still work on tap — tooltips simply don't appear (by design)
3. Verify no ghost tooltips flash on touch interactions
4. Test on real iOS Safari and Android Chrome (not just Chrome DevTools)

## Performance Considerations

- Each `<Tooltip>` wraps itself in `<TooltipProvider>` — this is fine for isolated tooltips
- `MoreHorizontal` triggers are NOT wrapped with Tooltip, avoiding unnecessary re-renders in large tables
- No bundle size concern: `@radix-ui/react-tooltip` is already a dependency

## Migration Notes

- No database changes required
- No API changes required
- Pure frontend/UI change
- Can be shipped incrementally per phase — each phase is independently deployable

## References

- Tooltip component: `src/components/ui/tooltip.tsx`
- Existing best example: `src/components/profile/profile-header.tsx:48-63`
- i18n files: `messages/de.json`, `messages/en.json`
- Research: this plan's own research (conversation context, 2026-04-02)
