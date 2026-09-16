# Beschäftigungsbilder nach Wirtschaftsbereich

Stand: 9. September 2026. Der kostenlose direkte ILOSTAT-Zugang ergänzt
14 langfristige Beschäftigungsbilder. Einstieg: **Arbeit & Einkommen →
Wirtschaftsbereiche & Arbeit**. Beim bestehenden Thema Beschäftigung lässt
sich zusätzlich ausdrücklich auf die ILO-Perspektive wechseln.

## Bild und Bedeutung

Drei Gruppen ordnen Produktion und Versorgung, Handel und Dienstleistungen
sowie Bildung, Gesundheit und Gesellschaft. Die Startansicht enthält höchstens
fünf kleine Bilder; jede Karte öffnet eine größere Darstellung. Zahlen sind
weiterhin optional. Zwei Länder teilen denselben Kalender und Maßstab je
Wirtschaftsbereich. Verschiedene Karten besitzen eigene Skalen ab Null, was
ausdrücklich beschriftet ist.

Die Darstellung berechnet `100 × Bereich / Gesamtbeschäftigung` aus demselben
Länderjahr. Das zeigt eine wirtschaftliche Struktur, keine Marktgröße in Geld,
Produktivität, Gewinnentwicklung oder faire Bewertung. Wachsende Anteile
können auch durch schrumpfende andere Bereiche entstehen. Keine Sinuskurve,
Glättung, Trendumkehr oder Zukunftswelle wird erfunden.

## Geprüfte Quelle

- Anbieter: [ILOSTAT](https://ilostat.ilo.org/topics/employment/).
- Aktuelle [öffentliche API-Dokumentation](https://rplumber.ilo.org/__docs__/)
  mit [OpenAPI-Schema](https://rplumber.ilo.org/openapi.json).
- Indikator `EMP_2EMP_SEX_ECO_NB_A`, Modellschätzungen November 2025.
- Filter: `SEX_T`, 15 ausdrücklich gewählte `ECO_ISIC4_*`-Kategorien inklusive
  Gesamtbeschäftigung, 1991–2024, CSV mit Codes und englischen Bezeichnungen.
- Export: 40.896.725 Byte, 140.625 Zeilen, 276 Quellengebiete.
- SHA-256: `862cada9beaa7a011f5af38c9b9a46042a361e9e29cd212cb3763f4f51f7a8f7`.

Frühere 403-Antworten des Bulk-Zugangs bedeuten keine fehlende ILO-Anbindung
mehr: Der dokumentierte aktuelle CSV-Endpunkt liefert mit dem transparenten
Clientnamen `PersonalMacro-Atlas/0.1` erfolgreich öffentliche Daten. Es gibt
keine Anmeldung, keinen Schlüssel und keine neue kostenpflichtige API.
Der neuere R-Client bietet daneben RDS; die Anwendung benötigt keinen
zusätzlichen R-Parser und keinen zweiten Datenweg.

Der Import prüft Größe, vollständigen Hash, exaktes Schema, Releasebezeichnung,
Indikator, Geschlechterauswahl, alle Gebiets-/Quellencodes, Klassifikationen,
Jahre, Dubletten und Statuskennzeichen. Ungeprüfte Revisionen werden abgelehnt,
der vorhandene Cache bleibt erhalten. Der Download ist auf 48 MiB und
120 Sekunden begrenzt. TLS-/Hostnameprüfung bleibt aktiv, Redirects sind aus.

## Abgrenzungen

188 heutige Länder und Gebiete besitzen eigene Profile, darunter Deutschland,
USA, Indien und China. `X01` ist das veröffentlichte Weltmodell, `X06` die
eigene **Afrika · ILO-Modellregion** (`ilo:africa`). Diese Region wird nicht mit
UN-, Ember-, UNESCO- oder IRENA-Aggregaten gleichgesetzt. 85 andere
Quellengruppen und die gemeinsame Kanalinselzeile `CHA` werden nicht importiert.
Jersey und Guernsey erhalten dadurch keine gemeinsamen Werte als Einzelwerte.

Die 14 Wirtschaftsbereiche folgen der ILO-Fassung von ISIC Rev.4:

| Gruppe | Bereiche |
|---|---|
| Produktion & Versorgung | Landwirtschaft/Forst/Fischerei; Bergbau; Herstellung; D/E Versorgung; Bau |
| Handel & Dienstleistungen | Handel/Fahrzeugreparatur; H/J Transport/Kommunikation; Gastgewerbe; Finanzen/Versicherungen; L/M/N Immobilien/Unternehmensdienste |
| Bildung, Gesundheit & Gesellschaft | Verwaltung/Verteidigung/Sozialversicherung; Bildung; Gesundheit/Sozialarbeit; R/S/T/U weitere Dienste/Haushalte |

D/E enthält auch Wasser, Abwasser, Abfall und Umweltsanierung. H/J enthält
Information und Kommunikation. L/M/N enthält wissenschaftliche, technische
und weitere wirtschaftliche Dienste. Bildung umfasst öffentliche und private
Anbieter, Gesundheit auch Sozialarbeit und Pflege. Daraus werden keine
Einzelbilder für Solar, Kernenergie, Wasserstoff, Pharma oder private
Bildungsunternehmen abgeleitet.

Die [ILO-Methodenübersicht](https://webapps.ilo.org/ilostat-files/Documents/TEM.pdf)
beschreibt modellierte Lücken, Auswahl nationaler Erhebungen, Abgleich mit
Bevölkerungsgrundlagen und Anpassung historischer Methodenbrüche. Das Modell
verwendet die neuere Beschäftigungsdefinition der 19. ICLS noch nicht überall.
Der Atlas fügt keine separate ICLS19-Statistik an diese Modellreihe an.
Alle Bilder heißen Modellschätzungen, auch wenn gemessene Ausgangsdaten
eingeflossen sind. Die Quelleinheit ist Tausend Personen; bis zu drei
Dezimalstellen werden exakt in ganze Personen übersetzt. Die ursprüngliche
Genauigkeit wird dadurch nicht erhöht.

Das zusätzliche Quellenjahr 2025 bleibt außerhalb der historischen
Produktfreigabe. Die Beschränkung bis 2024 ist eine konservative Auswahl und
kein behauptetes individuelles Projektionskennzeichen. Das Quellenkennzeichen
`A` bedeutet angepasst; ein leeres Kennzeichen beweist keine Beobachtung.
Alle 7.504 A-Kennzeichen und 89.261 leeren Kennzeichen werden erhalten.

Es fehlen 2024 für Libanon und Südsudan, 2023–2024 für Palästina und Sudan
sowie 2022–2024 für die Ukraine. Diese 135 Kalenderzellen bleiben leer.
Linien verbinden nur benachbarte vorhandene Jahre. Veröffentlichte
Komponentensummen können geringfügig von der Gesamtbeschäftigung abweichen
(im vollständigen Export maximal 94 Personen); es gibt keine Umgewichtung.

## Speicherung und Prüfpfad

Atlasmigration `0019` speichert alle 190 Profile und Herkunft gemeinsam in
einer Transaktion. Globale Abrufsperre und 24 Stunden Mindestabstand gelten.
Der Browsermodus meldet `desktop_required`. Drei Darstellungsparameter
`laborGroup`, `laborMetric`, `laborSince`, Perspektive `labor`, Quellenfamilie
`ilo`, Ausgabe und Hash gehören zur gemerkten Ansicht und zum vorhandenen
Journal-Backup.

Reproduzierbare Belege:

- [Quellenaudit](evidence/audit_labor_source.py) und
  [Ergebnis](evidence/labor-source-audit.json).
- [Unabhängiger nativer Abgleich](evidence/check_labor_native.py).
- Rust: exakte Dezimalumrechnung, fehlend/Null, ungültige Werte, Migration
  einer bestehenden Atlas-Testdatenbank, atomarer Rollback, globale Sperre,
  24-Stunden-Sperre und kompletter Originaldaten-Roundtrip.
- Frontend: Nenner, echte Null, gemeinsame Jahre und Skala, Lücken,
  verschiedene Quellenstände, Gebietszuordnung, genaue Themenziele und
  weiterhin sichtbares Hauptland bei fehlendem Vergleich.

Der unabhängige Originaldaten-Roundtrip stimmt für alle **96.765 Zahlen und
135 Fehlwerte** exakt überein. Der gesamte Atlas-Frontendlauf umfasst aktuell
242 erfolgreiche Tests in 35 Dateien. Der echte Tauri-Download, 192 vollständige Command-Antworten, alle Zahlen und
Flags, persönliche Testnotiz und Diagrammbild sind im isolierten Profil
`com.personal-macro.atlas-labor-20260909` geprüft. Ein echter Prozessneustart
liest alles ohne neuen Download unverändert. Die abschließenden Hashes stehen
im [Readiness-Beleg](evidence/labor-readiness.json).

Die CUA-Sichtprüfung bei 1280 und 1024 Pixeln umfasst Deutschland/USA,
Indien/China, Afrika/Welt, alle drei Gruppen, Tastaturöffnung eines Details,
optionale Zahlen, fehlendes Vergleichsgebiet, WDI-Wechsel und einen genauen
Bildungstreffer aus der Quellenübersicht. Keine horizontalen Überläufe oder
Browser-Konsolenwarnungen/-fehler. Zu enge Jahresbeschriftungen wurden anhand
der Sichtprüfung korrigiert. Native Klickautomation ist auf diesem Gerät nicht
verfügbar und wird nicht als bestanden ausgegeben. Echte native Commands,
Fenster-Rendering, Bildspeicherung und Prozessneustart wurden separat ausgeführt.

Typecheck, gezieltes ESLint, Clippy mit `-D warnings`, Formatprüfung und
Produktionsbuild bestehen. Nach den finalen Achsenkorrekturen bestanden erneut
59 einschlägige UI-Tests. Der Build meldet die bestehende Chunkgrößenwarnung;
Windows meldete beim Linken die Erstellung von Importbibliotheken. Produktive
Journal-/Kontodaten wurden nicht gelesen oder verändert. Die Rohdatei,
Prüfprofile und Bilder liegen außerhalb der versionierten Quelldaten.
