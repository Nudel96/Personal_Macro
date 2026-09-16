# Bioenergie, Wärmepumpen und Fernwärme

Geprüft am 11. September 2026. Drei kostenlose Eurostat-Pakete ergänzen sechs
Perspektiven im öffentlichen Atlas-Cache. Keine Anmeldung und kein API-Schlüssel.

| Thema | Originalauswahl | Gespeicherter Umfang | Bedeutung |
|---|---|---|---|
| Bioenergie | `nrg_cb_rw`, `IPRD`, `TJ`, `R5110-5150_W6000RI` / `R5300` | 42 Quellengebiete, 84 Profile, 2.307 Zahlen, 1990–2025 | Primärerzeugung fester Biobrennstoffe und von Biogas; kein Verbrauch oder Stromertrag |
| Wärmepumpen | `nrg_inf_hptc`, `CAP_HEAT`, `MW`, `ATH` / `GTH` / `HTH` | 42 Quellengebiete, 126 Profile, 803 Zahlen, 2004–2024 | Installierte maximale Wärmeleistung am Jahresende; Luft-, Erd- und Wasserwärme getrennt |
| Fernwärme | `ilc_lvhe02`, `DHEAT`, `TOTAL` für Haushaltszusammensetzung und Siedlungsart, `PC` | 32 Quellengebiete, 32 Zahlen, ausschließlich 2023 | Anteil von Personen in Privathaushalten mit Fernwärmeheizung; einzelne Befragungspunkte |

Gebiete und Profile ohne eindeutig bezifferte Beobachtung bleiben erkennbar.
Die 42 Profile umfassen das originale EU27-Aggregat und 41 Länder; die
Fernwärmeauswahl umfasst EU27 und 31 Länder. Eurozonenaggregate EA20/EA21
werden bewusst ausgelassen. Es gibt keine erfundenen Welt- oder Afrikawerte.
`EL`, `UK`, `XK` und sämtliche anderen Kennungen sind ausdrücklich zugeordnet.

## Quellen-Nullen und Zeitgrenzen

Die [Eurostat-Energiebilanz-Metadaten, Abschnitt 4](https://ec.europa.eu/eurostat/cache/metadata/en/nrg_cb_esms.htm)
erläutern, dass jährliche Fragebögen echte Null, vernachlässigbar kleine Mengen,
fehlende und vertrauliche Angaben nicht zuverlässig trennen. Solche Quellen-Nullen
werden deshalb **nicht als numerischer Nullpunkt gezeichnet**. Der ursprüngliche
Marker bleibt mit Erklärung in den gespeicherten Punkten und in „Quelle und
Bedeutung → Quellenkennzeichen zu fehlenden Werten“ erhalten, auch bei
ausgeschalteten Zahlen. Das gilt zurückhaltend auch für den Wärmepumpenbestand
aus demselben jährlichen Erneuerbaren-Fragebogen. Die Haushaltsbefragung ist ein
anderes Erhebungssystem: dort bleiben veröffentlichte Nullanteile Zahlen.

Bioenergie enthält 455 solcher Quellen-Nullen plus 262 echte Leerzellen.
Wärmepumpen enthalten 1.708 Quellen-Nullen plus 135 Leerzellen. Kein fehlender
Wert wird zwischen den benachbarten Jahren ergänzt. Originale `p`-/`e`-Kennzeichen
bleiben zusätzlich erhalten. Der native Import verwirft unbekannte Flags.

Der [Wärmepumpen-Quellenbericht](https://ec.europa.eu/eurostat/cache/metadata/en/nrg_inf_hptc_esms.htm)
nennt Datenmeldungen ab 2004 beziehungsweise 2017. Der aktuelle API-Export enthält
trotzdem Werte ab 1990, darunter 93 nicht-nullige frühe Werte für die ausgewählten
Gebiete. Diese Diskrepanz ist nicht geklärt. Die Produktansicht beginnt deshalb
ausdrücklich 2004; 1.524 frühe Zahlen und 240 leere Zellen bleiben ausgeschlossen.
Eine scheinbar vollständig gemessene Historie seit 1990 wird nicht behauptet.

## Fachliche Grenzen

- Wärmeleistung in MW ist weder elektrische Leistung noch eine Menge in MWh.
  Die drei Technologien werden nicht mit überlappenden Untergruppen summiert.
- Bioenergie enthält hier zwei Brennstoffgruppen. Flüssige Biokraftstoffe liefern
  in der geprüften Auswahl keine Werte und werden nicht durch andere Mengen
  ersetzt. Erzeugung misst weder Unternehmensumsatz noch Klimaneutralität.
- Fernwärme ist [EU-SILC](https://ec.europa.eu/eurostat/cache/metadata/en/ilc_sieusilc.htm),
  eine personengewichtete Haushaltsbefragung. Gemeinsame Einrichtungen sind
  grundsätzlich ausgeschlossen. Frankreich ohne Mayotte, Zypern nur
  regierungskontrolliertes Gebiet, Niederlande ohne Übersee und Norwegen ohne
  Spitzbergen bleiben erläutert. Der Anteil ist keine Gebäudequote oder
  Fernwärme-Energiemenge. Keine Verlaufslinie zwischen erfundenen Erhebungen.
  Die Bildskala bleibt fest bei 0–100 Prozent, auch bei einem einzelnen Punkt.
- Nationale Erhebungsmethoden, Quellenrevisionen und unvollständige Meldungen
  können Vergleiche einschränken. Herkunft und Einheit bleiben im Bild sichtbar.

## Nachweise und Umsetzung

`evidence/build_public_energy.py` prüft alle Originalzellen unabhängig vom
nativen Positionsdecoder. `evidence/public-energy-audit.json` enthält Hashes,
Gebietsidentitäten, Ausschlusszählungen, Dimensionen, Flags und Definitionen.
`public-energy-contract.json` bindet den nativen Adapter `public_energy.rs`
an genau diese Ausgabe. Ein neuer Datenstand benötigt erneute Quellenprüfung.

Der gemeinsame Import prüft Dateihash, Umfang und Geografie vor dem atomaren
Wechsel; 24 Stunden Abrufabstand und globale Atlas-Sperre gelten. Die Windows-
Verbindung verwendet Schannel mit aktiver Zertifikatsprüfung wie die anderen
Eurostat-Pakete. Browseransichten zeigen keine erfundenen lokalen Werte.

Originaltests vergleichen sämtliche 242 Profile einschließlich Quellen-Nullen,
Lücken und Flags mit dem Python-Audit und erneut nach SQLite-Schließen/Öffnen.
Falsche Einheiten, Jahre, Nenner, unbekannte Flags, negative Energiemengen und
unbekannte Zellpositionen werden abgewiesen. Deutschland 2023: Fernwärme 13,7 %;
Dänemark 64,9 %. Deutschland 2024: Luftwärme 12.631,983 MW, Erdwärme 3.268,329 MW,
Wasserwärme 640,619 MW. Diese direkten Quellenanker bleiben ungeglättet.
