/** Editorial source review, not observation coverage or proof of a working import. */
import sdg from "./data/sdg-catalog.json";
import statistics from "./data/statistics-catalog.json";
import publicSeries from "./data/public-series-catalog.json";
export const topicResearchReviewedAt = "2026-09-09";

const topicResearchSourceLibrary: Record<
  string,
  { label: string; url: string; finding: string }
> = {
  earnings: {
    label: "ILOSTAT · Verdienste und Arbeitseinkommen",
    url: "https://ilostat.ilo.org/topics/wages/",
    finding:
      "Der Katalog unterscheidet unter anderem Stundenverdienste, Mindestlöhne und Verteilungsmaße. Landeswährung, Beschäftigtenkreis und Erhebung gehören zur Definition.",
  },
  hours: {
    label: "ILOSTAT · Löhne und Arbeitszeit: Definitionen",
    url: "https://ilostat.ilo.org/methods/concepts-and-definitions/description-wages-and-working-time-statistics/",
    finding:
      "Die COND-Dokumentation erläutert Lohn- und Arbeitszeitstatistiken. Die Dokumentation wurde über den offiziellen Suchindex geprüft; der direkte Seitenabruf war nicht erfolgreich.",
  },
  informal: {
    label: "ILOSTAT · Informelle Wirtschaft",
    url: "https://ilostat.ilo.org/topics/informality/",
    finding:
      "Die ILO beschreibt neue Messstandards von 2023 und verschiedene Erhebungsgrundlagen. Alte und neue Definitionen müssen vor einem Zeitvergleich abgegrenzt werden.",
  },
  icp: {
    label: "Weltbank · International Comparison Program",
    url: "https://www.worldbank.org/en/programs/icp/brief/ICP2021",
    finding:
      "Der ICP-Stand 2021 umfasst Kaufkraftparitäten, Preisniveaus und Ausgabenkomponenten. Referenzjahr, Revisionen und Fortschreibungen sind unterschiedliche Datenarten.",
  },
  dsr: {
    label: "BIS · Debt service ratios",
    url: "https://data.bis.org/topics/DSR",
    finding:
      "Quartalsmodelle messen den für Zins und Tilgung verwendeten Einkommensanteil. Die BIS empfiehlt vor allem zeitliche Vergleiche innerhalb eines Landes; absolute Länderniveaus sind weniger gut vergleichbar.",
  },
  findex: {
    label: "Weltbank · Global Findex 2025",
    url: "https://www.worldbank.org/en/publication/globalfindex/download-data",
    finding:
      "Kostenlose Länderdateien enthalten Befragungen zu Konten, Zahlungen und finanzieller Widerstandsfähigkeit. Verfügbare Erhebungsjahre sind 2011, 2014, 2017, 2021 und 2024, je nach Indikator.",
  },
  etf: {
    label: "EODHD · ETF-Datenfelder",
    url: "https://eodhd.com/financial-academy/financial-faq/fundamentals-glossary-etf",
    finding:
      "Die Dokumentation führt Fondsbestandteile, Sektorgewichte und Performance auf. Eine Feldbeschreibung belegt weder eine lange Historie der Zusammensetzung noch die Berechtigung des vorhandenen Tarifs.",
  },
  fuels: {
    label: "IEA · Renewables 2024 Dataset",
    url: "https://www.iea.org/data-and-statistics/data-product/renewables-2024-dataset",
    finding:
      "Das Angebot trennt erneuerbaren Strom, Brennstoffe und Wärme sowie Geschichte und Prognosen. Es enthält zusätzliche Premiumdaten und hat eigene Nutzungsbedingungen; kein pauschal freier Gesamtdownload.",
  },
  storage: {
    label: "IEA · Electricity 2026",
    url: "https://www.iea.org/reports/electricity-2026",
    finding:
      "Der frühere IEA-Einstieg zu großen Stromspeichern leitet auf diesen Strombericht weiter. Ein stabiler separater Länderexport zu Batteriespeichern ist damit noch nicht geprüft.",
  },
  heat: {
    label: "IEA · Renewables in District Energy 2026",
    url: "https://www.iea.org/reports/renewables-in-district-energy",
    finding:
      "Der öffentliche Bericht behandelt regionale Wärmenetze, Brennstoffmix, große Wärmepumpen und Wärmespeicher. Er trägt CC BY 4.0; er ersetzt keinen geprüften weltweiten Bestandsdatensatz.",
  },
  investment: {
    label: "IEA · Investment Data Explorer 2026",
    url: "https://www.iea.org/data-and-statistics/data-tools/investment-data-explorer",
    finding:
      "Der Explorer stellt Energieinvestitionen mit eigener Methodendokumentation und CC BY 4.0 bereit. Sektor, Gebiet, Preisbasis und Schätzstatus müssen für eine Übernahme geprüft werden.",
  },
  minerals: {
    label: "USGS · Mineral Commodity Summaries 2026",
    url: "https://pubs.usgs.gov/publication/mcs2026",
    finding:
      "Die amtliche Veröffentlichung enthält getrennte Rohstoffkapitel. Länderproduktion, Reserven, Handelsdaten und Preise haben verschiedene Einheiten und dürfen keine gemeinsame Ersatzreihe bilden.",
  },
  resources: {
    label: "UNEP / IRP · Global Resources Outlook 2024",
    url: "https://www.unep.org/resources/Global-Resource-Outlook-2024",
    finding:
      "Der Bericht verbindet Ressourcenstatistik, Modelle und Umweltwirkungen. Er ist ein belegter Einstieg; eine jährliche Recyclingquote je Land ist daraus noch nicht als Reihe geprüft.",
  },
  unctad: {
    label: "UNCTAD · Data Centre",
    url: "https://unctadstat.unctad.org/datacentre/",
    finding:
      "Der Katalog führt Warenhandel, Dienstleistungshandel, digitale Wirtschaft, Onlinehandel und Konzentrationsindizes. Die Messgrößen verwenden unterschiedliche Abgrenzungen; ein Katalogeintrag garantiert keine Länderwerte.",
  },
  datacentres: {
    label: "UNCTAD · Rechenzentren und Investitionen",
    url: "https://unctad.org/news/data-centres-are-reshaping-global-investment-landscape",
    finding:
      "Die Auswertung vom Januar 2026 behandelt angekündigte ausländische Neuinvestitionen. Ankündigungen sind weder realisierte Ausgaben noch ein Bestand betriebener Rechenzentren.",
  },
  cyber: {
    label: "ITU · Global Cybersecurity Index 2024",
    url: "https://www.itu.int/epublications/publication/global-cybersecurity-index-2024",
    finding:
      "Die ITU bewertet nationale Maßnahmen in mehreren Bereichen. Die Ausgabe erläutert Methodenänderungen; sie misst nicht den Umsatz von Sicherheitsfirmen oder einfach die Zahl erfolgreicher Angriffe.",
  },
  ai: {
    label: "OECD.AI · Trends und Daten",
    url: "https://oecd.ai/en/trends-and-data",
    finding:
      "Die OECD bietet getrennte Perspektiven auf Forschung, Investitionen, Arbeit, Software, Rechenkapazität und Patente. Eine einheitliche Messung des schnell veränderlichen KI-Feldes bleibt anspruchsvoll.",
  },
  robots: {
    label: "IFR · World Robotics",
    url: "https://ifr.org/worldrobotics/",
    finding:
      "Die Seite bietet detaillierte Länder-, Branchen- und historische Daten als kostenpflichtiges Produkt an. Öffentlich beschriebene Ergebnisse sind kein freier Ersatz für die gesamte Datenhistorie.",
  },
  quantum: {
    label: "WIPO · PATENTSCOPE-Webinar: Quanten-Suchbeispiel",
    url: "https://www.wipo.int/edocs/mdocs/webinars/en/wipo_webinar_patentscope_2025_14/wipo_webinar_patentscope_2025_14_1.pdf",
    finding:
      "Die offiziellen Schulungsfolien enthalten ein abgegrenztes Suchbeispiel zu Quantencomputing. Suchabfrage, Patentdatum und Herkunft sind Teil des Ergebnisses; dies ist noch keine vollständige Marktstatistik.",
  },
  patentFields: {
    label: "WIPO · IPC und Technologiefelder",
    url: "https://www.wipo.int/edocs/mdocs/classifications/en/ipc_ce_41/ipc_ce_41_5-main1.pdf",
    finding:
      "Die Methodengrundlage ordnet Patentklassen breiten Technologiefeldern zu. Diese Einteilung ist kein Verzeichnis aller heutigen Spezialmärkte und keine Bewertung ihrer Unternehmen.",
  },
  space: {
    label: "OECD · The Space Economy at a Glance 2026",
    url: "https://www.oecd.org/en/publications/the-space-economy-at-a-glance-2026_cbf9b240-en.html",
    finding:
      "Die neue Veröffentlichung untersucht Raumfahrtwirtschaft und ihre wirtschaftlichen Verflechtungen. Länderabgrenzung und einzelne Indikatoren benötigen eine eigene Datenprüfung vor einer langen Vergleichsreihe.",
  },
  housing: {
    label: "OECD · Affordable Housing Database",
    url: "https://www.oecd.org/en/data/datasets/oecd-affordable-housing-database.html",
    finding:
      "Die Datenbank enthält Wohnungsbestand, Bau, Preise und Wohnbedingungen für OECD-, EU- und ausgewählte Partnerländer. Einzelindikatoren erläutern Definitionen und Vergleichsgrenzen.",
  },
  commercial: {
    label: "BIS · Commercial Property Prices",
    url: "https://data.bis.org/topics/CPP",
    finding:
      "Nominale Gewerbeimmobilienreihen sind verfügbar. Die BIS warnt vor erheblichen Unterschieden bei Gebäudetyp, räumlicher Abdeckung, Frequenz und Berechnung zwischen Ländern.",
  },
  tourism: {
    label: "UN Tourism über WDI · Ankünfte: Definition",
    url: "https://databank.worldbank.org/metadataglossary/world-development-indicators/series/ST.INT.ARVL",
    finding:
      "Die Metadaten nennen 1995–2020 als Referenzperiode. Länder zählen teils Grenzankünfte, Hotelgäste oder breitere Besuchergruppen. Gezählt werden Reisen, nicht eindeutige Menschen.",
  },
  transport: {
    label: "ITF / OECD · Transport Data Dashboard",
    url: "https://www.itf-oecd.org/transport-data-dashboard",
    finding:
      "Der offizielle Suchindex beschreibt Indikatoren zur Infrastruktur für Land-, Luft- und Wasserverkehr. Der direkte Seitenabruf scheiterte; der Datenexport und seine Länderabdeckung sind noch ungeprüft.",
  },
  transit: {
    label: "UN SDG 11.2.1 · Zugang zum öffentlichen Verkehr",
    url: "https://unstats.un.org/sdgs/metadata/files/Metadata-11-02-01.pdf",
    finding:
      "Die Methodendokumentation behandelt den Zugang der Bevölkerung zum öffentlichen Verkehr. Räumliche Erreichbarkeit ist eine andere Größe als Fahrgastzahl, Netzausbau oder Verkehrsumsatz.",
  },
  ev: {
    label: "IEA · Global EV Data Explorer 2026",
    url: "https://www.iea.org/data-and-statistics/data-tools/global-ev-data-explorer?os=0",
    finding:
      "Der öffentliche Explorer mit Datendownload und CC BY 4.0 unterscheidet Fahrzeugverkäufe, Bestand und Ladeinfrastruktur. Historie und Projektionen müssen getrennt übernommen werden.",
  },
  ppi: {
    label: "Weltbank · PPI-Methodik",
    url: "https://ppi.worldbank.org/en/methodology/ppi-methodology",
    finding:
      "Die Quelle erfasst Projekte mit privater Beteiligung in Ländern mit niedrigen und mittleren Einkommen. Meist werden zugesagte Gesamtinvestitionen beim Finanzierungsabschluss erfasst, keine jährlichen tatsächlichen Gesamtausgaben.",
  },
  tiva: {
    label: "OECD · Trade in Value Added",
    url: "https://www.oecd.org/en/topics/sub-issues/trade-in-value-added.html",
    finding:
      "TiVA untersucht Wertschöpfungsursprünge und Produktionsverflechtungen auf Grundlage harmonisierter Input-Output-Tabellen. Das unterscheidet sich von Grenzübertritten einzelner Waren.",
  },
  tax: {
    label: "OECD · Global Revenue Statistics",
    url: "https://www.oecd.org/en/data/dashboards/global-revenue-statistics.html",
    finding:
      "Die öffentliche Übersicht unterscheidet Steuerarten und staatliche Ebenen. Anteil am BIP, Anteil am gesamten Steueraufkommen und Geldbetrag sind getrennte Perspektiven.",
  },
  governance: {
    label: "Weltbank · Worldwide Governance Indicators",
    url: "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
    finding:
      "Die Revision 2025 verwendet Wahrnehmungsdaten und überarbeitete historische Schätzungen. Standardisierte Maße und eine neue Skala mit festen Referenzpunkten dürfen nicht mit alten Veröffentlichungen vermischt werden.",
  },
  poverty: {
    label: "Weltbank · Aktualisierung der Armutsgrenzen 2025",
    url: "https://www.worldbank.org/en/news/factsheet/2025/06/05/june-2025-update-to-global-poverty-lines",
    finding:
      "Die internationalen Armutsgrenzen wurden auf Kaufkraftparitäten von 2021 umgestellt. Ältere Kaufkraftstände und nationale Grenzen bleiben andere Definitionen; Ländererhebungen können zusätzlich brechen.",
  },
  conflict: {
    label: "Uppsala University · UCDP Download Center",
    url: "https://ucdp.uu.se/downloads/",
    finding:
      "Kostenlose Daten mit Codebooks trennen Konfliktjahre und einzelne Gewaltereignisse. Historische Jahresdaten und vorläufige monatliche Ereignisse besitzen eigene Versionen und Abgrenzungen.",
  },
  monetary: {
    label: "IMF · AREAER-Veröffentlichungen",
    url: "https://www.elibrary.imf.org/subject/012",
    finding:
      "Die Berichte behandeln Wechselkursarrangements, Zahlungsbeschränkungen und geldpolitische Rahmen. Die gesonderte AREAER-Datenbank meldete bei der Prüfung einen erforderlichen Zugang; keine freie Gesamthistorie zugesagt.",
  },
  carbon: {
    label: "WDI · CO₂ je kaufkraftbereinigter Wirtschaftsleistung",
    url: "https://databank.worldbank.org/metadataglossary/world-development-indicators/series/EN.ATM.CO2E.PP.GD.KD",
    finding:
      "Die Metadaten beschreiben fossile CO₂- und Zementemissionen je BIP auf Kaufkraftbasis 2021. Diese Quellenabgrenzung ist nicht automatisch mit der bereits angebundenen Emissionsreihe identisch.",
  },
  biodiversity: {
    label: "UN SDG 15.5.1 · Red List Index",
    url: "https://unstats.un.org/sdgs/metadata/files/Metadata-15-05-01.pdf",
    finding:
      "Der Indikator beschreibt Veränderungen des Aussterberisikos bewerteter Arten. Er ist weder eine vollständige Artenzählung noch allein ein Maß der örtlichen Ökosystemqualität.",
  },
  climate: {
    label: "University of Notre Dame · ND-GAIN-Methodik",
    url: "https://gain.nd.edu/our-work/country-index/methodology/",
    finding:
      "ND-GAIN trennt Verwundbarkeit und Bereitschaft zur Anpassung. Zusammengesetzte Indizes benötigen ihre Gewichtung und Eingangsgrößen; sie sind keine direkten Schadensmessungen.",
  },
};

export interface AtlasTopicResearch {
  topicId: string;
  meaning: string;
  finding: string;
  boundary: string;
  sourceIds: string[];
  /** Existing WDI pictures offered only as explicitly complementary context. */
  contextCodes?: string[];
}

const topicResearchFindings: AtlasTopicResearch[] = [
  {
    topicId: "labor:wages",
    meaning:
      "Wie verändert sich, was Menschen mit ihrem Arbeitslohn kaufen können?",
    finding:
      "ILOSTAT bietet Verdienstreihen. Für ein Reallohnbild fehlen hier noch ein passender Preisindex und eine über die Zeit vergleichbare Beschäftigtengruppe.",
    boundary:
      "Stunden- und Monatslohn, brutto und netto sowie Mindest- und Durchschnittslohn bleiben getrennt. Die ergänzende Preisentwicklung allein misst keinen Reallohn.",
    sourceIds: ["earnings"],
    contextCodes: ["FP.CPI.TOTL.ZG"],
  },
  {
    topicId: "labor:informal_work",
    meaning:
      "Wie viel Arbeit findet außerhalb formeller Absicherung und Registrierung statt?",
    finding:
      "Die ILO führt eigene Informalitätsstatistiken. Die Definitionen und ihre Umstellung sind noch nicht für vergleichbare Länderbilder übernommen.",
    boundary:
      "Informelle Tätigkeit ist weder gleichbedeutend mit Arbeitslosigkeit noch mit Selbstständigkeit. Beschäftigung im informellen Sektor und informelle Beschäftigung sind unterschiedliche Abgrenzungen.",
    sourceIds: ["informal"],
  },
  {
    topicId: "labor:working_hours",
    meaning: "Wie viel Zeit verbringen Erwerbstätige mit bezahlter Arbeit?",
    finding:
      "ILOSTAT dokumentiert Arbeitszeitmaße. Ein Länderbild benötigt noch die geprüfte Unterscheidung zwischen tatsächlich geleisteter und üblicher Arbeitszeit.",
    boundary:
      "Wochen- und Jahresstunden sowie Vollzeit und alle Beschäftigten sind nicht austauschbar. Leistung je Erwerbstätigem enthält keine Stundenkorrektur.",
    sourceIds: ["hours"],
    contextCodes: ["SL.GDP.PCAP.EM.KD"],
  },
  {
    topicId: "macro:purchasing_power",
    meaning:
      "Wie viel lässt sich mit Einkommen in unterschiedlichen Ländern tatsächlich kaufen?",
    finding:
      "Der ICP bietet passende Kaufkraft- und Preisniveauvergleiche. Die einzelnen Ausgabenkomponenten und Veröffentlichungsstände sind noch nicht als eigene Bilder übernommen.",
    boundary:
      "Ein Kaufkraftvergleich ist kein Wechselkursziel. Referenzjahre und Fortschreibungen bilden keine automatisch gemessene Jahreswelle.",
    sourceIds: ["icp"],
  },
  {
    topicId: "finance:debt_service",
    meaning: "Wie viel des Einkommens wird durch Zins und Tilgung gebunden?",
    finding:
      "Die BIS veröffentlicht eigene Schuldendienstmodelle. Diese Reihe ist noch nicht angebunden; die vorhandene Kreditquote zeigt ergänzend den Schuldenbestand.",
    boundary:
      "Ein hoher Schuldenbestand bedeutet nicht automatisch einen hohen laufenden Schuldendienst. Die BIS-Modelle eignen sich vor allem für Veränderungen innerhalb eines Landes.",
    sourceIds: ["dsr"],
    contextCodes: ["FS.AST.PRVT.GD.ZS"],
  },
  {
    topicId: "market_context:relative_strength",
    meaning:
      "Entwickelt sich ein Sektor stärker oder schwächer als sein Vergleichsmarkt?",
    finding:
      "Vorhandene Fondsreihen können Ausgangsdaten liefern. Ein ausdrücklich passender Vergleichsmarkt und ein geprüftes Rezept für die relative Entwicklung fehlen noch.",
    boundary:
      "Beide Seiten benötigen denselben Kalender, dieselbe Währung und dieselbe Ausschüttungsbehandlung. Die Höhe zweier eigener Marktwellen ist keine relative Rendite.",
    sourceIds: ["etf"],
  },
  {
    topicId: "market_context:market_concentration",
    meaning:
      "Wie stark wird ein Börsenmarkt von wenigen großen Unternehmen geprägt?",
    finding:
      "EODHD beschreibt Fondsgewichte und Bestandteile. Historische Zusammensetzungen, Tarifzugang und ein zur Frage passender Fonds sind noch nicht geprüft.",
    boundary:
      "Heutige Fondsgewichte dürfen keine frühere Zusammensetzung ersetzen. Börsenkonzentration misst weder Wettbewerb in der gesamten Wirtschaft noch faire Bewertung.",
    sourceIds: ["etf"],
  },
  {
    topicId: "fuels:bioenergy",
    meaning:
      "Wie werden biogene Rohstoffe als Brennstoff, Wärmequelle und Energiequelle genutzt?",
    finding:
      "Die IEA trennt biogene Brennstoffe nach Verwendungszweck. Eine Gesamtansicht über Wärme, Verkehr und Strom ist noch nicht angebunden.",
    boundary:
      "Die vorhandenen Strombilder zu Bioenergie zeigen nur elektrische Erzeugung. Traditionelle Biomassenutzung, moderne Brennstoffe und Nachhaltigkeit sind eigene Fragen.",
    sourceIds: ["fuels"],
  },
  {
    topicId: "fuels:synthetic_fuels",
    meaning: "Wie entwickelt sich die Herstellung synthetischer Energieträger?",
    finding:
      "IEA-Veröffentlichungen behandeln E-Fuels; manche Tabellen fassen sie mit erneuerbarem Wasserstoff zusammen. Eine eigene historische Länderreihe ist noch nicht geprüft.",
    boundary:
      "Angekündigte Projekte, installierte Produktionsleistung und tatsächlich erzeugter Kraftstoff bleiben getrennt. Ein Szenario ist kein beobachteter Ausbau.",
    sourceIds: ["fuels"],
  },
  {
    topicId: "energy_systems:battery_storage",
    meaning:
      "Wie wächst die Fähigkeit eines Stromsystems, Energie zeitweise in Batterien zu speichern?",
    finding:
      "Der IEA-Quelleneinstieg wurde geprüft. Eine belastbare eigene Länderhistorie für stationäre Batteriespeicher ist im Atlas noch offen.",
    boundary:
      "Leistung, Speichermenge und Batteriefabriken sind drei verschiedene Größen. Fahrzeugbatterien dürfen nicht als Netzspeicherbestand erscheinen.",
    sourceIds: ["storage", "investment"],
  },
  {
    topicId: "energy_systems:heat_pumps",
    meaning: "Wie verbreitet sich das Heizen mit Wärmepumpen?",
    finding:
      "Der IEA-Bericht zu Wärmenetzen behandelt auch große Wärmepumpen. Er reicht noch nicht als geprüfte Länderhistorie aller verkauften oder betriebenen Anlagen.",
    boundary:
      "Verkauf und Bestand sowie Haushaltsgeräte und große Wärmenetzanlagen bleiben getrennt. Allgemeine Energieeffizienz ist nur ergänzender Kontext.",
    sourceIds: ["heat"],
    contextCodes: ["EG.EGY.PRIM.PP.KD"],
  },
  {
    topicId: "energy_systems:district_heating",
    meaning: "Wie versorgen gemeinsame Netze Gebäude mit Wärme?",
    finding:
      "Ein öffentlicher IEA-Bericht enthält regionale Perspektiven. Anschlusszahlen, abgegebene Wärme und Brennstoffmix benötigen noch eigene Zeitreihen.",
    boundary:
      "Elektrische Kraftwerksleistung kann keine Wärmeversorgung messen. Quellenregionen und einzelne große Netze dürfen keine vollständige Landesabdeckung vortäuschen.",
    sourceIds: ["heat"],
  },
  {
    topicId: "energy_systems:energy_investment",
    meaning: "In welche Teile des Energiesystems fließt neues Kapital?",
    finding:
      "Der IEA-Investment-Explorer bietet passende öffentliche Daten. Die Übernahme nach Technologie, Gebiet und Preisbasis ist noch offen.",
    boundary:
      "Ausgaben, Finanzierungszusagen und Börsenwerte sind verschiedene Größen. Jüngste Schätzungen benötigen eine sichtbare Kennzeichnung.",
    sourceIds: ["investment"],
  },
  {
    topicId: "industry:cement",
    meaning: "Wie entwickelt sich die Herstellung des Baustoffs Zement?",
    finding:
      "USGS veröffentlicht ein eigenes Zementkapitel. Produktion, Kapazität und unterschiedliche historische Landesabgrenzungen sind noch nicht als Atlasreihe geprüft.",
    boundary:
      "Zement, Klinker und Beton sind nicht dieselbe Produktmenge. Die gesamte Bauwirtschaft ist kein Ersatz für den Zementsektor.",
    sourceIds: ["minerals"],
  },
  {
    topicId: "materials:lithium",
    meaning: "Wie verändern sich Förderung und verfügbare Lithiumversorgung?",
    finding:
      "USGS bietet ein eigenes Lithiumkapitel. Die Länder- und Einheitendefinitionen benötigen vor einer langen Datenansicht einen Abgleich.",
    boundary:
      "Lithiumgehalt, Lithiumcarbonat-Äquivalent, Erzmenge und Reserven sind getrennte Größen. Ressourcen sagen nichts über einen fairen Rohstoffpreis aus.",
    sourceIds: ["minerals"],
  },
  {
    topicId: "materials:rare_earths",
    meaning:
      "Wo werden Seltene Erden gewonnen und wie verändert sich die Versorgung?",
    finding:
      "Das USGS-Kapitel ist ein konkreter Ausgangspunkt. Förderung, Verarbeitung und einzelne chemische Formen sind noch nicht als Länderbilder übernommen.",
    boundary:
      "Seltene Erden umfassen mehrere Elemente. Ein Mengenaggregat darf keine einheitliche Preis- oder Bewertungswelle vortäuschen.",
    sourceIds: ["minerals"],
  },
  {
    topicId: "materials:recycling",
    meaning: "Welcher Teil verwendeter Materialien wird erneut genutzt?",
    finding:
      "UNEP/IRP liefert einen öffentlichen Überblick über Materialflüsse. Eine vergleichbare Reihe nach Materialart und Rückgewinnungsdefinition ist hier noch offen.",
    boundary:
      "Gesammelter Abfall, tatsächlich recycelte Menge und Recyclinganteil im neuen Produkt haben verschiedene Nenner.",
    sourceIds: ["resources"],
  },
  {
    topicId: "digital:cloud",
    meaning:
      "Wie entwickelt sich die Infrastruktur hinter Cloud-Diensten und Rechenzentren?",
    finding:
      "UNCTAD beschreibt angekündigte Investitionen in Rechenzentren. Diese Quelle belegt noch keinen einheitlichen historischen Bestand oder Cloud-Umsatz je Land.",
    boundary:
      "Ankündigungen, betriebene Serverleistung, Stromverbrauch und bezahlte Cloud-Dienste müssen getrennt bleiben.",
    sourceIds: ["datacentres", "ai"],
  },
  {
    topicId: "digital:cybersecurity",
    meaning: "Wie bauen Länder Fähigkeiten zum Schutz digitaler Systeme auf?",
    finding:
      "Der ITU-Index bietet eine belegte Perspektive auf nationale Schutzmaßnahmen. Methodenstände und ihre Vergleichbarkeit sind noch nicht als Atlasansicht übernommen.",
    boundary:
      "Die Maßnahmenbewertung misst keinen fairen Wert der Cybersicherheitsbranche und keine garantierte Sicherheit. Neue Ausgaben können eine andere Skala verwenden.",
    sourceIds: ["cyber"],
  },
  {
    topicId: "digital:digital_platforms",
    meaning:
      "Wie verbreiten sich digitale Vermittler zwischen Anbietern und Nutzern?",
    finding:
      "UNCTAD führt Daten zur digitalen Wirtschaft und zum Onlinehandel. Eine abgegrenzte lange Länderreihe speziell zu Plattformen ist noch nicht geprüft.",
    boundary:
      "Plattformumsatz, vermittelte Warenwerte und aktive Nutzer sind verschiedene Größen. Der Firmensitz ist nicht automatisch der Ort der wirtschaftlichen Nutzung.",
    sourceIds: ["unctad"],
  },
  {
    topicId: "innovation:artificial_intelligence",
    meaning:
      "Wie entwickeln sich Forschung, Nutzung und wirtschaftliche Aktivität rund um KI?",
    finding:
      "OECD.AI bietet mehrere passende Datenperspektiven. Eine Definition und geprüfte Historie je Perspektive fehlen noch; allgemeine Forschungsausgaben sind nur Kontext.",
    boundary:
      "Patente, Modelle, Rechenkapazität und Investitionen messen unterschiedliche Vorgänge. Kein einzelnes dieser Bilder ist eine Bewertung des gesamten KI-Markts.",
    sourceIds: ["ai"],
    contextCodes: ["GB.XPD.RSDV.GD.ZS"],
  },
  {
    topicId: "innovation:robotics",
    meaning: "Wie verbreiten sich Roboter in Produktion und Dienstleistungen?",
    finding:
      "Die IFR bietet eine detaillierte historische Datenbank kostenpflichtig an. Eine ausreichend breite frei nutzbare Ersatzhistorie ist noch nicht geprüft.",
    boundary:
      "Neue Installationen, laufender Bestand und Roboterdichte haben verschiedene Bedeutungen. Einzelne Pressezahlen ergeben keine durchgehende Länderwelle.",
    sourceIds: ["robots"],
  },
  {
    topicId: "innovation:quantum",
    meaning: "Wie entwickelt sich Forschung zu Quantentechnologien?",
    finding:
      "Ein offizielles WIPO-Suchbeispiel ist vorhanden. Eine reproduzierbare Abgrenzung von Quantencomputing, Kommunikation und Sensorik als historische Reihe ist noch offen.",
    boundary:
      "Eine breite Patentklasse oder das Wort Quantum allein identifiziert keinen vollständigen Sektor. Patente sind keine Umsätze oder nachgewiesene technische Leistungsfähigkeit.",
    sourceIds: ["quantum"],
  },
  {
    topicId: "innovation:space_technology",
    meaning:
      "Wie entwickeln sich Raumfahrttechnik und darauf aufbauende wirtschaftliche Anwendungen?",
    finding:
      "Der OECD-Bericht 2026 bietet einen aktuellen Einstieg. Die einzelnen Länderindikatoren sind noch nicht als zusammenhängende Datenbilder übernommen.",
    boundary:
      "Startsysteme, Satelliten, Bodentechnik und nachgelagerte Dienste bilden unterschiedliche Märkte. Startzahlen allein messen keinen wirtschaftlichen Gesamtwert.",
    sourceIds: ["space"],
  },
  {
    topicId: "innovation:advanced_materials",
    meaning:
      "Wie entstehen neue Werkstoffe mit besonderen technischen Eigenschaften?",
    finding:
      "Die vorhandene WIPO-Klassifikation umfasst breite Technologiefelder. Eine gesonderte, nachvollziehbare Auswahl moderner Werkstoffe ist noch nicht definiert.",
    boundary:
      "Chemie- oder Metallurgiepatente insgesamt dürfen nicht als ausschließlich neue Materialien erscheinen. Forschung und kommerzielle Nutzung sind getrennt.",
    sourceIds: ["patentFields"],
    contextCodes: ["GB.XPD.RSDV.GD.ZS"],
  },
  {
    topicId: "housing:rents",
    meaning: "Wie verändern sich die Kosten gemieteter Wohnungen?",
    finding:
      "Die OECD-Wohndaten sind ein konkreter Ausgangspunkt. Eigene Mietreihen mit geprüfter Abgrenzung sind noch nicht übernommen.",
    boundary:
      "Neuvertrags- und Bestandsmieten sowie Preisindex und absolute Monatsmiete sind verschieden. Das vorhandene Kaufpreis-Miet-Verhältnis ist kein Mietpreisniveau.",
    sourceIds: ["housing"],
  },
  {
    topicId: "housing:housing_supply",
    meaning: "Wie verändert sich der Bestand verfügbarer Wohnungen?",
    finding:
      "Die OECD führt Wohnungsbestand und Bautätigkeit. Ihre Länderdefinitionen und Zeiträume sind noch nicht als eigene Atlasbilder geprüft.",
    boundary:
      "Genehmigungen, Baubeginne, Fertigstellungen, Bestand und tatsächlich verfügbare Wohnungen sind getrennte Schritte.",
    sourceIds: ["housing"],
    contextCodes: ["SP.URB.TOTL.IN.ZS"],
  },
  {
    topicId: "housing:commercial_property",
    meaning: "Wie verändern sich Preise gewerblich genutzter Immobilien?",
    finding:
      "Die BIS bietet Gewerbeimmobilienreihen an. Wegen ihrer unterschiedlichen Objekt- und Gebietsabgrenzungen ist die Übernahme noch offen.",
    boundary:
      "Büros, Einzelhandel, Gewerbeflächen und Industriestandorte dürfen nicht ungeprüft als gleichartige Landesmärkte verglichen werden.",
    sourceIds: ["commercial"],
  },
  {
    topicId: "housing:logistics_property",
    meaning: "Wie entwickelt sich der Markt für Lager- und Logistikgebäude?",
    finding:
      "BIS-Gewerbeimmobiliendaten sind ein Quellenkandidat. Ob sie für ein Land einen passenden eigenen Logistikbereich enthalten, ist noch nicht geprüft.",
    boundary:
      "Allgemeine Industrie- oder Gewerbeimmobilien sind kein genauer Ersatz. Miete, Kaufpreis, Leerstand und Neubau bleiben verschiedene Bilder.",
    sourceIds: ["commercial"],
  },
  {
    topicId: "consumer_services:ecommerce",
    meaning:
      "Wie verlagert sich der Handel zu digital bestellten Waren und Dienstleistungen?",
    finding:
      "UNCTAD führt eigene Datensätze zu Onlineverkäufen und digital bestelltem grenzüberschreitendem Handel. Sie sind noch nicht als Atlasbilder übernommen.",
    boundary:
      "Digital bestellt ist nicht automatisch digital geliefert. Geschäftskunden, Privatkunden sowie Inlands- und Auslandsgeschäft benötigen getrennte Nenner.",
    sourceIds: ["unctad", "findex"],
  },
  {
    topicId: "consumer_services:tourism",
    meaning: "Wie verändert sich der Reiseverkehr in ein Land?",
    finding:
      "Die WDI-Metadaten enthalten eine konkrete UN-Tourism-Reihe. Der ältere Referenzzeitraum und unterschiedliche nationale Zählweisen müssen vor einer Datenansicht geprüft werden.",
    boundary:
      "Ankünfte sind Reisen, nicht eindeutige Personen. Flugpassagiere und Hotelgäste dürfen nicht stillschweigend eine vollständige Tourismusreihe ersetzen.",
    sourceIds: ["tourism"],
  },
  {
    topicId: "consumer_services:professional_services",
    meaning: "Wie entwickeln sich Dienstleistungen für Unternehmen?",
    finding:
      "UNCTAD unterscheidet Dienstleistungskategorien im Außenhandel. Eine eigene Länderreihe für die gesamte heimische Unternehmensdienstleistung ist noch nicht geprüft.",
    boundary:
      "Die gesamte Dienstleistungswertschöpfung zeigt nur den wirtschaftlichen Kontext. Sie enthält auch viele andere Tätigkeiten; Außenhandel ist nicht die gesamte Produktion.",
    sourceIds: ["unctad"],
    contextCodes: ["NV.SRV.TOTL.ZS"],
  },
  {
    topicId: "consumer_services:personal_services",
    meaning:
      "Wie entwickeln sich Dienstleistungen unmittelbar für Menschen und Haushalte?",
    finding:
      "Die vorhandenen Branchenklassifikationen fassen mehrere persönliche Dienste zusammen. Eine klar abgegrenzte eigene Zeitreihe fehlt noch.",
    boundary:
      "Beschäftigung, Wertschöpfung und grenzüberschreitender Handel sind unterschiedliche Perspektiven. Der gesamte Dienstleistungsbereich bleibt nur ergänzender Kontext.",
    sourceIds: ["unctad"],
    contextCodes: ["NV.SRV.TOTL.ZS"],
  },
  {
    topicId: "transport:roads",
    meaning: "Wie entwickelt sich die Straßeninfrastruktur eines Landes?",
    finding:
      "Das ITF-Dashboard ist ein konkreter Quellenkandidat. Sein direkter Abruf und der passende Export konnten noch nicht erfolgreich geprüft werden.",
    boundary:
      "Netzlänge, Fahrleistung, Belag und Straßenqualität sind verschiedene Größen. Unterschiedliche Straßenklassen dürfen nicht stillschweigend zusammengeführt werden.",
    sourceIds: ["transport"],
  },
  {
    topicId: "transport:public_transport",
    meaning:
      "Wie gut können Menschen Busse, Bahnen und andere öffentliche Verkehrsmittel erreichen?",
    finding:
      "UN SDG 11.2.1 dokumentiert eine passende Zugangsperspektive. Die räumlichen Erhebungen und verfügbaren Städte sind noch nicht als Atlasbilder übernommen.",
    boundary:
      "Eine Stadterhebung ist kein gesamter Landeswert. Nähe zur Haltestelle misst nicht automatisch Takt, Zuverlässigkeit oder Erschwinglichkeit.",
    sourceIds: ["transit"],
  },
  {
    topicId: "transport:electric_vehicles",
    meaning:
      "Wie verändert sich die Verbreitung elektrisch angetriebener Fahrzeuge?",
    finding:
      "Der IEA-EV-Explorer enthält einen öffentlichen Datendownload. Fahrzeugtypen, historische Werte und Szenarien sind noch nicht als eigene Atlasansicht übernommen.",
    boundary:
      "Bestand, neue Verkäufe und Marktanteile bleiben getrennt. Rein elektrische Fahrzeuge und Plug-in-Hybride sind keine identische Kategorie.",
    sourceIds: ["ev"],
  },
  {
    topicId: "transport:charging",
    meaning: "Wie wächst die Infrastruktur zum Laden elektrischer Fahrzeuge?",
    finding:
      "Der IEA-EV-Explorer enthält Ladeinfrastruktur als eigene Perspektive. Die Definition der Ladepunkte und ihre Länderhistorien benötigen noch einen Abgleich.",
    boundary:
      "Öffentlich und privat, schnell und langsam sowie Standorte, Anschlüsse und Ladeleistung dürfen nicht vermischt werden.",
    sourceIds: ["ev"],
  },
  {
    topicId: "transport:infrastructure_spending",
    meaning:
      "Wie viel wird in Verkehrs- und Versorgungsinfrastruktur investiert?",
    finding:
      "ITF und Weltbank PPI liefern unterschiedliche Teilperspektiven. Eine vollständige, vergleichbare jährliche Gesamtausgabe ist damit noch nicht geprüft.",
    boundary:
      "PPI erfasst überwiegend Projektzusagen mit privater Beteiligung, einschließlich öffentlicher Anteile. Das ist weder nur privates Geld noch die gesamte öffentliche Infrastrukturinvestition.",
    sourceIds: ["ppi", "transport"],
  },
  {
    topicId: "trade:trade_partners",
    meaning:
      "Mit welchen Ländern ist eine Wirtschaft über den Handel verbunden?",
    finding:
      "UNCTAD führt bilaterale Handelsmatrizen. Partnerzuordnungen, Waren- und Dienstleistungsabgrenzungen sind noch nicht als eigene Netz- oder Anteilsbilder übernommen.",
    boundary:
      "Ursprungsland, Versandland und Zielmarkt können verschieden sein. Die vorhandenen Gesamtexporte zeigen nur die Außenhandelsgröße.",
    sourceIds: ["unctad"],
    contextCodes: ["NE.EXP.GNFS.ZS", "NE.IMP.GNFS.ZS"],
  },
  {
    topicId: "trade:supply_chains",
    meaning:
      "Wie sind Länder über Vorleistungen und Wertschöpfung miteinander verbunden?",
    finding:
      "OECD TiVA bietet eine passende Perspektive auf Produktionsverflechtungen. Länder, Branchen und Modellstände sind noch nicht als Atlasbilder übernommen.",
    boundary:
      "Bruttoexporte enthalten mehrfach über Grenzen laufende Vorleistungen. Sie messen weder den heimischen Wertschöpfungsanteil noch unmittelbar Lieferausfallrisiken.",
    sourceIds: ["tiva"],
    contextCodes: ["NE.TRD.GNFS.ZS"],
  },
  {
    topicId: "trade:export_concentration",
    meaning:
      "Wie stark hängen Ausfuhren von wenigen Produkten oder Absatzmärkten ab?",
    finding:
      "UNCTAD veröffentlicht getrennte Konzentrationsmaße. Produkt-, Partner- und Herkunftskonzentration sind noch nicht als eigene Bilder übernommen.",
    boundary:
      "Ein konzentrierter Exportkorb ist keine automatische Überbewertung. Änderungen der Warenklassifikation können den historischen Vergleich verändern.",
    sourceIds: ["unctad"],
  },
  {
    topicId: "institutions:tax_structure",
    meaning: "Aus welchen Steuerarten finanziert sich ein Staat?",
    finding:
      "Die OECD bietet harmonisierte Steuerstrukturen vieler Weltregionen. Die staatlichen Ebenen und historischen Definitionen sind noch nicht im Atlas abgeglichen.",
    boundary:
      "Steuereinnahmen, gesetzliche Steuersätze und tatsächliche Belastung einzelner Haushalte sind unterschiedliche Größen. Sozialbeiträge müssen ausdrücklich eingeordnet werden.",
    sourceIds: ["tax"],
  },
  {
    topicId: "institutions:public_services",
    meaning:
      "Wie gut erreichen grundlegende Versorgungsangebote die Bevölkerung?",
    finding:
      "Wasser-, Sanitär- und Stromzugang sind bereits getrennt als Länderbilder erreichbar. Einen gemeinsamen Index aller öffentlichen Leistungen gibt es hier nicht.",
    boundary:
      "Zugang allein beschreibt nicht Qualität, Zuverlässigkeit oder Trägerschaft. Die Bilder zeigen Versorgung, ohne alle Anbieter als staatlich zu bezeichnen.",
    sourceIds: ["governance"],
    contextCodes: ["SH.H2O.BASW.ZS", "SH.STA.SMSS.ZS", "EG.ELC.ACCS.ZS"],
  },
  {
    topicId: "institutions:institutional_indicators",
    meaning:
      "Wie werden institutionelle Rahmenbedingungen eines Landes eingeschätzt?",
    finding:
      "Die WGI bieten sechs getrennte geschätzte Dimensionen. Ihre Revision 2025 und Unsicherheiten sind noch nicht als eigene Atlasbilder übernommen.",
    boundary:
      "Zusammengesetzte Wahrnehmungsmaße sind keine objektive Gesamtnote eines Landes. Kleine Abstände können innerhalb der statistischen Unsicherheit liegen.",
    sourceIds: ["governance"],
  },
  {
    topicId: "institutions:poverty",
    meaning:
      "Welcher Teil der Bevölkerung lebt unter einer ausdrücklich festgelegten Armutsgrenze?",
    finding:
      "Die Weltbank-PIP bietet passende Daten. Kaufkraftstand, Armutsgrenze und vergleichbare Erhebungen sind noch nicht als eigene Atlasansicht übernommen.",
    boundary:
      "Nationale und internationale Grenzen beantworten verschiedene Fragen. Der ergänzende Gini beschreibt Ungleichheit, nicht die Armutsquote.",
    sourceIds: ["poverty"],
    contextCodes: ["SI.POV.GINI"],
  },
  {
    topicId: "institutions:conflict_context",
    meaning:
      "Welche dokumentierten Konflikte bilden den Hintergrund wirtschaftlicher Entwicklungen?",
    finding:
      "UCDP bietet freie Ereignis- und Jahresdatensätze. Historische Gebiete, Ereignistypen und Unsicherheit sind noch nicht in eine Atlas-Zeitleiste übernommen.",
    boundary:
      "Ein zeitliches Zusammentreffen belegt keine wirtschaftliche Ursache. Konflikte werden nicht als natürliche, unvermeidbare oder prognostizierte Wellen dargestellt.",
    sourceIds: ["conflict"],
    contextCodes: ["NY.GDP.MKTP.KD.ZG"],
  },
  {
    topicId: "institutions:economic_policy_regimes",
    meaning: "Welche wirtschaftspolitischen Rahmen prägen eine Epoche?",
    finding:
      "IMF-AREAER beschreibt bestimmte Wechselkurs- und Zahlungsregeln. Eine breitere, datierte Einordnung wirtschaftspolitischer Regime ist noch nicht erstellt.",
    boundary:
      "Ein Wechselkursregime beschreibt nur einen Teil der Wirtschaftspolitik. Länder brauchen belegte Zeitabschnitte; eine universelle Phasenuhr lässt sich daraus nicht ableiten.",
    sourceIds: ["monetary"],
  },
  {
    topicId: "environment:emission_intensity",
    meaning:
      "Wie viele Emissionen entstehen im Verhältnis zur Wirtschaftsleistung?",
    finding:
      "WDI dokumentiert eine passende CO₂-Intensitätsgröße. Emissionsquelle, Preisbasis und Vergleichbarkeit mit den vorhandenen Reihen sind noch nicht abgeglichen.",
    boundary:
      "Eine sinkende Intensität kann mit steigenden Gesamtemissionen einhergehen. Das ergänzende Bild je Einwohner verwendet einen anderen Nenner.",
    sourceIds: ["carbon"],
    contextCodes: ["EN.GHG.CO2.PC.CE.AR5"],
  },
  {
    topicId: "environment:biodiversity_context",
    meaning: "Wie verändern sich Lebensräume und das Risiko des Artenverlusts?",
    finding:
      "Der Red List Index liefert einen konkreten Ansatz. Seine Länderzuordnung und historischen Bewertungsstände sind noch nicht als Atlasreihe geprüft.",
    boundary:
      "Waldfläche ist nur ergänzender Lebensraumkontext. Sie misst weder Artenvielfalt noch Waldqualität oder den Zustand aller Ökosysteme.",
    sourceIds: ["biodiversity"],
    contextCodes: ["AG.LND.FRST.ZS"],
  },
  {
    topicId: "environment:climate_exposure",
    meaning: "Welchen klimatischen Belastungen kann ein Land ausgesetzt sein?",
    finding:
      "ND-GAIN bietet Verwundbarkeitskomponenten. Einzelne Gefahren, gesellschaftliche Empfindlichkeit und Modellannahmen sind noch nicht getrennt als Atlasbilder übernommen.",
    boundary:
      "Ein Länderindex ist keine lokale Wettervorhersage. Der ergänzende Wasserstress beschreibt Wasserentnahme relativ zu Ressourcen, nicht alle Klimarisiken.",
    sourceIds: ["climate"],
    contextCodes: ["ER.H2O.FWST.ZS"],
  },
  {
    topicId: "environment:adaptation",
    meaning:
      "Welche Voraussetzungen helfen einer Gesellschaft, sich an Klimabelastungen anzupassen?",
    finding:
      "ND-GAIN unterscheidet Anpassungsbereitschaft und Verwundbarkeit. Die Komponenten und ihre historische Vergleichbarkeit sind noch nicht als Atlasbilder geprüft.",
    boundary:
      "Bereitschaft ist keine nachgewiesene Anpassungswirkung. Gewichtete Indizes dürfen nicht als direkte Messung vermiedener Schäden erscheinen.",
    sourceIds: ["climate"],
  },
  {
    topicId: "long_history:monetary_systems",
    meaning:
      "Wie verändern sich Geldordnungen und Wechselkursarrangements über lange Zeiträume?",
    finding:
      "IMF-AREAER ist eine konkrete Quelle für neuere Regelungen. Eine belegte Jahrhundert-Zeitleiste einschließlich früherer Geldordnungen ist noch offen.",
    boundary:
      "Ein Wechsel der Geldordnung ist ein historisches Ereignis, keine gleichmäßig wiederkehrende Phase. Unterschiede zwischen angekündigter Regel und tatsächlicher Praxis bleiben relevant.",
    sourceIds: ["monetary"],
    contextCodes: ["FP.CPI.TOTL.ZG"],
  },
];

// Once a reviewed data adapter exists, its actual data view takes precedence.
export const atlasTopicResearch = topicResearchFindings.filter(
  (item) =>
    item.topicId !== "market_context:relative_strength" &&
    !sdg.series.some((series) => series.topicId === item.topicId) &&
    !statistics.series.some((series) => series.topicId === item.topicId) &&
    !publicSeries.metrics.some((metric) => metric.topicId === item.topicId),
);
export const topicResearchSources = Object.fromEntries(
  Object.entries(topicResearchSourceLibrary).filter(([id]) =>
    atlasTopicResearch.some((item) => item.sourceIds.includes(id)),
  ),
);
