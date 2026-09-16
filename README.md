# Personal_Macro

Lokales persönliches Macro-, Seasonality-, COT-, Heatmap- und Tradingjournal-Tool.

Die aktuelle Anwendung liegt in `apps/desktop` und läuft als lokale
Windows-Desktop-App auf Basis von Tauri, React und SQLite. Sie enthält das
Tradingjournal, Dashboard, Kalender, Analytics, Reviews, Ziele, Playbook,
Fehleranalyse, Screenshot-Annotationen, Macro-Heatmap, Seasonality und
Leitzinsanalyse in einem Workspace.

## Einstieg für Coding-Agenten

Neue Coding-Agenten müssen vor Änderungen das verbindliche
[`AGENTS.md`](AGENTS.md) lesen. Es beschreibt die produktive Architektur,
fachliche Invarianten, Scoring- und Journal-Logik, Datenhaltung, Sicherheitsregeln,
Tests und die Definition of Done. `apps/desktop` ist die produktive Anwendung;
`apps/api` und `apps/web` dienen nur als ältere Referenzen.

## Schnellstart zum Testen

Einmalig die Pakete installieren:

```powershell
cd D:\Macrotool\apps\desktop
pnpm install --frozen-lockfile
```

Browser-Vorschau starten:

```powershell
pnpm dev
```

Danach ist der Workspace unter `http://localhost:5173` erreichbar. Die Vorschau
speichert Testdaten im Browser. Für echte SQLite-Daten, Backups, Restore und
lokale Medien die Desktop-App starten:

```powershell
pnpm tauri dev
```

Den installierbaren Windows-Build erzeugen:

```powershell
pnpm tauri build
```

## Wirtschaftskalender: die ganze aktive Woche

Unter **Marktkontext → Wirtschaftskalender** öffnet sich **Diese Woche** mit
allen lokal geladenen Terminen von Montag bis Sonntag. Bereits vergangene
Termine seit Wochenbeginn bleiben einschließlich Actual, Forecast und Previous
sichtbar; kommende Termine stehen in derselben chronologischen Liste. Die
Wochenbegrenzung verwendet die lokale Zeitzone einschließlich Zeitumstellungen.

**Kommend** zeigt weiterhin die nächsten 7, 30 oder 90 Tage. **Verlauf → Seit
Wochenbeginn** begrenzt die Liste auf die bisher vergangenen Termine der aktiven
Woche. Länder-, Kategorien- und Marktfilter bleiben beim Wechsel erhalten.

## Seasonality: stärkste Monatsfenster

Oben im **Seasonality Explorer** findest du **Stärkste saisonale Fenster**.
Der aktuelle Monat ist vorausgewählt; **Top 1** bis **Top 10** legt die Anzahl
sichtbarer Treffer fest. Fensterlänge, Untersuchungszeitraum und Mindestjahre
sind einstellbar. Ein Klick auf einen Treffer zeigt Verlauf, Trefferquote,
Schwankung und die tatsächlich verwendeten historischen Ein-/Ausstiegstage.
**Stärkste Divergenzen** sucht steigende gegen fallende Währungen auf gemeinsamen
Tagen und Jahren. Abstände werden in Prozentpunkten angezeigt.

Der Filter **Ausschließlich FX-Futures** zeigt derzeit eine fehlende Datenquelle:
Im geprüften EODHD-Zugang sind keine geeigneten CME-FX-Futures-Historien
angebunden. **Forex-Spot · 7 Hauptwährungen** kann ausdrücklich separat ausgewählt werden,
um die Suche mit den vorhandenen Währungskursen zu nutzen.
[Datenprüfung, Methodik und offene Futures-Anbindung](docs/planning/seasonality-opportunities.md).

## Staatsanleihen & Yields

Unter **Marktkontext → Staatsanleihen & Yields** findest du ein weltweites
Verzeichnis mit 250 Ländern und Gebieten. Die geprüfte EODHD-Quelle bietet
266 Staatsanleihe-Renditereihen für 60 Länder/Gebiete; fehlende Länder und
Laufzeiten bleiben ausdrücklich sichtbar. **Alle Länder aktualisieren** lädt
die verfügbaren Renditen mit dem vorhandenen EODHD-Zugang. Einzelne Länder
können auch separat aktualisiert werden.

Vergleiche Renditen nach Laufzeit, historische Entwicklungen und Zinskurven
zweier Länder. Werte stehen in Prozent pro Jahr, Veränderungen und Abstände
in Basispunkten. Jeder Wert trägt sein Quelldatum; Kurven und Abstände mischen
keine unterschiedlichen Tage. Die Daten bleiben lokal und offline verfügbar.
Die Browser-Vorschau zeigt das Verzeichnis ohne simulierte Renditen.
[Quelle, Bedeutung und Grenzen](docs/planning/government-bonds.md).

## Weltatlas: Länder und lange Entwicklungen

Der **Weltatlas** ist über **Marktkontext → Weltatlas** erreichbar. Er ordnet
457 Gebiete und 260 Themen in acht Themenfelder und 24 Gruppen. Länderbilder,
langfristige Marktwellen, veröffentlichte Bewertungen, Demografie, Energie und
historische Perspektiven lassen sich bildlich vergleichen; Zahlen sind optional.
Über **Lokalen Datenbestand ergänzen → Fehlende Datenpakete laden** kannst du
alle noch fehlenden angebundenen Quellen gemeinsam laden. Vorhandene Pakete
bleiben gespeichert; einzelne Quellen lassen sich in ihrem Bild aktualisieren.
Der erste Gesamtabruf dauert länger und lässt sich nach dem laufenden Paket
stoppen. Danach sind die geladenen Bilder offline verfügbar.
Marktpreise verwenden den vorhandenen EODHD-Zugang; eine weitere bezahlte
Pflichtanbindung ist nicht erforderlich.

**Afrika:** 49 zusätzliche Weltbank-Reihen ergänzen Grundversorgung, Ernährung,
Gesundheit, Landwirtschaft, Außenwirtschaft, Auslandsschulden und Armut.
In der **Länderübersicht** stehen sie bei den jeweiligen Themen bereit. Unter der
Gebietsregion **Afrika** sind auch drei veröffentlichte Weltbank-Regionen
separat wählbar. Quellenjahre, Modellcharakter und fehlende Daten bleiben sichtbar.
[Abdeckung, Quellen und Prüfung](docs/planning/world-atlas/AFRICA.md).
Unter **Marktlage & Bewertung → Relative Stärke · Länder & Sektoren** vergleichen
58 Fondsbilder Länder und Themen mit dem Weltmarkt beziehungsweise US-Sektoren
mit dem S&P 500. Die Ansicht nutzt vorhandene Monatskurse und funktioniert nach
dem Laden offline. Zeitfenster und Zahlenanzeige sind wählbar; der gemeinsame
Startmonat bildet die Vergleichsbasis. Die Referenz ist keine faire Bewertung.
Nach einem Update die App schließen und **START-MACROTOOL.cmd** erneut öffnen.
Der Starter verwendet den neueren vorhandenen Windows-Release-Build; so kann
eine aktualisierte Datei vorbereitet werden, während die bisherige App noch läuft.

Die Datenabdeckung unterscheidet sich je Land und Thema. Die 40 ursprünglich
offenen Recherchethemen besitzen jetzt passende Datenansichten. Einzelne
Länder, Sektoren und Jahre können weiterhin außerhalb der Quellenabdeckung liegen. Marktwellen
zeigen die Lage zum eigenen historischen Trend; fundamentale Bewertungen und
erklärende Zyklusmodelle sind getrennte Ansichten.
[Prüfung der Quellen-Erweiterung und verbleibende Grenzen](docs/planning/world-atlas/EXPANSION-QA-2026-09-10.md),
[bisherige Gesamtprüfung vom 9. September](docs/planning/world-atlas/COMPLETION-AUDIT.md).
[Quellen und Abnahme der 40 ergänzten Themen](docs/planning/world-atlas/REMAINING-40.md).

**Weltweite Erweiterung vom 15. September:** 77 zusätzliche Perspektiven ergänzen private Schulden, Reallohnveränderungen, Wochenarbeitszeit, Wohnkosten-Benchmarks, Warenhandel nach Produkten und zwölf Handelspartner sowie Batterie-Zubau. 33 neue Länderfonds erweitern die Marktübersicht. Über **Weitere Quellenperspektive** sind ergänzende und bisherige Definitionen getrennt auswählbar. [Umfang, Quellen und verbleibende Lücken](docs/planning/world-atlas/GAP-EXPANSION.md).

**Weitere öffentliche Datenbilder:** 342 Perspektiven aus BIS, OECD, Weltbank WGI/GFDD,
Census, IEA, Eurostat, BGS, ND-GAIN, EIA und EPA ergänzen unter anderem Schuldendienst, Reallöhne,
Arbeitszeit, Institutionen, Cloud, Onlinehandel, KI, Robotik, Elektromobilität,
Zement, Lithium, Seltene Erden, Wohnungsbestand und Dienstleistungen. OECD TiVA
ergänzt historische Absatzmärkte und die Wertschöpfung in Exporten für 80 Länder.
WITS ergänzt die Produktkonzentration von Spiegelexporten mit ausdrücklich
gekennzeichnetem Archivstand. ND-GAIN ergänzt Klimamodelle, die BIS 65 getrennte
Gewerbeimmobilienreihen mit eigener Gebäude- und Gebietsabgrenzung. EIA ergänzt
fünf Ansichten zu stationären US-Großbatterien bis 2023. EPA-Archivstudien ergänzen
Quantensensorik- und Raumfahrtpatente mit geprüften Jahresdaten bis 2017. GFDD ergänzt
historische Börsenkonzentration für 60 Länder und Gebiete. ACI ergänzt Wechselkursstabilität,
geldpolitische Unabhängigkeit und rechtliche Kapitalverkehrsoffenheit für 183 Länder. JST ergänzt historische Wechselkursregime für 18 Länder seit 1870. Eine EU-Studie ergänzt zwölf Werkstoff-Patentperspektiven als vergleichbare Zeitraumwerte 2010–2024. Betreiberberichte ergänzen vier getrennte Anlagenbilder zu fossilen Synthesekraftstoffen seit 2014. Originalperioden, einzelne
Erhebungsjahre, Quellengebiete und Unsicherheitsintervalle bleiben erhalten. [Quellen, Abdeckung und laufende Erweiterung](docs/planning/world-atlas/PUBLIC-SOURCES.md).

**Zusätzliche UN-Sektorbilder:** 38 Perspektiven ergänzen Recycling,
Tourismus, informelle Beschäftigung, Armut, Steuern, Infrastruktur- und
Energiefinanzierung, Artenvielfalt, Wasser und Sanitärversorgung, öffentliche
Dienstleistungen und die Erreichbarkeit öffentlicher Verkehrsmittel.
Einzelerhebungen bleiben Punkte; Zahlen, Quellenhinweise und Unsicherheitsgrenzen
lassen sich einblenden. Nationale Armutsgrenzen werden nur für ein Land angezeigt.
Bei fehlendem Weltbankbild zur Altersgruppe 65+ führt **Anteil 65+ · UN** zum
vorhandenen UN-Profil desselben Gebiets. [Quellen und Grenzen](docs/planning/world-atlas/SDG.md).

**Finanzielle Teilhabe · Global Findex** zeigt Konten, digitale Zahlungen,
Sparen, Zugangshürden und finanzielle Reserven als ruhige Erhebungsbilder.
Einstieg: **Wirtschaft & Kapital → Finanzsystem & Verschuldung → Finanzielle
Teilhabe**. Sieben Gruppen ordnen 42 Perspektiven; jede Übersicht zeigt höchstens
sechs Bilder auf demselben Maßstab. Du kannst Länder sowie Frauen, Männer und
zwei Einkommensgruppen vergleichen. Ein kostenloser Download erschließt die
vorhandenen Befragungen seit 2011 für 162 Länder/Gebiete sowie zwölf veröffentlichte
Welt-/Regions-/Einkommensaggregate. Zahlen bleiben optional und Erhebungslücken
offen. [Quelle und Grenzen](docs/planning/world-atlas/FINANCIAL-INCLUSION.md).

**Internationale Rohstoffpreise · Weltbank** ergänzen 85 lange Preis- und
Indexbilder für Energie, Metalle, Düngemittel und Agrarrohstoffe. Einstieg:
**Produktion & Ressourcen → Rohstoffe & Kreislaufwirtschaft → Internationale
Rohstoffpreise**. Ein kostenloser Download erschließt Jahresmittel bis 2025,
frühestens ab 1960. Die Bilder bleiben offline verfügbar; Zahlen sind optional.
Preisbereinigte und nominale Perspektiven teilen einen gemeinsamen Bezug zu
2010. Diese internationalen Referenzen gelten unabhängig von der Länderwahl;
sie zeigen Preisgeschichte, keine faire Sektorbewertung.
[Quelle, Grenzen und Bedienung](docs/planning/world-atlas/COMMODITIES.md).


**Beschäftigungsbilder · ILOSTAT** zeigen 14 Wirtschaftsbereiche für 188 Länder
und Gebiete sowie die ILO-Modelle für Welt und Afrika. Einstieg:
**Menschen → Arbeit & Einkommen → Wirtschaftsbereiche & Arbeit**.
Drei kleine Gruppen ordnen unter anderem Bildung, Gesundheit, Bau, Handel,
Herstellung und Versorgung. Zwei Länder teilen je Bereich Kalender und Skala;
Zahlen sind optional. Die Modellgeschichte reicht von 1991 bis 2024. Ein
kostenloser Abruf speichert die Bilder lokal. Beschäftigungsanteile zeigen
Strukturwandel und sind keine Anlagebewertung.
[Bedienung, Grenzen und Nachweise](docs/planning/world-atlas/LABOR.md).

**Technologiebilder · WIPO** zeigen 35 Fachgebiete und nicht zugeordnete
Patentveröffentlichungen für 199 Länder und Gebiete. Einstieg:
**Technologie & Wissen → Forschung & Neue Technologien → Patente**.
Sieben Gruppen ordnen unter anderem Halbleiter, Biotechnologie, Pharma,
Chemie und Maschinen. Zwei Länder teilen pro Fachgebiet Maßstab und Kalender;
Zahlen sind optional. Die Standardansicht reicht von frühestens 1980 bis 2023,
das empfindliche Randjahr 2024 ist zuschaltbar. Ein kostenloser öffentlicher
Abruf genügt; danach funktionieren die Bilder offline. Patentaktivität ist
keine Börsenbewertung.
[Bedienung, Quelle und Nachweise](docs/planning/world-atlas/INNOVATION.md).

**Gesundheitsbilder · WHO** ergänzen 38 Perspektiven für 195 Länder und Gebiete.
Unter **Menschen → Gesundheit & Pflege → Gesundheitsausgaben** findest du
Finanzierung, Versicherung, Grundversorgung, Pflege, Arzneimittel und
Investitionen in sieben kleinen Gruppen. Jahreswerte seit frühestens 2000
erscheinen als Punkte; Zahlen sind optional. Vergleichsländer teilen den
Maßstab, vorläufige Werte bleiben hohl markiert und fehlende Untergruppen leer.
Ein kostenloser WHO-Download speichert die Grundlage lokal. Die Bilder zeigen
Ausgabenstrukturen, keine finanzielle Unter- oder Überbewertung.
[Bedienung, Bedeutung und Nachweise](docs/planning/world-atlas/HEALTH-FINANCE.md).

**Lange Entwicklungen** bietet jetzt zehn geordnete Themeneinstiege, etwa
Industrialisierung, Bildungsexpansion, urbanen Wandel, Bevölkerungsentwicklung
und historische Zinsen. Wenige beschriftete Karten führen zu passenden Bildern.
Land und Vergleich bleiben erhalten; ein Rückweg führt zum Ausgangsthema.
Zeitliche Grenzen und fehlende Länderprofile stehen schon am Einstieg.
[Bedienung und Umfang](docs/planning/world-atlas/CONTEXT-GUIDES.md).

Für 55 weitere Themen, etwa Robotik, finanzielle Teilhabe, Wärmenetze oder
Klimaanpassung, zeigt der Atlas jetzt eigene **Quellen-Einstiege**. Sie erklären,
welche Perspektive gemeint ist und welche Datenprüfung noch fehlt. Wo sinnvoll,
führen ergänzende Karten zu vorhandenen Bildern. Quellen und Einzelheiten
bleiben zunächst eingeklappt. Diese Themen werden nicht als bereits geladene
Daten oder gemessene Marktzyklen gezählt.
[Quellen, Umfang und Grenzen](docs/planning/world-atlas/TOPIC-RESEARCH.md).

**Historische Staatsfinanzen · IMF** ergänzen acht Bilder für 151 Länder und
Gebiete, darunter Deutschland, USA, Indien und China. Unter **Weltverbindungen
& Umwelt → Institutionen & Gesellschaft → Staatsfinanzen** findest du
Haushalte, Schulden und wirtschaftlichen Kontext in drei kleinen Gruppen.
Die Geschichte reicht je nach Messgröße und Land bis 1800 zurück; Indiens
Staatsausgaben beispielsweise bis 1861. Zahlen bleiben optional, Länder teilen
im Vergleich den Maßstab. Ein kostenloser Download speichert die Grundlage
lokal. Historische Abgrenzungen und Lücken bleiben sichtbar; die Bilder sind
keine Anlagebewertung. [Bedienung, Quelle und Grenzen](docs/planning/world-atlas/FISCAL.md).

**Finanzgeschichte seit 1870** ergänzt unter **Lange Entwicklungen →
Jahrhundertperspektiven** 20 Bilder zu Wirtschaft, Kredit, Banken, Hauspreisen,
Löhnen, Zinsen und Markterträgen. Die kostenlose JST-Quelle umfasst 18 Länder,
darunter Deutschland und USA, und endet 2020. Sechs Gruppen halten die Auswahl
übersichtlich; Vergleichsländer teilen den Maßstab. Zahlen und historische
Krisenmarkierungen sind optional. Ein Download speichert die gesamte Grundlage
lokal. Indien, China und Welt besitzen in dieser speziellen Quelle kein Profil.
[Methodik und tatsächliche Abdeckung](docs/planning/world-atlas/MACROHISTORY.md).

**Agrarbilder · FAOSTAT** ergänzen 196 Erzeugnisse und Produktgruppen, darunter
Getreide, Kaffee, Obst, Milch und Fleisch. Unter **Produktion & Ressourcen →
Ernährung, Landwirtschaft & Wasser** öffnen Pflanzenbau, Tierhaltung und
Ernährungssicherheit die nach zwölf Gruppen geordneten Bilder. Sechs kleine
Diagramme pro Seite, Suche, Einzelbild und Ländervergleich zeigen die
Produktionsentwicklung seit frühestens 1961; Zahlen bleiben optional. Ein
kostenloser Download versorgt 199 Länder/Gebiete und 35 eigene FAO-Regionen.
Die Indizes zeigen Entwicklung gegenüber der eigenen Basis, keine finanzielle
Unter- oder Überbewertung. [Bedienung und Grenzen](docs/planning/world-atlas/AGRICULTURE.md).

**Bildungsbilder · UNESCO UIS** vertiefen elf Bildungsbereiche mit 40
Perspektiven: vom Schulzugang und Abschluss über Lesen, Weiterbildung und
Lehrkräfte bis zu Internet und Wasser in Schulen. Unter **Menschen → Bildung**
kannst du die kostenlose weltweite Grundlage einmal laden. Einzelne Erhebungen
bleiben Punkte; veröffentlichte Abschlussmodelle sind separat auswählbar.
Zahlen und Quellenhinweise lassen sich bei Bedarf öffnen. Tatsächliche Werte
liegen für 223 Länder/Gebiete und 22 benannte Regionen vor; nicht jede
Perspektive ist überall verfügbar. [Bedeutung und Grenzen](docs/planning/world-atlas/EDUCATION.md).

**Ansicht merken** hält eine Länder-/Themenauswahl mit eigener Notiz und optionalem
festem Diagrammbild fest. **Gemerkte Ansichten** zeigt die persönliche Sammlung,
Favoriten und einen Papierkorb mit Wiederherstellung. Der Bildstand bleibt beim
Bearbeiten der Notiz erhalten; die gespeicherte Auswahl lässt sich zusätzlich
mit den aktuellen lokalen Daten öffnen. Notizen und Bilder liegen in der
Desktop-App in der Journal-Datenbank und gehören zum regulären Backup.
Der nächste Atlasaufruf ohne konkrete Link-Auswahl nimmt die letzte Ansicht wieder auf.
Kurzzeitige Datenbanksperren beim Merken dieser Auswahl werden automatisch und
begrenzt überbrückt. Auch beim schnellen Verlassen und Wiederöffnen wartet der
Atlas auf die neueste Speicherung. [Details](docs/planning/world-atlas/PREFERENCES-RECOVERY.md).
[Bedienung und Speicherung](docs/planning/world-atlas/NOTEBOOK.md).

Unter **Marktkontext → Weltatlas** lassen sich Weltregionen, Länder und ein
breiter Themenkatalog durchsuchen. Die statistische Basis enthält 93
WDI-Reihen, unter anderem Bevölkerung, Bildung, Gesundheit, Arbeitsmarkt,
Wirtschaftsstruktur, Forschung, Handel, Versorgung und Umwelt. In der Desktop-App lädt
**Für alle Länder laden** die ausgewählte Statistik für die verfügbaren Gebiete
und speichert sie lokal. Länder lassen sich anschließend im gemeinsamen
Zeitraum und mit derselben Einheit vergleichen.

Unter **Menschen → Demografie → Zu- und Abwanderung** stehen drei getrennte
Bilder bereit: jährlicher Wanderungssaldo, Migrantenbestand und Bevölkerungsanteil.
Die historischen Salden reichen bis 2023, veröffentlichte Bestandsschätzungen
bis 2024. Einzelne Bestandsjahre bleiben Punkte; Zahlen lassen sich bei Bedarf
einblenden. [Bedeutung und Quellenabdeckung](docs/planning/world-atlas/MIGRATION.md).

Neu hinzugekommen sind unter anderem Öl, Gas und Kohle als geschätzte
Ressourcenüberschüsse, Energieimporte, Netzverluste, Unternehmensgründungen
und historische Logistikbefragungen. Sie zeigen wirtschaftliche Entwicklung;
die Reihen werden nicht als automatische Unter- oder Überbewertung ausgegeben.
[Umfang und geprüfte Länderabdeckung](docs/planning/world-atlas/ECONOMIC-CONTEXTS.md).

Die **Länderübersicht** ordnet diese Statistiken als kleine Bilder nach
Themenfeldern und Gruppen. Wähle ein Land, bei Bedarf ein Vergleichsland und
einen Zeitraum von 20 oder 40 Jahren beziehungsweise seit 1960. Alle Karten
teilen den Kalender; jede Statistik hat ihren eigenen Maßstab. Innerhalb
derselben Karte gelten für beide Länder die gleiche Skala und ein gemeinsamer
Darstellungszeitraum. Eine Karte öffnet die konkrete Statistik im großen Bild.
**Auswahl laden / aktualisieren** lädt die sichtbare Themengruppe für alle
verfügbaren Länder. Erfolgreiche Abrufe der letzten 24 Stunden werden
übersprungen. **Nach aktueller Statistik stoppen** erhält bereits geladene
Reihen; ein erneuter Abruf setzt mit den noch ausstehenden Statistiken fort.

Neu hinzugekommen sind Beschäftigungsanteile von Landwirtschaft, Industrie
und Dienstleistungen sowie fünf Bilder zur Zusammensetzung der Industrie,
darunter Chemie, Maschinen und Textilien. Sie zeigen langfristige Verschiebungen
zwischen Wirtschaftsbereichen. Die Beschäftigungsmodelle sind auf 1991–2024
begrenzt; Industrieanteile reichen je Land teilweise bis 1963 zurück.
[Auswahl, Bedeutung und tatsächliche Länderabdeckung](docs/planning/world-atlas/SECTOR-STRUCTURE.md).

**Daten & Quellen** zeigt für das gewählte Gebiet, welche Bilder lokal vorliegen,
noch geladen werden müssen oder noch keine geprüfte Anbindung haben. Die
Themenbereiche sind aufklappbar und lassen sich nach Thema und Datenstatus
filtern. Kleine Balken zeigen die Abdeckung, Zahlen erscheinen auf Wunsch.
Quellenregionen und globale Fonds werden ausdrücklich benannt; ein Wechsel
zu einem anderen Gebiet erfolgt durch deinen Klick. Die Ansicht löst selbst
keinen Download aus. [Bedeutung und Gebietsprüfung](docs/planning/world-atlas/COVERAGE.md).

Unter **Länder & Themen → Lange Entwicklungen → Zyklusthesen untersuchen**
gibt es sechs erklärende Modelle für Konjunktur, Finanzen, Investitionen,
Innovationen und lange historische Entwicklungen. **Modellbild erkunden**
öffnet eine frei gezeichnete Darstellung mit vier wählbaren Lernschritten.
Quellen und Grenzen sind aufklappbar; passende Länderbilder lassen sich
daneben erkunden und anschließend zum gewählten Schritt zurückkehren.
Das Modell ordnet keinem Land eine heutige Phase oder Bewertung zu.
[Bedienung und Quellen](docs/planning/world-atlas/CYCLES.md).

Bei mehreren Perspektiven erscheint **Statistik auswählen**, etwa für
Schulbesuch und den Zugang zur Abschlussklasse oder für unterschiedliche
Trinkwasserkategorien. **Was dieses Bild bedeutet** erklärt die konkrete
Größe auf Deutsch. Fehlende Länderwerte werden nicht durch ähnliche
Statistiken ersetzt. [Umfang, Bedeutung und Quellenprüfung](docs/planning/world-atlas/STATISTICS.md).

Die Bildansicht zeigt zunächst den Verlauf; **Zahlen anzeigen** und
**Quelle und Bedeutung** öffnen die Details. Fehlende Werte bleiben Lücken.
Ältere Datenstände und Modellschätzungen werden kenntlich gemacht. Die
statistischen Verläufe sind keine automatische Unter-/Überbewertung.

Unter **Menschen → Demografie → Altersstruktur** lädt **UN-Profile für alle
Länder laden** die kostenlose UN-Grundlage einmalig herunter (rund 31 MB).
Danach stehen Altersformen für 237 Länder/Gebiete sowie Welt und fünf Großregionen
offline bereit. Ein Jahresregler zeigt den Wandel seit 1950; zwei Länder
verwenden dieselbe Skala. Das **UN-Szenario bis 2100** lässt sich bewusst
einblenden. Auch die langen Bevölkerungskurven, der Anteil im Erwerbsalter und
Jugend-/Altenquotienten sind verfügbar. Schätzungen bis 2023 und Szenarien ab
2024 werden sichtbar getrennt.

Unter **Menschen → Demografie → Haushalte und Haushaltsgrößen** stehen
39 Haushaltsbilder in sieben Gruppen bereit: Größe, Wohnformen, Generationen,
Altersgruppen und Bezugspersonen. Ein kostenloser UN-Download von rund 400 KB
speichert die Erhebungen für 200 Länder/Gebiete lokal, darunter Deutschland,
USA, Indien und China. Länder teilen dieselbe Skala; Quelle und Erhebungsjahr
bleiben sichtbar, Zahlen sind optional. Einzelne Erhebungen von 1959 bis 2025
bilden keine durchgängige Jahresreihe. Gemerkte Bilder erhalten die konkret
gewählten Erhebungen. [Bedienung und Grenzen](docs/planning/world-atlas/HOUSEHOLDS.md).

Unter **Wirtschaft & Kapital → Finanzsystem & Verschuldung** zeigen
**Haushaltsverschuldung** und **Unternehmensverschuldung** getrennte BIS-Kurven
über Jahrzehnte. **Schuldenquote** und **Steigen & Fallen** lassen sich mit
einem zweiten Land auf derselben Skala betrachten; Zahlen sind optional.
Der öffentliche Download von rund 1,8 MB benötigt keinen API-Schlüssel und
speichert 48 Länder-/Quellenprofile lokal, einschließlich Deutschland, USA,
Indien und China. Historische Schätzungen und fehlende Welt-/Afrika-Aggregate
bleiben sichtbar. [Bedeutung und Abdeckung](docs/planning/world-atlas/DEBT.md).

Unter **Wirtschaft & Kapital → Marktlage & Bewertung** sind außerdem
langfristige Marktwellen verfügbar: 43 Länder, der Weltmarkt, elf US-Sektoren
und vier globale Energiethemen. **Marktgeschichte laden** nutzt die vorhandene
EODHD-Konfiguration und bewahrt die bereinigten Monatswerte lokal auf. Die
ruhige Welle zeigt den Abstand zum eigenen langfristigen Trend. Wenn andere
lange Zeitfenster zu einer anderen Einordnung kommen, wird das sichtbar.
Junge Fonds und Datenlücken erhalten keine erfundene Welle. Eine fundamentale
Bewertung lässt sich aus dem Trendabstand allein nicht ableiten.

Die **Marktübersicht** im Weltatlas zeigt diese Märkte als kleine Wellen,
geordnet nach Ländern, US-Börsensektoren und globalen Energiethemen. Innerhalb
der Auswahl gelten ein gemeinsamer Zeitraum und dieselbe Skala. Eine Karte
öffnet den zugehörigen Fonds im Detail. **Auswahl laden / aktualisieren** lädt
die gewählte Gruppe nacheinander; erfolgreiche Abrufe der letzten 24 Stunden
werden übersprungen. **Nach aktuellem Fonds stoppen** beendet den Rest des
Abrufs und erhält bereits gespeicherte Marktgeschichten.

Unter **Energie → Strom & Erzeugung** zeigt der Atlas reale Länder- und
Regionsverläufe für Solar, Kernenergie und sieben weitere Erzeugungsarten.
**Stromdaten für alle Länder laden** lädt die öffentliche Ember-Grundlage
ohne API-Schlüssel herunter (rund 49 MB). Im geprüften Stand sind 214 Länder
und Wirtschaftsgebiete sowie 13 Quellenaggregate von 2000 bis 2025 enthalten.
**Strommix** zeigt die Zusammensetzung als Farbbild. Einzelne Erzeugungsarten
lassen sich als Anteil, Erzeugung oder installierte Leistung vergleichen.
Stromnachfrage und Nettoimporte ergänzen den Überblick. Schätzungen und
fehlende Daten bleiben erkennbar. Beispielsweise lässt sich **Afrika ·
Ember-Region → Solarenergie** mit Deutschland vergleichen. Die **Börsenlage**
ist bei passenden Themen über einen eigenen Schalter erreichbar.

**Anlagen & Technologien** ergänzt kostenlose IRENA-Jahresbilder für 224 Länder
und Wirtschaftsgebiete sowie zehn Quellenregionen. Dort kannst du beispielsweise
Photovoltaik in Indien und China oder Solarenergie mit beziehungsweise ohne
Netzanschluss in Afrika vergleichen. Wind an Land/auf See, Geothermie,
Kernenergie und weitere Technologien bleiben getrennt auswählbar. Zahlen sind
optional. Diese Bilder zeigen den Ausbau der Anlagen; eine finanzielle
Unter-/Überbewertung benötigt weiterhin eigene Bewertungsdaten.
Details: [IRENA-Anlagenbilder](docs/planning/world-atlas/CAPACITY.md).

**Immobilienbilder** zeigen die langfristigen Wohnimmobilienpreise für 57
Länder/Wirtschaftsgebiete und vier ausdrücklich benannte BIS-Aggregate.
Unter **Leben & Versorgung → Wohnen & Immobilien → Wohnimmobilienpreise**
lassen sich Länder zunächst ohne Zahlen vergleichen. **Inflation bereinigt**
und **Mit Inflation** unterscheiden reale und nominale Preise;
**Steigen & Fallen** zeigt die Veränderung gegenüber dem Vorjahr.
Die langen Geschichten sind auch unter **Jahrhundertperspektiven** erreichbar.
Ein kostenloser gemeinsamer Download speichert die Bilder lokal.
Preisentwicklung ist keine automatische Unter-/Überbewertung.
[Bedienung, Quellen und Grenzen](docs/planning/world-atlas/PROPERTY.md).

**Kaufpreise, Einkommen & Mieten** ergänzt kostenlose OECD-Wohnvergleiche für
42 Länder und drei eigene Ländergruppen. Unter **Bezahlbarkeit von Wohnen**
und **Kaufpreise im Mietvergleich** zeigt **Hoch & Tief**, ob das jeweilige
Verhältnis über oder unter seinem veröffentlichten Langfristdurchschnitt liegt.
Zahlen sind optional; Länder teilen Zeitachse und Maßstab. Die Mittellinie ist
ein historischer Vergleich, kein fairer Preis. Fehlende Länder oder Referenzreihen
bleiben sichtbar fehlend. [Bedienung und Grenzen](docs/planning/world-atlas/HOUSING-RATIOS.md).

**Kreditbilder** zeigen für 43 Länder und den BIS-Euroraum, wie sich private
Schulden relativ zur Wirtschaftsleistung und zu ihrem langfristigen Trend
entwickeln. Unter „Lange Entwicklungen → Jahrhundertperspektiven → Lange Kredit-
und Schuldenentwicklung“ lassen sich Länder ohne Pflichtzahlen vergleichen.
Die Mittellinie bezeichnet den statistischen Trend, keine faire Bewertung.
Der kostenlose BIS-Download braucht keinen API-Schlüssel und bleibt lokal
im Atlas-Cache. [Quelle, Zeiträume und Grenzen](docs/planning/world-atlas/CREDIT.md).

Unter **Lange Entwicklungen → Jahrhundertperspektiven** stehen historische
Wirtschaftsleistung je Einwohner und Wirtschaftsgröße bereit. Der kostenlose
Maddison-Abruf über Our World in Data lädt rund 1 MB für die verfügbaren Länder
und acht eigene historische Regionsgruppen. Frühe Schätzpunkte und fehlende Jahre
bleiben sichtbar; lange Vergleiche können proportional oder linear angezeigt
werden. **Strukturwandel & Generationen → Verschiebung wirtschaftlicher Gewichte**
zeigt Weltanteile ausschließlich mit veröffentlichten Weltwerten desselben Jahres.
Die rekonstruierte Geschichte endet mit dem Quellenstand 2022 und erzeugt keine
feste Jahrhundertwelle.

Der öffentliche Cache ist vom Journal getrennt. Ein zusätzliches
kostenpflichtiges Datenabonnement ist nicht vorgesehen. Im Browser sind
Navigation und Themenverzeichnis verfügbar; native Downloads werden dort nicht
simuliert. Weitere Länder-Sektoren, längere Bewertungsgeschichten und zusätzliche
historische Perspektiven folgen im laufenden Ausbau.
[Planung und aktueller Umsetzungsstand](docs/planning/world-atlas/README.md).

Mit **Weltkarte & Länderliste öffnen** kannst du Länder direkt anklicken oder
nach Name und ISO-Code suchen. Karte und Liste verwenden dieselbe Länder-
und Vergleichsauswahl wie deine Themenbilder. Kleine Gebiete und Quellenregionen
bleiben in der vollständigen Liste erreichbar. Die Karte wird mit der App
gespeichert und funktioniert offline ohne zusätzlichen Kartendienst.

Die **Bewertungsbilder** im Weltatlas ergänzen die Kurswellen um öffentliche
NYU-/Damodaran-Unternehmenskennzahlen. Länder und nach zehn Feldern sortierte
Branchen lassen sich bildlich vergleichen; Zahlen bleiben optional. US-
Buchwert- und Gewinnarchive reichen bis 1999 zurück, Europa, Japan,
Schwellenländer und die globale Stichprobe bis 2012. Die Gewinnhistorien
ergänzen unter anderem Healthcare, Bildungsunternehmen, Energie und Technologie.
Indien und China besitzen in den angebundenen Branchenquellen bislang einzelne
Jahresstände. Solche Momentaufnahmen erhalten keine künstliche lange Welle.

47 Themen führen direkt zu passenden Branchenbildern, darunter Chemie,
Maschinenbau, Stahl, Versicherungen, Halbleiter und Einzelhandel. Große Themen
zeigen höchstens sechs Bilder auf einmal. Die Suche bleibt innerhalb des Themas;
**Alle Branchenfelder** öffnet wieder die freie Auswahl. Die tatsächliche
Quellenregion bleibt im Bild und in gemerkten Ansichten sichtbar.

In einem geöffneten Branchenbild vergleicht **Dieselbe Branche in einer anderen
Region** beispielsweise Bildungsunternehmen in Indien und den USA. Beide
Regionen teilen die Skala und behalten ihre eigene Vorgeschichte. Ohne
gemeinsames sinnvolles Veröffentlichungsjahr erscheint keine zweite Kurve;
fehlende Vergleichspakete lassen sich gezielt kostenlos laden. Gemerkte
Ansichten erhalten beide Regionen samt Quellenständen.

**Diese Quellenregion laden** beziehungsweise **Länderbewertungen laden** lädt
das gewählte kostenlose Quellenpaket und speichert es offline. Das Bild zeigt
die Lage gegenüber der eigenen vergleichbaren Vorgeschichte, sofern diese
ausreicht. Es bestimmt keinen fairen Wert. Mittelwerte und Mediane bleiben
getrennt; Afrika-Solar, Wasserstoff und Kernenergie werden aus dieser Quelle
nicht durch breitere Branchen ersetzt. [Bedeutung und Quellenumfang](docs/planning/world-atlas/VALUATION.md).

## Zentralbank-Briefings auf Deutsch

Die Zusammenfassungen offizieller Zentralbankberichte erscheinen auf Deutsch,
einschließlich Übersicht, Abschnittstiteln und Stichpunkten mit Quellenbelegen.
**Briefings auf Deutsch** aktualisiert vorhandene, noch ausstehende oder ältere
Zusammenfassungen aus den lokal archivierten Dokumenten. Einzelne Berichte
lassen sich über **Deutsch zusammenfassen** nachholen. Bereits fertige Briefings
bleiben offline lesbar; der Originaltext ist separat in seiner Quellsprache
verfügbar. Für die Erstellung wird die bestehende OpenAI-Anbindung verwendet.
Unvollständige Modellantworten werden nicht als fertiges Briefing übernommen.

## Trade aus einem TradingView-Screenshot erfassen

In **Trade erfassen** und in der **geführten Erfassung** gibt es den Bereich
**Trade aus Screenshot**. Dort ein PNG/JPEG auswählen, ablegen oder mit **Strg+V**
einfügen. Die Windows-Texterkennung läuft lokal, ohne API-Schlüssel oder Upload.
Unterstützt werden Bilder bis 12 MB, 8192 Pixel pro Seite und 32 Megapixel.

Die Vorschau liest erkennbare deutsche und englische Angaben zu Instrument,
Richtung, Status, Timeframe, Entry, Stop Loss, Take Profit, Exit, Menge und Risiko.
Markierte Felder lassen sich korrigieren und mit **Geprüfte Werte übernehmen** ins
Formular übertragen. Bei einer Menge ohne eindeutige Einheit muss die Einheit
ausgewählt werden; Forex-Einheiten können über eine sichtbare, editierbare
Kontraktgröße in Lots umgerechnet werden. Risikobeträge werden nur nach Abgleich
mit der Kontowährung übernommen. Der vorhandene Positionsrechner pausiert nach
der Übernahme und lässt sich ausdrücklich wieder aktivieren.

TradingView-Positionslinien werden anhand ihrer Farben mit den Preislabels rechts
abgeglichen. Die rechte Skala wird zusätzlich vergrößert gelesen, damit eng
gestapelte Labels erkannt werden. Auch ausgeschriebene Währungspaare oben links
(Deutsch/Englisch) und der Tageschart „1T“ werden gelesen. Die Zuordnung prüft
Positionsgröße, Währung, Preisrichtung und das Verhältnis von Stop-/Zielbetrag;
Bid/Ask, Hoch/Tief und Indikatorwerte werden dadurch nicht ungeprüft zum Entry.
Eine passende Positionsanzeige mit laufendem P&L und zugehörigen Stop-/Zielorders
kann den Status **Offen** vorbelegen. Die gezeigte Menge benötigt weiterhin eine
Einheit, wenn diese im Screenshot nicht ausdrücklich genannt wird. Bei mehreren
möglichen Preiszuordnungen bleiben die Preise offen.

TradingViews Long-/Short-Zeichnung ist eine Simulation: „Open/Closed P&L“ belegt
keinen Broker-Status. „Stop/Target“ bezeichnet dort Preisabstände; echte Preislabels
werden nur übernommen, wenn sie räumlich und rechnerisch zu beiden Abständen
passen. „Amount“ ist ein simulierter Kontostand. Der Risikobetrag kann aus beiden
Kontoständen und Preisabständen abgeleitet werden und wird entsprechend markiert.
Diese Unterscheidungen folgen der [TradingView-Dokumentation](https://www.tradingview.com/support/solutions/43000475660-how-to-use-long-and-short-position-drawing-tools/).

Nicht erkennbare oder widersprüchliche Werte bleiben zur manuellen Ergänzung offen.
Ohne eindeutigen Status schlägt die Vorschau **Entwurf** vor. Ausführungszeiten und
realisiertes P&L werden nicht aus Chartkerzen oder simulierten Ergebnissen erfunden.
Am besten genau eine Position mit sichtbaren Preislabels und Beschriftungen
aufnehmen; mehrere Tabellenpositionen werden nicht automatisch zusammengeführt.

Erst **Trade speichern** legt den Trade und die Verknüpfung zum unveränderten
Originalbild gemeinsam in einer SQLite-Transaktion an. Bei einem Fehler bleibt
das Formular für einen erneuten Versuch offen. In der geführten Erfassung werden
Formularwerte lokal zwischengespeichert; nach dem Schließen muss ein noch nicht
gespeichertes Bild erneut hinzugefügt werden. In der Browser-Vorschau steht nur
der Hinweis auf die native Funktion zur Verfügung. Fehlt Windows-Texterkennung,
muss in Windows ein deutsches oder englisches Sprachpaket mit OCR installiert sein.

## Broker-Konto verbinden und historische Trades importieren

Unter **Einstellungen → Konten → MT5 / cTrader verbinden** kann ein bestehendes
Broker-Konto als Journal-Konto angelegt werden. MT5 wird über das lokal geöffnete
und bereits angemeldete Terminal erkannt; Passwörter werden nicht abgefragt oder
gespeichert. cTrader verwendet den offiziellen OAuth-Flow mit reinem
`accounts`-Scope. Die Verbindung liest Kontoinformationen und Broker-Balance,
enthält aber ausdrücklich keine Orderfunktionen. cTrader benötigt einmalig eine
freigegebene Open-API-App und die drei leeren Konfigurationswerte aus
`.env.example`; Tokens werden außerhalb von SQLite im Windows-Anmeldedatenspeicher
geschützt.

Historische Trades werden weiterhin bewusst über eine geprüfte Vorschau einem
ausgewählten Journal-Konto zugeordnet:

1. In MetaTrader den klassischen History-/Kontohistorie-Report als HTML
   speichern.
2. In **Import & Export → MetaTrader HTML-Historie** das Zielkonto und die
   Broker-Server-Zeitzone wählen.
3. Die native Vorschau prüfen und anschließend atomar übernehmen.

Der Import führt HTML niemals aus. Reine grafische Aggregate-Reports ohne
Trade-Ledger werden abgelehnt; wiederholte Imports werden über stabile
Quellpositionen dedupliziert.

Für cTrader steht unter **Import & Export → cTrader Statement** zusätzlich ein
Import für HTML- und XLSX-Kontoauszüge bereit. Das ausgewählte Journal-Konto ist
nur das Ziel; Berichtskonto und Berichtswährung dürfen abweichen. Netto-P&L wird
bei abweichender Währung unverändert und ohne automatische FX-Umrechnung
übernommen. Verwendet wird die `History`-Tabelle. Leere XLSX-Exporte enthalten
keine Trades und werden mit einem klaren Hinweis abgelehnt; in diesem Fall den
HTML-Kontoauszug exportieren.

## Trades und Kontokapital erfassen

**Trade erfassen** öffnet ein kompaktes Formular: Status wählen, Instrument und
Ergebnis eintragen, speichern. Screenshots, Kurse, Risiko, Setup und Notizen
sind bei Bedarf aufklappbar. MAE/MFE und psychologische Fragebögen entfallen.
Laufende Positionen lassen sich später im Trade über **Trade abschließen**
ergänzen. Eingaben werden pro Konto lokal zwischengespeichert.

Die feste Kontoleiste zeigt im Journal immer den **gesamten Konto-P&L** und den
**Journal-Kontostand**, unabhängig von den Filtern der aktuellen Seite.
Die Kapitalkurve beginnt bereits beim Startkapital, auch mit null Trades:

`Journal-Kontostand = Startkapital + Einzahlungen − Auszahlungen + Netto-P&L`

Unter **Einstellungen → Konten** legst du ein Konto mit ausdrücklich angegebenem
Startkapital an. Über **Konto / Startkapital bearbeiten** kannst du fehlendes
Startkapital nachtragen. Spätere Geldbewegungen erfasst du separat mit Datum
und optionaler Notiz; sie zählen nicht als Trading-Gewinn. Fehlende
Trade-Ergebnisse bleiben als unvollständig erkennbar. Eine verbundene
Broker-Balance wird getrennt vom Journal-Kontostand angezeigt.

## Automatische Positionsgröße und EODHD-Fundamentaldaten

Die schnelle und die geführte Trade-Erfassung enthalten einen automatischen
Positionsgrößenrechner. Er übernimmt das gewählte Konto, den aktuellen
Kontostand und das Standardrisiko. Forex-Paare, Edelmetalle, bekannte Kryptos
sowie wichtige Währungs-, Metall- und Krypto-Futures besitzen Presets.
Brokerabhängige Kontraktgrößen, Tickgrößen und Tickwerte bleiben im Rechner
editierbar.
In der kompakten Erfassung aktivierst du ihn unter **Kurse, Risiko & Kosten**
bei Bedarf selbst, damit nachgetragene Trades kein geschätztes Risiko erhalten.

Economic Overview, fundamentale Pair-Heatmap und Leitzinsansicht beziehen ihre
Economic-News-Werte ausschließlich aus EODHD. Actual, Forecast und Previous
werden provider-nativ in SQLite gespeichert. Der letzte vollständige Release
bleibt aktiv, bis ein vollständiger Nachfolger vorliegt. Monats-, Quartals- und
Wochenreleases dürfen im Base-/Quote-Vergleich direkt gegenüberstehen.

Die Heatmap verwendet je Zelle `BaseSignal - QuoteSignal`. Eine fehlende Seite
bleibt sichtbar nicht verfügbar, geht gemäß der verbindlichen Bewertungslogik
aber numerisch als `0` ein. Unsichere Provider-Bezeichnungen landen in einer
manuellen Prüfliste und werden nicht automatisch gescored. Nach bekannten
Release-Terminen prüft die Desktop-App gezielt nach; zusätzlich erfolgt ein
täglicher vollständiger Abgleich, solange die App geöffnet ist.

Die Konfiguration erfolgt ausschließlich über `EODHD_API_KEY` in der
`.env.local` im Repository-Stamm. Eine installierte App kann dieselbe Datei
alternativ unter
`%APPDATA%\com.personal-macro.app\PersonalMacro\settings\.env.local` lesen.
Die Auflösung ist unabhängig vom Startordner; der Schlüssel wird weder
protokolliert noch in der Datenbank gespeichert. Für
COT bleibt der eigenständige Datenpfad aktiv. Seasonality verwendet nun
ausschließlich lokal gespeicherte EODHD-Tageshistorien: Forex, Indizes,
Kryptowährungen und Edelmetall-Spots kommen aus dem EOD-Historical-Endpoint;
täglich verfügbare Energie-Rohstoffe aus dem EODHD-Commodities-Endpoint.
Provider-native Handelstage und Herkunft bleiben in der Analyse sichtbar.
Unvollständige Jahre sowie Kohorten unter fünf Beobachtungen werden nicht als
belastbare oder neutrale Evidenz gewertet.

Voraussetzungen für den Desktop-Build sind Node.js, pnpm, Rust, Microsoft C++
Build Tools und WebView2. Details stehen in
[`apps/desktop/README.md`](apps/desktop/README.md).

Die SQLite-Datenbank, Medien, Exporte und Backups liegen im Windows-AppData-Ordner
`%APPDATA%\com.personal-macro.app\PersonalMacro`. Die älteren Projekte in `apps/api` und `apps/web`
bleiben als Referenz erhalten, werden für die Desktop-App aber nicht benötigt.

## Audit-Dokumente

- [`docs/audit/source-codebase-overview.md`](docs/audit/source-codebase-overview.md)
- [`docs/audit/relevant-feature-map.md`](docs/audit/relevant-feature-map.md)
- [`docs/audit/excluded-product-features.md`](docs/audit/excluded-product-features.md)
- [`docs/audit/data-source-audit.md`](docs/audit/data-source-audit.md)
- [`docs/audit/calculation-audit.md`](docs/audit/calculation-audit.md)
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md)
- [`docs/architecture/database-schema.md`](docs/architecture/database-schema.md)
- [`docs/planning/implementation-roadmap.md`](docs/planning/implementation-roadmap.md)
- [`docs/planning/free-data-strategy.md`](docs/planning/free-data-strategy.md)
- [`docs/planning/forecast-acquisition-policy.md`](docs/planning/forecast-acquisition-policy.md)
- [`docs/planning/eodhd-fundamentals-workflow.md`](docs/planning/eodhd-fundamentals-workflow.md)
- [`docs/planning/policy-rate-model-v1.md`](docs/planning/policy-rate-model-v1.md)
- [`docs/planning/scoring-model-v1.md`](docs/planning/scoring-model-v1.md)
- [`docs/planning/trading-journal-tauri-implementation-plan.md`](docs/planning/trading-journal-tauri-implementation-plan.md)
- [`docs/planning/journal-metrics-and-heatmap-v1.md`](docs/planning/journal-metrics-and-heatmap-v1.md)
- [`docs/planning/trading-journal-ui-reference-analysis.md`](docs/planning/trading-journal-ui-reference-analysis.md)
- [`docs/planning/open-questions.md`](docs/planning/open-questions.md)

## Sicherheitsstatus

Lokale Datenbanken, Brokerimporte, Anhänge, Exporte, Backups und `.env`-Dateien
sind über `.gitignore` ausgeschlossen. `.env.example` enthält ausschließlich
leere Platzhalter für optionale API-Keys und lokale Pfade.
