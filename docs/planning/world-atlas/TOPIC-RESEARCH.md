# Themeneinstiege mit Quellenprüfung

Stand: 10. September 2026, nach der Findex- und UN-SDG-Anbindung. Von den zunächst
55 Quellen-Einstiegen erhielten drei eigene [Findex-Bilder](FINANCIAL-INCLUSION.md)
und zwölf weitere direkte [UN-SDG-Perspektiven](SDG.md). Die verbleibenden
40 Themen haben einen eigenen Einstieg mit Bedeutung, recherchierter Primärquelle
und konkreter Datengrenze. Diese Quellenbefunde allein sind keine numerische
Datenanbindung. Die ursprünglichen UI-Prüfungen bleiben unten datiert abgegrenzt.

## Umfang

Der reproduzierbare Routentest untersucht alle 255 Themen in 24 Gruppen und
die möglichen Datenperspektiven über alle 365 Kataloggebiete:

| Art des Einstiegs                 | Themen | Aussage                                                                                                              |
| --------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------- |
| Numerische Perspektive zugeordnet |    195 | Mindestens ein Datenpfad existiert; das belegt keine vollständige Länderabdeckung oder bereits lokal geladene Werte. |
| Bisheriger Kontext-Einstieg       |     14 | 29 Verknüpfungen zu bereits implementierten Bildern.                                                                 |
| Verbleibender Quellen-Einstieg    |     40 | Bedeutung, konkrete Recherche und Grenzen; 14 dieser Themen bieten insgesamt 17 ergänzende WDI-Verknüpfungen.        |
| Theorieansicht                    |      6 | Erklärende Modelle, keine gemessenen historischen Zyklen.                                                            |
| Ohne zugeordneten Einstieg        |      0 | Kein Thema fällt mehr auf einen allgemeinen Katalogplatzhalter zurück.                                               |

Zusammen bestehen 54 Kontext-/Quellen-Einstiege mit 46 Verknüpfungen.
Die 26 verbleibenden Einstiege ohne ergänzendes Bild zeigen keine Ersatzkurve.
Alle 40 Quellen-Einstiege bleiben numerisch **noch nicht angebunden**. Die
Zahl recherchierter Themen erhöht weder die lokale Datenabdeckung noch die
Zahl implementierter Quellenfamilien.

Die vollständigen Themen-IDs, Gruppen, Quellenverweise, Zielparameter und
Quelltextprüfsummen stehen im [Routingbericht](evidence/topic-route-audit.json).

## Bedienung und Quellen

Ein Thema lässt sich über seine Gruppe, die Themensuche oder **Daten & Quellen**
öffnen. Der Einstieg erklärt kurz die gewünschte Perspektive und den heutigen
Stand. **Quellenprüfung und offene Datenfragen** ist zunächst geschlossen und
per Tastatur bedienbar. Dort stehen datierte Hinweise und benannte Links zu
27 Primärquellen. Das Öffnen eines Einstiegs ruft diese Webseiten nicht ab.
Ein Quellenlink öffnet erst auf ausdrücklichen Klick den Browser; ein gescheiterter
nativer Aufruf zeigt eine verständliche Meldung.

Ergänzende Karten öffnen konkrete vorhandene WDI-Messgrößen. Land, Vergleich,
Zahlenmodus und Rückweg bleiben erhalten. Beispielsweise führt **Öffentliche
Versorgung** zu Stromzugang, Trinkwasser und Sanitärversorgung; diese Daten
behaupten keine staatliche Trägerschaft sämtlicher Anbieter. **Armut** besitzt
inzwischen eigene UN-SDG-Armutsquoten; Ungleichheit bleibt eine andere Messgröße.

Die Recherche trennt verschiedene Grenzen:

- **Daten vorhanden, Übernahme offen:** etwa BIS-Schuldendienst oder der
  IEA-Explorer für Elektromobilität.
  Definitionsprüfung, Länderzuordnung und ein validierter Import fehlen noch.
- **Kosten oder Zugriff:** Die detaillierte IFR-Robotikhistorie ist ein
  Bezahlprodukt. IEA-Datenangebote können freie und zusätzliche Premiumteile
  enthalten. Die IMF-AREAER-Datenbank verlangt einen gesonderten Zugang.
  Daraus entsteht keine zusätzliche verpflichtende Bezahlabhängigkeit.
- **Unterschiedliche Definitionen:** etwa Gewerbeimmobilien und öffentliche
  Versorgung. Eine bekannte
  Quelle ersetzt keine fachlich vergleichbare Zeitreihe.
- **Begrenzte Recherchebelege:** Die offiziellen ILO-Arbeitszeit- und
  ITF-Dashboard-Einstiege waren über den Suchindex auffindbar; direkte Abrufe
  gelangen nicht. Der frühere IEA-Speichereinstieg leitet auf einen Strombericht
  weiter. Die WIPO-Quantenquelle ist ein Suchbeispiel in Schulungsfolien.
  Diese Grenzen stehen auch im Produkt.

Der Quellenstand ist keine automatische Aktualitätsprüfung und keine Zusage,
dass jede Quelle für jedes ausgewählte Land eine lange Datenhistorie liefert.
Weder Produktionswachstum noch Patentaktivität werden als finanzielle Unter-
oder Überbewertung dargestellt.

## Integration und Prüfungen

`atlas-topic-research.ts` hält die verbleibenden Quellen und 40 Themenbefunde;
bereits numerisch angebundene SDG-Themen werden vor dem Export herausgefiltert.
`atlas-context-guides.ts` verwendet die vorhandenen Navigationsziele;
`atlas-context-panel.tsx` zeigt Befund, optionale Kontextkarten und Quellen.
`atlas-coverage-panel.tsx` erklärt den recherchierten Stand bei unverändertem
numerischen Verfügbarkeitsstatus. `fromGuide` ist bereits in Frontend und Rust
zugelassen; es gibt keine neue Migration oder Command-Schnittstelle.

Historischer Prüfstand der ursprünglichen 55 Quellen-Einstiege vor Findex:

- 261 Atlas-Frontendtests in 37 Dateien bestanden. Neue Fälle prüfen die
  vollständigen Katalogrouten, unveränderte Fehlwertabdeckung, konkrete Quellen,
  Indien/China-Rückwege, Robotik aus der Quellenübersicht und Fehler beim
  nativen Öffnen eines Quellenlinks.
- Typecheck, gezieltes ESLint und Produktionsbuild bestanden. Der bekannte
  Vite-Hinweis auf große Chunks bleibt bestehen.
- Browserprüfung mit der unveränderten Produktseite und dem normalen
  Browseradapter: Deutschland/USA und Indien/China bleiben bei Thema, Kontextbild
  und Rückweg erhalten. Robotik bleibt in der Abdeckung ohne numerische
  Anbindung. Quellen lassen sich per Tastatur öffnen. Bei 1024 und 1440 Pixeln
  entsteht kein horizontaler Überlauf; keine Browserwarnungen oder -fehler.
- Der Browseradapter zeigt bei fehlenden nativen Statistiken den tatsächlichen
  Desktop-Hinweis. Für diese Prüfung wurden keine Werte oder Diagramme ersetzt.

Die ursprüngliche UI-Erweiterung veränderte keinen nativen Datenpfad. Die vorherigen nativen
Notizprüfungen für 14 Einstiege gelten weiterhin nur für ihren dokumentierten
Umfang. Die 55 neuen Einstiege wurden nicht pauschal als neu nativ geprüft
ausgewiesen. Spätere Abnahmen stehen im [Bericht vom 9. September](COMPLETION-AUDIT.md)
und in der [Quellen-Erweiterung vom 10. September](EXPANSION-QA-2026-09-10.md).

Aus `apps/desktop` lässt sich der Routentest ohne Netzwerk erneut ausführen:

```powershell
node scripts/audit-atlas-topic-routes.mjs
```

[Prüfprotokoll](evidence/topic-research-readiness.json),
[bisherige Kontext-Einstiege](CONTEXT-GUIDES.md),
[Datenabdeckung](COVERAGE.md), [Gesamtstand](IMPLEMENTATION-STATUS.md).

## Nächste Datenarbeit

Findex und die geprüften SDG-Ausschnitte sind inzwischen angebunden. Weitere kostenlose, klar abgegrenzte
Kandidaten sind BIS-Schuldendienst und historische IEA-Elektromobilität.
Jede Übernahme benötigt einen eigenen Quellenabgleich und geprüfte Länder- und
Zeitgrenzen. Erst ein funktionierender Datenpfad darf ein Quellen-Thema in der
numerischen Abdeckung aufwerten. Die Datenarbeit an den verbleibenden 40 Themen
ist damit noch nicht abgeschlossen.
