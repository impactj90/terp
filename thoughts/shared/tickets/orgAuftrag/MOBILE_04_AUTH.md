# MOB_04 — Login & Auth Pages

| Field | Value |
|-------|-------|
| **Module** | Auth |
| **Dependencies** | MOB_01 (Layout Foundation) |
| **Complexity** | S |
| **Priority** | Hoch (Erster Eindruck, Einstiegspunkt) |
| **New Models** | — |

---

## Ist-Zustand

- Login-Seite: `src/app/[locale]/(auth)/login/page.tsx`
- Auth-Layout: `flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4`
- Login-Form: `w-full max-w-md` — grundsaetzlich responsiv
- Kein Logo/Branding optimiert fuer Mobile
- Password-Feld ohne Toggle-Sichtbarkeit (wichtig auf Mobile — Tastatur verdeckt)

---

## Goal

Login-Seite mobile-optimiert: grosszuegige Touch-Targets, sichtbare Passwort-Toggle, optimales Layout fuer Mobile-Tastaturen, kein Zoomen bei Input-Focus.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/login` | Login-Page | Mobile-Layout-Optimierung |

---

## Aenderungen

### Login-Seite

- Input-Felder: `text-base` (16px) auf Mobile → kein iOS-Zoom
- Passwort-Feld: Eye-Toggle-Button fuer Sichtbarkeit (44x44px Touch-Target)
- Submit-Button: volle Breite, min. 48px Hoehe auf Mobile
- Logo/Branding: angemessene Groesse auf Mobile (max-w-[200px])
- Spacing: `gap-4` zwischen Feldern fuer Finger-Abstand
- Keyboard: `enterkeyhint="go"` auf Submit, `autocomplete` Attribute
- Error-Messages: gut lesbar, nicht von Tastatur verdeckt

### Auth-Layout

- Vertikales Centering mit `min-h-[100dvh]` (Dynamic Viewport Height)
- Padding unten fuer Mobile-Tastatur: `pb-[env(safe-area-inset-bottom)]`

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/(auth)/login/page.tsx` | Mobile-Optimierungen |
| `src/app/[locale]/(auth)/layout.tsx` | Dynamic Viewport Height |
| `src/components/auth/login-form.tsx` (o.ae.) | Touch-Targets, Password-Toggle |

---

## Acceptance Criteria

- [ ] Login-Seite auf 375px: kein horizontaler Scroll, alle Elemente sichtbar
- [ ] Input-Felder 16px Font-Size (kein iOS-Zoom)
- [ ] Password-Toggle-Button vorhanden und 44x44px
- [ ] Submit-Button volle Breite, min. 48px Hoehe
- [ ] `100dvh` statt `100vh` fuer korrektes Mobile-Verhalten
- [ ] Error-Messages lesbar auf Mobile
