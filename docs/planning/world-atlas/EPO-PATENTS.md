# Quanten- und Raumfahrtpatente aus EPA-Archivstudien

Sieben Perspektiven verwenden die veröffentlichten Originalarbeitsmappen in
zwei Präsentationen des Europäischen Patentamts. Es handelt sich um historische
Patentaktivität mit genau benannter Suchstrategie und Gebietsdefinition. Sie
misst weder heutige Unternehmensumsätze noch eine Unter- oder Überbewertung.

## Quantensensorik

Die Studie vom September 2019 behandelt Quantensensorik und Quantenmesstechnik
der zweiten Generation. Sie deckt Quantencomputer und Quantenkommunikation
nicht vollständig ab. Die Jahresbilder 2000–2017 trennen weltweite
Patentfamilien und Prioritätsanmeldungen in China, den USA und Japan.
Prioritätsanmeldungen sind nach der Zuständigkeit der ersten Anmeldung
geordnet, nicht nach Erfinder- oder Anmelderherkunft. Ihre Jahresachse bezieht
sich laut endgültigem Bericht auf Veröffentlichungsjahre.

Die Präsentation enthält bei den weltweiten Familien zusätzlich 2018. Der
endgültige Bericht endet jedoch 2017; diese Zusatzspalte wird nicht übernommen.
WO und EP sind internationale beziehungsweise regionale Patentwege und werden
nicht als Länder behandelt. Vier Profile enthalten 72 veröffentlichte Werte.
Echte Quellen-Nullen bleiben als Null erhalten.

## Raumfahrt

Die gemeinsame EPA-/ESPI-/ESA-Studie vom Juli 2021 verwendet eine Patentsuche
vom November 2019 mit CPC B64G und 41 ESA-Suchgruppen. Veröffentlichungsverzug
macht den späten Rand unvollständig. Die importierten Jahre enden deshalb 2017
und beginnen 1990. Außerhalb des untersuchten Patentbereichs liegende
Startsysteme sind nicht nachträglich enthalten.

Vier Weltperspektiven unterscheiden Patentfamilien und einzelne Anmeldungen,
jeweils weltweit beziehungsweise mit Schutz in der festen Gruppe EPO38+ aus
dem Quellenjahr 2019. EPO38+ bezeichnet das Schutzgebiet auch für Anmelder
außerhalb Europas; es ist weder die heutige EU noch ein europäischer Herkunftswert.
Eine fünfte Perspektive zeigt Anmeldungen nach Anmelderherkunft für 24 in der
Studie enthaltene europäische Länder. Für andere Länder wird kein Weltwert
als Landeswert eingesetzt. Ehemaliges Serbien und Montenegro wird keinem
Nachfolgestaat zugeschlagen.

Die Originaldaten zu Abbildung 12 sind ein Blasendiagramm. Seine Größenwerte
sind die veröffentlichten Anmeldezahlen; die y-Koordinate ist reine Anordnung.
Die x-Ordnungszahlen werden gegen die ursprüngliche Jahresachse 1990–2019
aufgelöst. Jahre ohne veröffentlichten Zahlenwert bleiben Lücken. 28 Profile
enthalten 370 Zahlen und 414 fehlende Jahreswerte.

## Quellenprüfung und Bedienung

`evidence/build_public_epo.py` gleicht die numerischen Diagramm-Caches mit den
ursprünglich eingebetteten XLSX-Zellen über OpenPyXL ab. Der native Adapter
`public_epo.rs` liest die Arbeitsmappen unabhängig mit Calamine. Beide prüfen
Jahre, Einheiten, Gebietsidentität und Ganzzahlen. Der Import validiert feste
URLs, vollständige Quellen- und Arbeitsmappen-Prüfsummen, ZIP-Größenlimits,
Blätter und Spaltenköpfe. Der öffentliche Atlas-Cache verwendet die vorhandene
Migration 0022, atomaren Austausch und die gemeinsame Abrufsperre mit 24 Stunden
Mindestabstand. Die persönliche Journal-Datenbank wird nicht geöffnet.

Ein erster Einstieg wählt eine tatsächlich zum gewählten Gebiet gehörende
Perspektive. Eine ausdrücklich gewählte, dort fehlende Perspektive bleibt
hingegen sichtbar ohne Werte. Zahlen sind optional. Quellenarchiv, Zeitgrenzen,
fehlende Jahre und die unterschiedliche Bedeutung der Länderbilder bleiben
am Diagramm erläutert. Zählachsen beginnen bei Null und verwenden ganzzahlige
Teilungen. Gemerkte Ansichten bewahren Quelle, Perspektive und Beginn.

Neuere Studien zu Quantentechnik 2025 und Raumfahrt 2026 wurden geprüft. Für
die betrachteten historischen Diagramme wurde kein geeigneter Originaldownload
mit numerischen Jahreswerten gefunden. Die 2023 angebotenen Quantencomputing-
und Simulations-Tabellen enthalten Suchstrategien, keine Zeitreihen. Sie werden
nicht als zusätzliche Zahlenabdeckung gezählt. Das umfangreiche Supplement
zur Raumfahrtantriebstechnik benötigt eine eigene Familien-, Anmelder- und
Technologieprüfung; es wird nicht mit dieser Archivstudie vermischt.

Originalquellen und Zuordnung:

- [EPA-Übersicht mit Originaldownloads](https://www.epo.org/en/searching-for-patents/business/technology-insight-reports)
- [Quantensensorik: endgültiger Bericht](https://link.epo.org/web/patent_insight_report-quantum_metrology_and_sensing_en.pdf)
- [Quantensensorik: Diagramme und Originalarbeitsmappen](https://link.epo.org/web/insights-quantum_metrology_and_sensing_en.pptx)
- [Raumfahrt: endgültiger Bericht](https://link.epo.org/web/patent_insight_report-cosmonautics_en.pdf)
- [Raumfahrt: Diagramme und Originalarbeitsmappen](https://link.epo.org/web/data_mapping_of_cosmonautics_graphs_and_datasets_en.pptx)

Quellenangaben bleiben EPA beziehungsweise EPA/ESPI/ESA. Deutsche Erläuterungen
und die Darstellung stammen von Personal Macro. Eine Lizenz neuerer Berichte
wird nicht auf diese älteren Veröffentlichungen übertragen.
