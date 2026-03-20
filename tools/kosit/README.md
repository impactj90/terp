# KoSIT E-Rechnung Validator

Lokale Validierung von generierten E-Rechnungen gegen EN 16931
(XSD + Schematron-Geschäftsregeln).

## Einmalig einrichten

Voraussetzung: Java installiert (`java -version`)

```bash
# Validator JAR herunterladen
wget -O tools/kosit/validator.jar \
  https://github.com/itplr-kosit/validator/releases/download/v1.5.0/validationtool-1.5.0-standalone.jar

# XRechnung Konfiguration (enthält EN 16931 XSD + Schematron)
wget -O tools/kosit/xrechnung.zip \
  https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/release-2024-11-15/validator-configuration-xrechnung-2024-11-15.zip
unzip tools/kosit/xrechnung.zip -d tools/kosit/xrechnung
```

## XML validieren

```bash
# Einzelne XML-Datei prüfen
pnpm validate:einvoice pfad/zur/rechnung.xml

# Oder direkt:
java -jar tools/kosit/validator.jar \
  --scenarios tools/kosit/xrechnung/scenarios.xml \
  pfad/zur/rechnung.xml
```

Ergebnis: "is valid" = OK, "is not valid" = Fehler mit Details.
