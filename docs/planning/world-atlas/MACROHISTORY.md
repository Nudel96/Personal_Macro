# Finanzgeschichte seit 1870

Die kostenlose JST Macrohistory Database R6 ergänzt den eigenständigen Atlas um
20 Perspektiven in sechs Gruppen. Die Navigation lautet **Lange Entwicklungen →
Jahrhundertperspektiven → Finanzgeschichte seit 1870**; der stabile Themenlink
verwendet `topic=long_history:financial_history`.

Die Quelle umfasst 18 Länder mit Kalenderzeilen von 1870 bis 2020. Einzelne
Messgrößen haben kürzere Reihen und Lücken. Deutschland und USA sind enthalten;
Indien, China und Welt besitzen hier kein eigenes Profil. Es werden keine
Länderwerte zu fehlenden Kontinenten oder Weltwerten gemittelt.

## Geordnete Bilder

| Gruppe | Perspektiven |
| --- | --- |
| Wirtschaft & Lebensbedingungen | Reale Wirtschaftsleistung je Einwohner, realer Konsum je Einwohner, Arbeitslosigkeit |
| Kredit & Staatsschulden | Staatsschulden, Bankkredite, Hypotheken, Unternehmensschulden |
| Banken & Finanzierung | Eigenkapitalquote, Kredite zu Einlagen, weitere Finanzierung |
| Preise & Kaufkraft | Reale Hauspreise, reale Löhne |
| Zinsen | Kurzfristige und langfristige Zinsen |
| Märkte & Erträge | Aktien-, Wohnimmobilien-, Staatsanleihen- und kurzfristige Renditen, Dividenden-Kurs- und Mietertrags-Preis-Verhältnis |

Eine Gruppe zeigt höchstens sechs kleine Bilder. Klick öffnet das einzelne große
Bild; Zeitraum, Preisbasis, Vergleichsland und Rückweg bleiben erhalten. Zahlen
einschließlich Tooltip und Tabelle sind optional. Krisenanfänge laut JST lassen
sich gesondert zuschalten; sie beschreiben weder Krisendauer noch den Wendepunkt
jeder Reihe. Der Finanzzyklus-Lernbereich verlinkt diese neue Datenperspektive.

Zwei Länder einer Karte teilen tatsächlichen Kalender, Einheit, Quellenstand und
Maßstab. Unterschiedliche Messgrößen haben eigene Skalen. Gleiche Indexhöhe
bedeutet keine gleichen absoluten Preise oder Wohlstandsniveaus. Lücken und
isolierte Beobachtungen bleiben sichtbar. Die speziellen Interpolationshinweise
der Quelle erzeugen offene Kreise ohne verbindende Linie. Auch Werte ohne
solchen Marker können historische Rekonstruktionen enthalten.

## Quelle und Ableitungen

Der [offizielle JST-Download](https://www.macrohistory.net/database/) war bei
der erneuten Prüfung am 9. September 2026 zugänglich. Der native Abruf folgt
ausschließlich der einen geprüften Weiterleitung vom offiziellen Download zur
zugehörigen veröffentlichten Jimcontent-Datei. Die frühere Zugriffslücke aus
der Zyklusprüfung ist damit für diesen festen R6-Stand behoben.

SHA-256: `c1bb91fe56ea50d4f27af5c0fc897d481e89ae38ce41eaecab62134c9354981d`.
Die Originaldatei ist 1.408.158 Byte groß und enthält 2.718 Länder-Jahreszeilen
in einem Blatt mit 59 Spalten. 53 numerische Quellfelder werden unverändert
mitgeführt. Die Datei wurde 2024 bereitgestellt; ihre Beobachtungen enden 2020.
Ein neues Download- oder Dateidatum erweitert diesen Zeitraum nicht.

Der gemeinsame Katalog bindet Herkunft, Gebiete, Originalspalten, Formeln,
Einheiten, Interpolationsfelder und deutsche Erklärungen in Rust und TypeScript.
Berechnungsrezept: `jst-r6-ratios-real-returns-v1`.

- `debtgdp`, `eq_dp` und `housing_rent_yd` sind Brüche; Anzeige in Prozent durch
  Multiplikation mit 100. `lev`, `ltd`, `noncore`, `stir`, `ltrate` und `unemp`
  liegen bereits in Prozent vor.
- Kreditbestände werden durch das nominale BIP desselben Quellenjahres geteilt.
  Der Nenner muss vorhanden und positiv sein. Historisch sehr kleine positive
  Werte werden nicht durch eine willkürliche Nullschwelle verworfen.
- Reale Hauspreise und Löhne: jeweiliger nominaler Index geteilt durch CPI,
  multipliziert mit 100; die gemeinsame Indexbasis ist 1990. Der Hauspreis-
  Interpolationshinweis stammt aus der zugehörigen Preisveränderungsreihe.
- Reale Jahresrendite: `((1 + r) × CPI_Vorjahr / CPI_Jahr − 1) × 100`.
  Beide positiven Preisindizes müssen in tatsächlichen Nachbarjahren vorliegen.
  Fehlendes Vorjahr erzeugt keinen Realwert. Nominalrenditen bleiben separat
  auswählbar; extreme Hyperinflationswerte, etwa Deutschland 1923, werden
  erhalten und können den Maßstab dominieren.
- `crisisJST` liefert 88 Krisenanfänge; `crisisJST_old` wird dafür nicht verwendet.
  Quellenmarker bleiben als Rohfelder erhalten. Ein fehlender Marker ist keine
  Garantie für eine direkt beobachtete statt rekonstruierte Zahl.

Die [Länderdokumentation](https://www.macrohistory.net/app/download/9834516169/JST_documentationR6.pdf?t=1676279836),
[R6-Renditeergänzung](https://www.macrohistory.net/app/download/9918957869/JST_RORE_Documentation_R6.pdf?t=1658254098)
und [Krisenchronologie](https://www.macrohistory.net/app/download/9844625569/JSTcrisis_chronology.pdf?t=1616702593)
beschreiben historische Ausgangsquellen. Die frühen deutschen Kreditdaten
umfassen teilweise Zwischenbankkredite und wechselnde Gebietsstände; frühere
Arbeitslosenquoten können nur Versicherte oder Gewerkschaftsmitglieder erfassen.
Die Datei liefert keine vollständige datierte Bruchliste je Messwert.

Die drei Arbeiten von Jordà, Schularick und Taylor (2017), Jordà, Knoll,
Kuvshinov, Schularick und Taylor (2019) und Jordà, Richter, Schularick und Taylor
(2021) werden in der Quellenansicht genannt. Es gelten die veröffentlichten
[Bedingungen CC BY-NC-SA 4.0](https://www.macrohistory.net/database/licence-terms/).
Eigene deutsche Erläuterungen und Rechenoperationen sind ausgewiesen.

## Lokale Integration und Prüfung

`get_atlas_macrohistory` liest den lokalen Stand. `sync_atlas_macrohistory`
verwendet die gemeinsame Atlas-Abrufsperre, 24 Stunden Mindestabstand und einen
begrenzten HTTPS-Download. Dateigröße, ZIP-Ausdehnung, Arbeitsblatt, Spalten,
Prüfsumme, ISO-/IFS-/Gebietsidentitäten, alle Kalenderjahre, binäre Marker und
endliche Zahlen werden vor der Übernahme geprüft. Die Arbeitsmappe wird weder
ausgeführt noch ins Dateisystem entpackt.

Atlasmigration **0013** ergänzt zwei Tabellen im öffentlichen Cache. Ein
vollständiger Quellenstand wird atomar ausgetauscht. Ein Fehler erhält den
bisherigen Stand; die Migration erhält bereits vorhandene Agrardaten. Alle
persönlichen Daten bleiben in ihrer getrennten Journal-Datenbank. Die fünf
`jst*`-Bildparameter und `jst`-Quellenreferenzen gehören zum Merkkontext; auch
Länderfarben und Stricharten erscheinen im gemerkten PNG. Der Browseradapter
meldet `desktop_required` und erfindet keine importierten Werte.

Der unabhängige [openpyxl-/Decimal-Abgleich](evidence/audit_macrohistory.py)
prüft alle Länderjahre und alle 166.218 numerischen Roh-/Anzeigezellen inklusive
nominaler Renditen. Die maximale relative Darstellungsabweichung beträgt
`2.6839897315100E-14`; das ist keine Behauptung bitgenauer Dezimalgleichheit.
Geprüft werden auch 32.508 fehlende Rohzellen, 8.190 echte Rohnullwerte,
8.506 fehlende Ableitungen und sämtliche Quellenmarker.
Der [Quellenbericht](evidence/macrohistory-source-audit.json) enthält die
tatsächliche Abdeckung je Land und Messgröße.

Der explizite Rust-Netzwerktest prüft Download, Speicherung und erneutes Lesen
aller 18 Profile. Frontendtests sichern Lücken, Null/Negativwerte, offene
Quellenmarker, gemeinsame Jahre und Skalen, echte Ländergrenzen, Bildauswahl,
optionale Zahlen/Krisen, Nominal-/Realwechsel und Merkkontext.
Die tatsächliche Desktopprüfung und Prozesswiederaufnahme verwenden ausschließlich
das isolierte Profil `com.personal-macro.atlas-jst-20260909`.
Der [native Prüfbericht](evidence/macrohistory-native-readiness.json) bestätigt
18 geladene Länderprofile und drei explizit nicht unterstützte Gebiete, einen
echten Download sowie einen Prozessneustart ohne neuen Quellenjob. Alle
gespeicherten Command-Snapshots, Notiz und Bild bleiben dabei exakt gleich.
Ein zusätzlicher JSON-Leseweg durch das allgemeine Prüfprotokoll kann einzelne
Gleitkommazahlen geringfügig verändern; dieser Protokolleffekt ist ausdrücklich
von der unabhängigen Gleichheitsprüfung der gespeicherten Daten getrennt.
Der [Abgleich des tatsächlichen Tauri-Caches](evidence/macrohistory-native-cache.json)
prüft ebenfalls sämtliche 166.218 numerischen Zellen gegen die Originaldatei.
Aktuelle Ergebnisse und verbleibende Abnahmegrenzen stehen im
[Umsetzungsstand](IMPLEMENTATION-STATUS.md).

Die Bilder sind historische Wirtschafts- und Finanzperspektiven. Es entstehen
keine faire Bewertung, automatische Wendepunktprognose, feste Jahrhundertperiode
oder übertragbare Länder-Sektor-Einschätzung aus ihrer Form.
