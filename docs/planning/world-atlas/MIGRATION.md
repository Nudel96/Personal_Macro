# Weltatlas – Migration

Stand: 9. September 2026. Drei zusätzliche Bilder unter **Menschen
→ Demografie → Zu- und Abwanderung** verwenden den vorhandenen kostenlosen WDI-Adapter.
Sie benötigen keinen weiteren Anbieter, Schlüssel oder kostenpflichtigen Dienst.
Der statistische Katalog enthält damit 91 Reihen, darunter 81 ergänzend kuratierte
Zuordnungen. Alle bisherigen 88 Reihen und 349 Gebietsdefinitionen bleiben erhalten.

## Drei unterschiedliche Bilder

| Bild                                          | WDI-Code         | Gebiete mit Werten | Geprüfte Quellenjahre | Aussage                                                                                                    |
| --------------------------------------------- | ---------------- | -----------------: | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Zu- minus Abwanderung                         | `SM.POP.NETM`    |                217 | 1960–2023             | Jährlicher geschätzter Saldo über Landesgrenzen; negative Werte bedeuten mehr Abwanderung als Zuwanderung. |
| Internationale Migranten · Bestand            | `SM.POP.TOTL`    |                215 | 1990–2024             | Geschätzte Zahl internationaler Migranten zur Jahresmitte.                                                 |
| Internationale Migranten · Bevölkerungsanteil | `SM.POP.TOTL.ZS` |                216 | 1990–2024             | Veröffentlichter Anteil mit der UN-Bevölkerungsgrundlage als Nenner.                                       |

Gebiete meint ausdrücklich zugeordnete WDI-Länder/Wirtschaftsgebiete und den
veröffentlichten Weltwert. Andere WDI-Regionen werden nicht auf UN- oder
Atlasregionen umgedeutet. Das WDI-Sammelgebiet Kanalinseln bleibt unzugeordnet.
Kosovo hat in diesem Stand keinen Migrantenbestand oder Anteil. Für St. Martin
liegt ein Anteil, aber keine absolute Bestandsreihe vor. Aus dem Anteil wird
deshalb keine fehlende Personenanzahl berechnet.

Deutschland, USA, Indien, China, Nigeria, Südafrika, Brasilien und Japan haben
jeweils 64 jährliche Salden und acht Bestands-/Anteilsbeobachtungen. Die
Bestandsjahre sind 1990, 1995, 2000, 2005, 2010, 2015, 2020 und 2024. Zwischen
diesen Punkten wird keine jährliche Linie oder geglättete Welle erfunden.
Ein Vergleich verwendet denselben Quellenstand, gemeinsame Jahre und denselben
Maßstab; Personenanzahl und Prozentanteil bleiben getrennte Perspektiven.

## Quellenbedeutung und zeitliche Grenze

Der Saldo ist keine Summe aller Zu- und Abwanderungen. Er beruht je Land auf
unterschiedlich belastbaren Statistiken und Schätzungen, teilweise auf
demografischen Restrechnungen. Ein Weltwert von null bedeutet keinen Stillstand
internationaler Migration. Die aktuelle WDI-Ausgabe beschreibt Jahreswerte;
ältere Veröffentlichungen desselben Codes dürfen nicht ohne Periodenprüfung
angehängt werden. [WDI-Definition](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SM.POP.NETM).

Die aktuelle WDI-Grundlage nennt **World Population Prospects**. WPP 2024 trennt
historische Schätzungen 1950–2023 von Projektionen 2024–2100. Der Atlas begrenzt
den jährlichen Saldo daher fest mit `throughYear: 2023`; diese Grenze gilt beim
Download und Cache-Lesen unabhängig vom späteren Kalenderjahr. Die im WDI-Abruf
mitgelieferten Salden 2024 und 2025 werden nicht als Geschichte dargestellt.
[UNdata: WPP-Veröffentlichungsstand](https://data.un.org/datamartinfo.aspx).

Die Bestandsreihen kommen aus **International Migrant Stock** und werden
gesondert bis 2024 zugelassen. Die UN verwendet vor allem Geburtslanddaten;
fehlen diese, können Staatsangehörigkeit und Schätzungen einspringen. Flüchtlinge
sind enthalten. Grenzänderungen oder Staatenauflösungen können die Einordnung
als internationaler Migrant verändern, ohne dass jemand umgezogen ist. Die
Bestandsänderung ist daher nicht mit dem jährlichen Saldo gleichzusetzen.
[WDI-Bestandsdefinition](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SM.POP.TOTL).

Die veröffentlichte Quote verwendet UN-Bevölkerungszahlen, die von der separaten
WDI-Bevölkerungsreihe abweichen können. Sie wird unverändert übernommen und
nicht aus zwei anderen Atlasreihen neu berechnet. Ein gerundeter Nullanteil
kann gleichzeitig mit positivem Bestand auftreten, etwa für China 1990. Auch
der WDI-Weltwert kann vom UN-Gesamtwert abweichen, weil die erfassten Gebiete
nicht genau übereinstimmen. [WDI-Anteilsdefinition](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SM.POP.TOTL.ZS).

Alle drei Bilder heißen Modellschätzungen. Sie beschreiben demografischen
Kontext und liefern keine Unter-/Überbewertung eines Marktes, eines Landes
oder einer Bevölkerungsgruppe.

## Reproduzierbarer Abgleich

Die unabhängige Vorbereitung lädt die vollständigen, zeitlich begrenzten
WDI-Seiten und die dazugehörigen Einzelmetadaten sowie das Gebietsverzeichnis.
Frühere unbeschränkte Forschungsstichproben werden nicht als freigegebene
Importdateien verwendet. SHA-256, Seitenfolge, Quellenidentität, Providerlabel,
Kalender und sämtliche Null-/Fehlwerte werden geprüft.

Der Prüfhelfer [audit_migration.py](evidence/audit_migration.py) nutzt die
gemeinsame WDI-Vergleichsroutine mit drei festen Codes und ausschließlich dem
Testprofil `com.personal-macro.atlas-migration-20260909`. Ein angegebener Cache
wird nur lesend geöffnet. Der frühere Abgleich der 14 Wirtschaftskontextreihen
bestätigt nach der Wiederverwendung der Routine weiterhin alle 80.438 Werte
exakt; seine historischen Belege bleiben unverändert.

Der echte native Sammelabruf hat alle drei Reihen übernommen. Alle 17.336
numerischen Werte stimmen als Dezimalwerte exakt mit den Originalseiten überein.
24.762 fehlende Jahreswerte, 282 echte Nullen, 7.745 negative Salden und sämtliche
42.098 Quellenkennzeichen bleiben erhalten. Alle Quellen-/Metadaten-/Gebietshashes
stimmen mit der nativen Provenienz überein.
[Vollständiger Quellenabgleich](evidence/migration-audit.json).

Nach echtem Prozessneustart liegen dieselben 27 Antworten für neun ausgewählte
Länder-/Weltgebiete ohne erneuten Download vor. Beide Antwortstände wurden
unabhängig gegen den Cache geprüft, insgesamt 3.492 Jahreszellen. Das feste
Diagrammbild bleibt bytegleich (96.809 Bytes).
[Neustartprüfung](evidence/migration-readiness.json).

Die ursprünglichen React-Komponenten wurden zusätzlich über CUA mit diesen
real abgerufenen öffentlichen Daten im Browser geprüft: Deutschland/USA,
Indien/China, Welt, getrennte Bestandsjahre, gemeinsame Skalen und optionale Zahlen.
Der veröffentlichte chinesische Nullanteil von 1990 bleibt in der optionalen
Tabelle null. Die Bedeutungserklärung ist per Tab erreichbar, der Fokus sichtbar,
und Enter öffnet/schließt sie. Die Browserkonsole enthält keine Warnungen oder
Fehler. Bei 1440 px entsteht keine Seitenüberbreite. Bei 1024 px bleibt die
bestehende Mindestbreite von 1024 px gegenüber 1015 px nutzbarer Breite mit
vertikaler Scrollbar erhalten; dieser schmale Unterschied wird nicht als
vollständig überlauffreies Layout ausgegeben.
[Katalog- und Sichtnachweis](evidence/migration-ui-catalog.json).

Alle 184 Atlas-Vitest-Fälle in 28 Dateien bestehen. Nach der abschließenden
Kennzeichnung als Modellschätzungen wurden die 44 betroffenen Seitenfälle
erneut erfolgreich geprüft. Typecheck, Produktionsbuild, gezieltes ESLint,
Prettier, die vier deterministischen WDI-Tests, der native Katalogtest,
Rust-Fmt und Clippy mit `-D warnings` bestehen. Zwei ausdrücklich externe
WDI-Tests bleiben im Standardlauf ignoriert; der reale weltweite Abruf ist
separat oben belegt. Die bekannten großen Vite-Chunks und informativen
MSVC-Linkermeldungen bleiben bestehen.

Die vollständige native Klickabnahme des Weltatlas bleibt eine eigene offene
Anforderung; der getrennte Prüfaufbau beansprucht sie nicht.

Der Atlas-Speicher initialisiert. Beim ersten Start wurden langsame, aber
erfolgreiche SQL-Schreibzugriffe für die letzte Atlasansicht, die Prüfergebnisse
und einen COT-Job protokolliert. Die bekannten Technicals- und
Zentralbank-Hintergrundwarnungen erscheinen beim Neustart weiterhin. Ein
vollständig warnungsfreier App-Hintergrundlauf wird damit nicht behauptet.

## Benachbarte Themen

Der am 9. September 2026 vollständig gelesene WDI-Source-2-Katalog enthält
1.498 Kennungen. Darunter wurde keine passende aktuelle Erwachsenenreihe zu
Arbeitsstunden, Lohnhöhe oder informeller Beschäftigung identifiziert.
Anteile abhängig Beschäftigter sind keine Lohnhöhe, Arbeitsstunden von Kindern
keine Arbeitsstunden Erwachsener und informelle Zahlungen keine informelle
Beschäftigung. Sie werden nicht als Ersatz angebunden.

Der direkte [ILOSTAT-Bulkzugang](https://ilostat.ilo.org/data/bulk/) antwortete
in der Prüfung mit HTTP 403. Die Themen benötigen eine gesonderte Prüfung
anderer offizieller Veröffentlichungswege. Das ist keine Behauptung, es gäbe
weltweit keine geeigneten Daten. Haushaltsgröße und weitere Demografiethemen
bleiben ebenfalls eigene Quellenarbeit.
