# Stempeluhr - Benutzerhandbuch

## Überblick

Die **Stempeluhr** ist Ihr wichtigstes Werkzeug zur Erfassung Ihrer täglichen Arbeitszeit. Sie ermöglicht es Ihnen, sich bei Arbeitsbeginn einzustempeln, bei Arbeitsende auszustempeln und Pausen sowie Dienstgänge während des Tages zu erfassen. Das System berechnet automatisch Ihre Arbeitszeit und vergleicht sie mit Ihren geplanten Sollstunden.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter zur täglichen Zeiterfassung
- Administratoren können Stempelungen im Namen beliebiger Mitarbeiter vornehmen

## Voraussetzungen

Bevor Sie die Stempeluhr nutzen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben. Falls Sie "Kein Mitarbeiterdatensatz gefunden" sehen, kontaktieren Sie Ihren Administrator.
2. **Tagesplan-Zuweisung**: Ihrem Mitarbeiterprofil sollte ein Tagesplan oder Wochenplan zugewiesen sein, um Ihre Sollarbeitszeit zu bestimmen.
3. **Systemzugang**: Sie benötigen ein gültiges Benutzerkonto mit Anmeldedaten.

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Stempeluhr

**Mobil:** Verfügbar als einer der 5 primären Schnellzugriffs-Buttons am unteren Bildschirmrand.

**Direkte URL:** `/time-clock`

## Funktionen & Bedienelemente

### 1. Aktuelle Uhrzeit
Eine Echtzeit-Uhr, die die aktuelle Zeit anzeigt. Dies hilft Ihnen zu sehen, wann Sie sich genau ein- oder ausstempeln.

### 2. Status-Anzeige
Zeigt Ihren aktuellen Status auf einen Blick:
- **Ausgestempelt** (grau): Sie haben heute noch nicht mit der Arbeit begonnen
- **Eingestempelt** (grün): Sie arbeiten gerade
- **In Pause** (gelb/orange): Sie befinden sich in einer Pause
- **Im Dienstgang** (blau): Sie sind auf einem arbeitsbezogenen Dienstgang

### 3. Laufender Timer
Wenn Sie eingestempelt sind, wird ein Live-Zähler angezeigt, der zeigt, wie lange Sie in der aktuellen Sitzung bereits arbeiten.

### 4. Haupt-Aktionsbutton
Ein großer runder Button, der sich je nach aktuellem Status ändert:
- **"Einstempeln"** (grün) - Wenn Sie ausgestempelt sind
- **"Ausstempeln"** (rot) - Wenn Sie eingestempelt sind
- **"Pause beenden"** - Wenn Sie in einer Pause sind
- **"Dienstgang beenden"** - Wenn Sie auf einem Dienstgang sind

### 5. Sekundäre Aktionen (Pause & Dienstgang)
Nur sichtbar, wenn Sie eingestempelt sind:
- **Pause starten**: Pausiert Ihren Arbeits-Timer für persönliche Pausen (Mittagessen, Erholung)
- **Dienstgang starten**: Pausiert Ihren Arbeits-Timer für arbeitsbezogene externe Aktivitäten

### 6. Tagesübersicht-Karte
Zeigt Ihre Tagesstatistiken:
- **Bruttozeit**: Gesamtzeit vom Einstempeln bis aktuell/Ausstempeln
- **Pausenzeit**: Gesamte Pausendauer
- **Sollzeit**: Ihre geplante Arbeitszeit für heute
- **Saldo**: Überstunden (+) oder Minusstunden (-) im Vergleich zur Sollzeit

### 7. Buchungsverlauf
Eine chronologische Liste aller Ihrer Stempelereignisse für heute, die zeigt:
- Art der Aktion (Einstempeln, Ausstempeln, Pause-Start, etc.)
- Zeitstempel für jede Aktion

### 8. Mitarbeiterauswahl (nur für Administratoren)
Administratoren sehen ein Dropdown-Menü zur Auswahl des zu verwaltenden Mitarbeiters. Dies ermöglicht es Admins, Stempelungen im Namen von Mitarbeitern vorzunehmen, die keinen Systemzugang haben.

## Schritt-für-Schritt Anleitungen

### Arbeitstag beginnen

1. Navigieren Sie zur **Stempeluhr** im Hauptmenü
2. Überprüfen Sie, ob die aktuelle Uhrzeit korrekt angezeigt wird
3. Bestätigen Sie, dass Ihr Status "Ausgestempelt" zeigt
4. Klicken Sie auf den großen grünen **"Einstempeln"**-Button
5. Warten Sie auf die Erfolgsmeldung, die bestätigt, dass Sie eingestempelt sind
6. Der laufende Timer beginnt zu zählen

### Pause machen

1. Während Sie eingestempelt sind, finden Sie den **"Pause starten"**-Button unterhalb des Haupt-Buttons
2. Klicken Sie auf **"Pause starten"**
3. Ihr Status ändert sich zu "In Pause" und der Timer pausiert
4. Wenn Sie zurückkehren, klicken Sie auf den **"Pause beenden"**-Button (der Haupt-Button ändert sich entsprechend)
5. Ihr Arbeits-Timer läuft weiter

### Dienstgang antreten

Dienstgänge sind für arbeitsbezogene Aktivitäten außerhalb des Büros (z.B. Kundenbesuch, Material abholen).

1. Während Sie eingestempelt sind, klicken Sie auf **"Dienstgang starten"**
2. Ihr Status ändert sich zu "Im Dienstgang"
3. Wenn Sie zurückkehren, klicken Sie auf **"Dienstgang beenden"**
4. **Hinweis**: Anders als Pausen zählen Dienstgänge je nach Unternehmensrichtlinie typischerweise als Arbeitszeit

### Arbeitstag beenden

1. Stellen Sie sicher, dass Sie eingestempelt sind (Status sollte "Eingestempelt" zeigen)
2. Falls Sie in einer Pause oder einem Dienstgang sind, beenden Sie diesen zuerst
3. Klicken Sie auf den roten **"Ausstempeln"**-Button
4. Überprüfen Sie Ihre Tagesübersicht, um Ihre Stunden zu bestätigen
5. Der Buchungsverlauf zeigt alle Einträge des Tages

### Administrator: Für anderen Mitarbeiter stempeln

1. Navigieren Sie zur Stempeluhr
2. Nutzen Sie das **Mitarbeiterauswahl**-Dropdown oben
3. Wählen Sie den zu verwaltenden Mitarbeiter aus
4. Die Seite aktualisiert sich und zeigt den Status dieses Mitarbeiters
5. Führen Sie die benötigten Stempelaktionen durch
6. Ein Datensatz wird erstellt, der zeigt, dass die Aktion von einem Admin durchgeführt wurde

## Auswirkungen auf andere Module

Die Stempeluhr beeinflusst direkt mehrere andere Teile des Systems:

| Modul | Auswirkung |
|-------|------------|
| **Dashboard** | Die Tagesplan-Karte spiegelt Ihren Stempelstatus und Ihre Stunden wider |
| **Stundenzettel** | Alle Stempeleinträge erscheinen als Buchungen in Ihrem Stundenzettel |
| **Monatsauswertung** | Ihre Stempeldaten werden zu Monatsstatistiken aggregiert |
| **Jahresübersicht** | Jahressummen werden aus den täglichen Stempeldaten berechnet |
| **Urlaubssaldo** | Wenn Sie an Urlaubstagen stempeln, kann dies die Salden beeinflussen |
| **Genehmigungen** | Ungewöhnliche Stempelmuster können Genehmigungsanfragen auslösen |

## Tipps & Best Practices

1. **Pünktlich einstempeln**: Stempeln Sie sich ein, sobald Sie ankommen, um eine genaue Zeiterfassung sicherzustellen.

2. **Pausen nicht vergessen**: Starten und beenden Sie Pausen immer korrekt. Das Vergessen, eine Pause zu beenden, führt zu verlängerter Pausenzeit.

3. **Saldo prüfen**: Überprüfen Sie regelmäßig den Tagessaldo, um sicherzustellen, dass Sie Ihre Sollstunden erreichen.

4. **Tagesendkontrolle**: Überprüfen Sie vor dem Verlassen den Buchungsverlauf, um sicherzustellen, dass alle Einträge korrekt aussehen.

5. **Dienstgänge für Arbeitsaufgaben nutzen**: Wenn Sie für eine arbeitsbezogene Aktivität das Büro verlassen, nutzen Sie "Dienstgang" nicht "Pause" - Dienstgänge zählen typischerweise als Arbeitszeit.

6. **Probleme am selben Tag melden**: Wenn Sie vergessen haben zu stempeln oder einen Fehler bemerken, kontaktieren Sie Ihren Admin oder nutzen Sie den Stundenzettel, um Korrekturen anzufordern, solange der Tag noch frisch ist.

## Problembehandlung

### "Kein Mitarbeiterdatensatz gefunden"
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiterdatensatz verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator, um Ihren Mitarbeiterdatensatz zu erstellen oder zu verknüpfen.

### Stempel-Button ist deaktiviert
**Ursache**: Das System verarbeitet eine vorherige Aktion oder lädt Daten.
**Lösung**: Warten Sie einige Sekunden. Falls es weiterhin besteht, aktualisieren Sie die Seite.

### Timer zeigt falsche Zeit
**Ursache**: Browser-Cache oder Zeitzonen-Probleme.
**Lösung**: Aktualisieren Sie die Seite. Stellen Sie sicher, dass Ihr Browser die korrekte Zeitzone eingestellt hat.

### Aktionen werden nicht gespeichert
**Ursache**: Netzwerkverbindungsprobleme oder Sitzungs-Timeout.
**Lösung**: Überprüfen Sie Ihre Internetverbindung. Versuchen Sie, die Seite zu aktualisieren und sich bei Bedarf erneut anzumelden.

### Pausenzeit erscheint zu lang
**Ursache**: Sie haben möglicherweise vergessen, eine frühere Pause zu beenden.
**Lösung**: Überprüfen Sie den Buchungsverlauf. Kontaktieren Sie Ihren Admin, wenn Korrekturen erforderlich sind.

### Mitarbeiterauswahl nicht sichtbar
**Ursache**: Sie haben keine Administratorrechte.
**Lösung**: Dies ist erwartetes Verhalten. Nur Admins können für andere Mitarbeiter stempeln.

## Verwandte Module

- **[Stundenzettel](./stundenzettel.md)** - Detaillierte Zeiteinträge anzeigen und bearbeiten
- **[Dashboard](./dashboard.md)** - Tagesübersicht und Schnellstatistiken sehen
- **[Abwesenheiten](./abwesenheiten.md)** - Freizeit beantragen anstatt zu stempeln
- **[Tagespläne](./tagesplaene.md)** - (Admin) Tägliche Sollstunden konfigurieren
- **[Buchungsarten](./buchungsarten.md)** - (Admin) Stempelarten konfigurieren
