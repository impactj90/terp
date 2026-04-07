# MOB_08 — Profil, Benachrichtigungen, Hilfe

| Field | Value |
|-------|-------|
| **Module** | Profile / System |
| **Dependencies** | MOB_01, MOB_03 |
| **Complexity** | S |
| **Priority** | Mittel |
| **New Models** | — |

---

## Ist-Zustand

- Profil: `src/app/[locale]/(dashboard)/profile/page.tsx` — Benutzereinstellungen
- Benachrichtigungen: `src/app/[locale]/(dashboard)/notifications/page.tsx` — Benachrichtigungsliste
- Hilfe: `src/app/[locale]/hilfe/page.tsx` — Hilfeseiten

---

## Goal

Profil-, Benachrichtigungs- und Hilfeseiten mobile-optimiert: einfache Einstellungen, gut lesbare Benachrichtigungen, Hilfe als durchsuchbare Liste.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/profile` | Profile-Page | Einspaltiges Mobile-Layout |
| `/notifications` | Notifications-Page | Kompakte Benachrichtigungsliste |
| `/hilfe` | Help-Page | Mobile-lesbare Hilfe |

---

## Aenderungen

### Profil

- Einspaltiges Layout auf Mobile (kein 2-Spalten-Grid)
- Avatar-Upload: grosser Touch-Target
- Abschnitte (Persoenlich, Passwort, Einstellungen) als ausklappbare Sektionen
- Save-Button: sticky am unteren Rand

### Benachrichtigungen

- Kompakte Benachrichtigungs-Cards
- Swipe-to-Dismiss oder Wisch-Aktionen (optional, nice-to-have)
- Ungelesene visuell hervorgehoben
- "Alle gelesen"-Action oben
- Tap oeffnet Detail/navigiert zum Kontext

### Hilfe

- Suchfeld oben, volle Breite
- Kategorien als Akkordeon
- Text gut lesbar (16px min.)

---

## Acceptance Criteria

- [ ] Profil: einspaltiger auf Mobile, alle Felder erreichbar
- [ ] Profil: Avatar-Upload touch-freundlich
- [ ] Benachrichtigungen: kompakte Cards, Ungelesen hervorgehoben
- [ ] Benachrichtigungen: Tap navigiert zum Kontext
- [ ] Hilfe: Suchfeld volle Breite, Kategorien als Akkordeon
- [ ] Alle Seiten ohne horizontalen Overflow auf 375px
