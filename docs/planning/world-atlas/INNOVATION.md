# Technologiebilder mit WIPO

Stand: 9. September 2026. Dieser Baustein ergänzt die offene Atlas-Gesamtaufgabe.

Die Ansicht zeigt langfristige Patentaktivität nach Herkunftsland. 35
Technologiefelder und der eigene Quellenbereich „Unknown“ sind in sieben
überschaubare Gruppen mit höchstens sechs Bildern gegliedert. Deutschland,
USA, Indien und China gehören zu den 199 zugeordneten heutigen Ländern und
Gebieten. Zahlen bleiben optional; zwei Länder verwenden für dasselbe
Fachgebiet dieselbe lineare Skala ab Null und denselben Jahreskalender.

## Aussage und Grenzen

- Quelle: **WIPO Statistics Database**, Ausgabe **Mai 2026**, Auswahl
  **4a – Patent publications by technology**, **Total count by applicant's
  origin**. Die Herkunft richtet sich nach dem Wohnsitz des zuerst genannten
  Anmeldenden, nicht nach Patentamt, Erfinder-Nationalität oder Absatzmarkt.
- Es handelt sich um veröffentlichte Patentanmeldungen. Erteilungen,
  Patentfamilien, einzigartige Erfindungen, Erfindungsqualität und
  Unternehmensbewertung sind andere Begriffe und werden daraus nicht abgeleitet.
- Die WIPO ordnet Technikfelder über Patentklassen zu und verwendet bei
  Mehrfachzuordnung anteilige Zählung. Der geprüfte Export liefert gerundete
  Integer. „Total“ wird unverändert übernommen, nicht aus Ämtern nachgerechnet.
  Wiederholte Schutzanmeldungen können mehrfach vorkommen.
- Der Export bietet Quellenjahre **1980–2024**, je nach Land und Feld mit
  deutlichen Lücken. Die Standardansicht endet **2023**. Der WIPO-Bericht 2025
  nennt für Technologieauswertungen 2023 als jüngstes vollständiges Jahr und
  erläutert den Veröffentlichungsverzug. **2024 ist eine redaktionelle
  Randjahr-Markierung**, kein vom Anbieter gelieferter Vorläufigkeitsstatus je
  Datenpunkt. Das Jahr ist optional, hohl und ohne Anschlusslinie dargestellt.
- Leere Felder können fehlende Meldungen oder keine Aktivität bedeuten. Sie
  bleiben deshalb `null`. Die App schätzt keine Nullen oder Zwischenjahre.
  Linien verbinden nur benachbarte vorhandene Jahre vor dem Randjahr; sie sind
  ungesmoothete Verbindungslinien und kein Beleg kontinuierlicher Aktivität.
- Jedes Fachgebiet hat eine eigene Skala. Höhen zwischen verschiedenen
  Fachgebieten dürfen nicht wie absolute Größen verglichen werden. Es gibt
  keine Bereinigung je Einwohner, keine künstliche Sinuswelle und keinen
  daraus abgeleiteten Über-/Unterbewertungsscore.
- Die sieben Gruppen sind eine UI-Ordnung, nicht die fünf offiziellen
  übergeordneten WIPO-Sektoren. Beispielsweise bedeutet „Electrical machinery,
  apparatus, energy“ weder speziell Solarenergie noch Kernenergie oder Wasserstoff.

Primärquellen:
[WIPO-Daten und Download](https://www.wipo.int/en/web/ip-statistics),
[Definitionen und Bedingungen](https://www.wipo.int/en/web/ip-statistics/about),
[WIPI 2025: Patents highlights](https://www.wipo.int/web-publications/world-intellectual-property-indicators-2025-highlights/en/patents-highlights.html).

## Datenabruf und Speicherung

`innovation_source.rs` verwendet den öffentlichen CSV-Export der WIPO-Webapp.
Der feste Host lautet `api.ipstatsdc.deda.prd.web1.wipo.int`, Pfad
`/api/v1/public/ips-search/downloadCsv`. Parameter sind `selectedTab=patent`,
`indicator=17`, `reportType=13`, Jahre 1980–2024, alle 207 geprüften
Herkunftscodes und Technologiefelder 0–35. Die exakte URL steht im gemeinsamen
`innovation-catalog.json`. Der vom öffentlichen Client verlangte Header
`Accept-Language: en` ist erforderlich. Es werden kein Konto, API-Schlüssel,
Cookie und keine persönlichen Journalinformationen übertragen.

Vor und nach dem CSV-Abruf prüft die App den öffentlichen Metadaten-Endpunkt
`/api/v1/public/ips-search/en/last-updated`. Die Antwort muss zur geprüften
Ausgabe passen. Der Download verwendet Rustls, verbietet Weiterleitungen,
begrenzt Antwortgröße und Laufzeit und prüft anschließend Bytezahl, SHA-256,
Header, Herkunftsbezeichnungen, Feldnamen, Jahresachsen, numerische Werte,
Doppelzeilen und Vollständigkeit des geprüften Bestands. Fehler erhalten den
vorherigen Cache. Änderungen des Liveexports erfordern eine neue Prüfung des
Katalogs; sie werden nicht stillschweigend als derselbe Datenstand übernommen.

Der geprüfte CSV-Export hat **1.285.013 Bytes**, **5.645 Datenzeilen** und den
SHA-256-Wert
`c7e93cd7ad4b9305190f5cb72c899ef854771209794c3025621859c94de84f48`.
Die Datenzeilen besitzen genau eine zusätzliche leere Endspalte gegenüber dem
Header. Alle `Office`-Felder lauten `Total`. Von 205 gelieferten Ursprüngen
bleiben sechs historische Staaten außerhalb der heutigen Länderprofile:
`AN`, `CS`, `DD`, `SU`, `YU`, `ZR`. Sie werden keinem Nachfolgestaat
zugeschlagen. Die angefragten Ursprünge `NU` und `TL` fehlen im Export. Welt-
und Kontinentaggregate werden nicht erfunden.

Die 199 heutigen Profile enthalten **108.696 Originalzahlen** und **213.684
fehlende Feldjahre**. Zahlen werden als sichere Integer gespeichert und
übertragen. Atlasmigration **0018** ergänzt zwei Tabellen im separaten
öffentlichen Cache. Ein Transaktionswechsel ersetzt Profile und Herkunft
gemeinsam. Die globale Abrufsperre und 24 Stunden Mindestabstand gelten.

Der ältere offizielle Bulk-ZIP enthält nur 2000–2022 und ist **kein
Laufzeit-Fallback**. Rohdaten bleiben im lokalen Cache beziehungsweise in der
ignorierten Prüfablage. Das Repository enthält Quellenidentitäten,
Definitionen und aggregierte Prüfnachweise, keine Kopie des WIPO-Zahlenbestands.

## Integration und Prüfung

Der Bereich ist über Patente sowie passende Technik-, Medizin- und
Industriethemen erreichbar. Bestehende WHO-, WDI- und Marktansichten bleiben
über die Quellenwahl erreichbar. Die Abdeckungsansicht öffnet einzelne
Fachgebiete konkret. Sie bewertet die Standardansicht bis 2023; ein nur für
2024 vorhandener Wert erzeugt keinen falschen Verfügbarkeitsstatus.

Gemerkte Ansichten speichern `perspective=innovation`, `innovationGroup`,
`innovationMetric`, `innovationSince` und `innovationThrough` sowie Herkunft
`wipo`, Ausgabe, Rezept und Hash. Der reine Browseradapter meldet
`desktop_required` und erfindet keine geladenen Daten.

Reproduzierbare Prüfungen:

- `evidence/audit_innovation_source.py` liest den Originalexport unabhängig
  mit Python CSV, prüft alle Identitäten und erzeugt den Katalog ohne Rohzahlen.
- `evidence/check_innovation_native.py --phase original` vergleicht alle
  Rust-/SQLite-Antworten exakt mit diesem Original. Alle **108.696 Zahlen**
  und **213.684 Fehlwerte** stimmen überein.
- `innovation_tests.rs` prüft Zahlen, CSV-Schema, Duplikate, historische
  Ursprünge, Upgrade aus Migration 0017, atomaren Rollback, Offline-Wiederöffnung
  und Abrufsperren. Der ausdrücklich gestartete Originaldateitest prüft alle
  199 Profile durch Speichern und Wiederöffnen.
- `atlas-innovation.test.tsx` prüft Quellenidentitäten, Lücken und Null,
  gemeinsamen Maßstab, Randjahr, Navigation, Quellenmetadaten, Abdeckung und
  ehrlichen Browserstatus. Die vollständige Atlas-Frontend-Suite besteht mit
  **237 Tests in 34 Dateien**.

Die echte Tauri-Prüfung und ein vollständiger Prozessneustart bestehen im
isolierten Profil `com.personal-macro.atlas-innovation-20260909`: 201 Antworten,
Notiz und PNG bleiben unverändert; beim Neustart erfolgt kein Download.
Die CUA-Sichtprüfung bei 1024/1440 Pixeln umfasst Deutschland/USA, Indien/China,
Tastatur, Detailansicht, Randjahr, Zahlen, gemeinsame Skala, fehlende Weltprofile,
Quellenabdeckung und Rückkehr aus WDI und WHO. Details stehen in
`evidence/innovation-readiness.json`.
Eine Browserprüfung ersetzt keine vollständige native Klickabnahme.
