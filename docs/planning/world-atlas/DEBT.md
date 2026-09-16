# Schulden von Haushalten und Unternehmen

Stand: 9. September 2026. Die beiden Atlas-Themen `finance:household_debt`
und `finance:corporate_debt` verwenden eigene öffentliche BIS-Reihen.
Es gibt keinen neuen API-Schlüssel und keine zusätzlichen Anbietergebühren.

## Bedeutung des Bilds

Unter **Schuldenquote** zeigt die Linie die Schulden am Quartalsende im
Verhältnis zur nominalen Wirtschaftsleistung der letzten vier Quartale.
**Steigen & Fallen** zeigt die Differenz zur Quote vier Quartale zuvor,
in Prozentpunkten. Die Mittellinie dieser Ansicht bedeutet unverändert zum
Vorjahr. Eine hohe Schuldenquote ist weder ein fairer Marktwert noch ein
eigenständiges Kaufsignal. Beide Ansichten haben keine festgelegte Zyklusdauer,
Prognose, Saisonbereinigung durch die App oder erzwungene Sinusform.

Haushalte schließen private Organisationen ohne Erwerbszweck ein.
Unternehmen schließen private und staatseigene nichtfinanzielle Unternehmen
ein. Banken zählen nicht als Schuldner. Die Kreditgeber umfassen sämtliche
inländischen Sektoren und das Ausland. Erfasst sind Kredite und
Schuldverschreibungen; Vermögenswerte werden nicht abgezogen und Forderungen
innerhalb des nichtfinanziellen Unternehmenssektors nicht konsolidiert.
Kredite sind nominal bewertet, Schuldverschreibungen grundsätzlich zum
Marktwert. Für US-Schuldverschreibungen gilt der Nennwert als Ausnahme.

## Quellen und Abdeckung

- [BIS Total credit](https://data.bis.org/topics/TOTAL_CREDIT)
- [Offizielles Downloadverzeichnis](https://data.bis.org/bulkdownload)
- [Festes ZIP der Total-credit-Reihen](https://data.bis.org/static/bulk/WS_TC_csv_flat.zip)
- [Methodik und Länderhinweise, 15. Juni 2026](https://www.bis.org/statistics/totcredit/credpriv_doc.pdf)

Aus 187.215 Daten-/Metadatenzeilen werden 96 Teilreihen und 14.118 numerische
Quartalsbeobachtungen ausgewählt. Filter: H/N als Schuldner, sämtliche
Kreditgeber, Marktwertkonvention, Prozent des BIP, um Quellenbrüche angepasste
Reihen. 48 Profile enthalten 43 Länder/Wirtschaftsgebiete, den Euroraum und
vier zusätzliche BIS-Schuldengruppen. Der geprüfte Stand endet in 2025-Q4.

| Gebiet | Erste verfügbare H/N-Beobachtung |
| --- | --- |
| Deutschland | 1970-Q4 |
| USA | 1947-Q4 |
| Indien | 2007-Q2 |
| China | 2006-Q1 |
| Südafrika | 2008-Q1 |

Einzelne Länder haben unterschiedliche Anfangsquartale für Haushalte und
Unternehmen. Das Diagramm ergänzt keine fehlenden Gegenstücke. Alle 48
Zuordnungen und die genauen Zeiträume je Teilreihe stehen im
[unabhängigen Quellenabgleich](evidence/debt-source-audit.json).

Die neuen IDs `bis:debt_g20`, `bis:debt_advanced`, `bis:debt_emerging` und
`bis:debt_reporting` bewahren die jeweiligen BIS-Abgrenzungen. Das Gebiet
„Alle berichtenden Volkswirtschaften“ ist kein vollständiges Weltaggregat.
Die Definitionen werden nicht mit BIS-Immobiliengruppen, UN-Regionen oder
anderen Anbietern gleichgesetzt. Welt und Afrika besitzen hier kein eigenes
Profil; von Afrika ist das verfügbare Südafrika-Profil direkt erreichbar.
Der Gesamtkatalog enthält nun 353 Gebiete, weiterhin 253 Themen.

## Historische Grenzen

Die BIS passt historische Quellenbrüche rechnerisch an und hat teilweise
Jahresdaten auf Quartale verteilt. Der Download enthält den heutigen,
revidierten Stand. Er ist keine Datenbank früherer Veröffentlichungsstände.

Deutschlands Teilreihen vor 1991 beruhen auf nachträglichen Schätzungen der
Bundesbank, deren Qualität unter der regulären Finanzierungsrechnung liegt.
Die frühe indische Haushaltsreihe verwendet persönliche Bankkredite,
die Unternehmensreihe inländische und grenzüberschreitende Bankkredite.
Ab 2011-Q4 dienen jährliche Finanzierungsrechnungen als Grundlage; Zwischen-
und jüngste Randquartale werden von der Quelle geschätzt. Diese Hinweise und
die US-Bewertungsausnahme erscheinen beim betroffenen Ländervergleich.
Die Definitionstabelle wurde im Originalbericht gelesen. Die deutschen und
indischen Länderhinweise wurden zusätzlich in der originalen PDF-Darstellung
geprüft.

## Technischer Vertrag

`debt_source.rs` akzeptiert nur den festen HTTPS-Download ohne Redirects,
höchstens 8 MiB ZIP und 100 MiB entpacktes CSV. Header, Dimensionen,
Originalbezeichnungen einschließlich abweichender Aggregat-Titel,
Zeiträume, Status, Einheiten und Duplikate werden geprüft. Metadaten geben
eine Nachkommastelle vor, für Kolumbien drei; die Originalwerte bleiben
unverändert. Eine geänderte Quellenstruktur verlangt eine erneute Prüfung.

Atlasmigration `0016` legt zwei Tabellen im separaten öffentlichen Cache an.
Alle Profile und ihre Herkunft werden gemeinsam ausgetauscht. Fehler lassen
den bisherigen Stand bestehen. Die globale Abrufsperre und 24 Stunden
Mindestabstand gelten. `get_atlas_debt` und `sync_atlas_debt` sind über die
zentrale Command-Fassade registriert. Der Browser zeigt einen ehrlichen
Desktop-Hinweis und erfindet keine Daten.

Vergleichslinien teilen Zeitachse und Maßstab und benötigen denselben
Quellenhash und Abrufzeitpunkt. Ein fehlendes Zwischenquartal unterbricht
die Linie. Vorjahresdifferenzen benötigen fünf aufeinanderfolgende
Beobachtungen ohne Quellenbruch innerhalb der vier Abstände. Null bleibt
eine echte Beobachtung. Die Anwendung glättet oder interpoliert nicht.

Zahlen sind standardmäßig ausgeblendet. `debtMode` und `debtSince` bleiben
in URL, letzter Ansicht und Notizkontext erhalten. Herkunft und festes
Diagramm-PNG werden mit gemerkten Ansichten gespeichert. Die Quellenübersicht
prüft vier Perspektiven pro Gebiet, jeweils anhand tatsächlich verfügbarer
Werte.

## Prüfung

Der unabhängige Python-/Decimal-Abgleich bestätigt alle 14.118 nativen Werte,
Flags, Originalbezeichnungen und Dezimaldefinitionen. Drei Rust-Prüfungen
decken Parserabweichungen, Fehlwerte/Nullen/Brüche, Upgrade von Migration 15,
Rollback, Abrufsperre, echte BIS-Übertragung und Offline-Wiederöffnung ab.
Die Atlas-Frontend-Suite besteht mit 202 Tests in 31 Dateien.

Weitere Abnahmen und ihre Grenzen werden im
[Prüfbericht](evidence/debt-readiness.json) festgehalten. Der Gesamtauftrag
bleibt in Arbeit; diese zwei Schuldenthemen schließen ihn nicht ab.
