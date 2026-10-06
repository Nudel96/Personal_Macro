import { defineLesson } from "../learning-types";

export const metalsEnergyLessons = [
  defineLesson("metals-energy", {
    id: "gold",
    title: "Gold · Realzinsen, Vertrauen und Käufer",
    subtitle: "Ein monetäres Metall mit mehreren Rollen",
    summary:
      "Gold zahlt keinen Zins. Reale Renditen, USD, Absicherungsnachfrage und tatsächliche Käufe sind wichtige Kontexte.",
    context:
      "Gold wird als Schmuck, Reserve und Anlage gehalten. Anders als eine Anleihe zahlt es keinen Kupon. Wenn sichere reale Renditen steigen, wird die Alternative attraktiver. Zugleich können Menschen Gold gerade wegen Misstrauen oder langfristiger Absicherung kaufen. Deshalb ist Gold weder ein perfekter täglicher Inflationsmesser noch eine sichere Krisenwette.",
    drivers: [
      [
        "Reale Renditen",
        "Höhere reale Erträge anderer Anlagen erhöhen die Alternativkosten des Haltens.",
        "Rendite und Inflationserwartung gleicher Laufzeit.",
      ],
      [
        "USD und Währung",
        "Ein USD-Preis ist für Käufer in anderen Währungen nicht derselbe lokale Preis.",
        "USD und Gold in deiner Referenzwährung.",
      ],
      [
        "Käufe und Vertrauen",
        "Zentralbanken, Fonds und physische Käufer haben verschiedene Motive und Zeithorizonte.",
        "Kauf-/Bestandsdaten und ihr Veröffentlichungsdatum.",
      ],
    ],
    chain: [
      [
        "Reale Renditen sinken",
        "Verzinsliche Alternativen bieten weniger Kaufkraftertrag.",
      ],
      ["Alternativkosten", "Zinsloses Gold wird relativ weniger unattraktiv."],
      ["Nachfrage", "Einige Anleger können ihre Gewichtung ändern."],
      [
        "Goldpreis",
        "Unterstützung ist möglich, solange andere Kräfte nicht überwiegen.",
      ],
    ],
    example: {
      title: "Gold fällt im ersten Krisenmoment",
      situation:
        "Gedankenbeispiel: Anleger müssen Margin Calls bezahlen und verkaufen auch Gold, um Liquidität zu bekommen.",
      explanation:
        "Kurzfristige Verkäufe können das längerfristige Absicherungsmotiv überlagern. Zeithorizont und Finanzierungsdruck gehören zur Erklärung.",
    },
    counterweights: [
      "Physische Käufe und Fondsflüsse können gegenläufig sein.",
      "USD-Stärke, steigende Realrenditen und Positionierung können eine Schutzgeschichte begrenzen.",
    ],
    takeaway: "Lies Gold über reale Alternativen, Währung und Käufermotiv.",
    action:
      "Erstelle für Gold zwei konkurrierende Erklärungen und prüfe, welcher Zeithorizont jeweils passt.",
    quiz: {
      question: "Warum können höhere Realzinsen Gold belasten?",
      options: [
        "Verzinsliche Alternativen werden relativ attraktiver.",
        "Gold zahlt dann automatisch höhere Kupons.",
        "Der Nominalzins allein reicht zur Bewertung aus.",
      ],
      correct: 0,
      explanation:
        "Gold bringt keinen laufenden Zins; ein höherer realer Alternativertrag erhöht seine Opportunitätskosten.",
    },
    related: ["real-yields", "liquidity", "silver"],
    terms: ["real-yield", "opportunity-cost", "margin-call"],
    sources: ["chicago-gold", "chicago-real", "bis-carry-unwind"],
  }),
  defineLesson("metals-energy", {
    id: "silver",
    title: "Silber · Edelmetall und Industriemetall",
    subtitle: "Zwei Nachfragegeschichten können gegeneinander arbeiten",
    summary:
      "Silber verbindet Anlageinteresse mit industrieller Nutzung, etwa in Elektronik und Photovoltaik.",
    context:
      "Silber ist elektrisch gut leitfähig und wird industriell verarbeitet. Gleichzeitig wird es als Edelmetall gehalten. Schwächere Industrie kann deshalb belasten, während niedrigere Realzinsen oder Absicherungsbedarf unterstützen. Ein Gold-Silber-Verhältnis beschreibt nur einen relativen Preis. Es sagt ohne Nachfrage- und Angebotskontext nicht, welches Metall billig ist.",
    drivers: [
      [
        "Industrienachfrage",
        "Elektronik, Solar und andere Anwendungen brauchen Material, können aber effizienter werden.",
        "Produktion, Materialeinsatz und neue Kapazität.",
      ],
      [
        "Anlageströme",
        "Käufe und Verkäufe von Fonds oder physischem Silber können zusätzlich wirken.",
        "Bestände und tatsächliche Zuflüsse.",
      ],
      [
        "Angebot",
        "Ein Teil entsteht gemeinsam mit anderen Metallen, sodass Silberpreise allein das Angebot nicht bestimmen.",
        "Minenproduktion und Recycling.",
      ],
    ],
    chain: [
      ["Industrie schwächer", "Einige Käufer benötigen weniger Material."],
      ["Nachfragekanal", "Silberverbrauch kann unter Druck geraten."],
      [
        "Zinskanal",
        "Gleichzeitig können fallende Realzinsen Anlagekäufe begünstigen.",
      ],
      [
        "Gesamtwirkung",
        "Die Stärke beider Kanäle entscheidet, nicht das Etikett Edelmetall.",
      ],
    ],
    example: {
      title: "Gold stabil, Silber schwach",
      situation:
        "Gedankenbeispiel: Eine Wachstumsangst trifft industrielle Nachfrage, während Anleger Gold zur Absicherung kaufen.",
      explanation:
        "Silber muss Gold nicht folgen. Seine industrielle Rolle schafft eine zusätzliche Gegenkraft.",
    },
    counterweights: [
      "Materialeinsparung kann steigende Endproduktzahlen teilweise ausgleichen.",
      "Bestände und Recycling beeinflussen lieferbares Angebot.",
    ],
    takeaway: "Prüfe bei Silber getrennt Industrie, Anlage und Angebot.",
    action:
      "Nutze Gold-Silber-Verhältnisse als Beschreibung; suche vor einer Bewertung nach Ursachen.",
    quiz: {
      question:
        "Warum kann Silber bei Wachstumsangst schwächer als Gold reagieren?",
      options: [
        "Silber hat zusätzlich wichtige industrielle Nachfrage.",
        "Beide Preise müssen immer gleich laufen.",
        "Silber zahlt einen festen Zins.",
      ],
      correct: 0,
      explanation:
        "Industrielle und monetäre Kanäle können sich unterschiedlich entwickeln.",
    },
    related: ["gold", "copper", "correlations"],
    terms: ["substitution", "real-yield", "inventories"],
    sources: ["usgs-silver", "chicago-gold"],
  }),
  defineLesson("metals-energy", {
    id: "copper",
    title: "Kupfer · Leitungen, Bau und Elektrifizierung",
    subtitle: "Langfristiger Bedarf trifft kurzfristigen Industriezyklus",
    summary:
      "Kupfer reagiert auf industrielle Nachfrage, Bau, Stromnetze, Minenangebot und verfügbare Lager.",
    context:
      "Kupfer wird für elektrische Leitungen und viele Industrieprodukte gebraucht. Stromnetze und Elektrifizierung können langfristigen Bedarf stützen. Kurzfristig zählen jedoch tatsächliche Bestellungen, Lager und die Bau-/Industriekonjunktur. Die langfristige Geschichte garantiert deshalb keine steigenden Preise in einer schwachen Nachfragephase.",
    drivers: [
      [
        "Industrie und China",
        "Bau, Geräte, Netze und Fertigung erzeugen verschiedene Nachfrageanteile.",
        "Aufträge, Produktion und Sektor der Nachfrage.",
      ],
      [
        "Minen und Verarbeitung",
        "Störungen oder knappe Konzentrate können das Angebot trotz schwacher Konjunktur begrenzen.",
        "Meldungen zu Minen, Hütten und Recycling.",
      ],
      [
        "Lager und Zeitstruktur",
        "Lieferbare Bestände und Terminpreise geben zusätzlichen Marktstrukturkontext.",
        "Lagerorte, verfügbare Mengen und Spreads.",
      ],
    ],
    chain: [
      ["Bau/Industrie schwächer", "Bestellungen können sinken."],
      ["Materialverbrauch", "Ein Teil der Kupfernachfrage lässt nach."],
      [
        "Angebot prüfen",
        "Minenprobleme können gleichzeitig Metall verknappen.",
      ],
      ["Preis", "Nachfrage und Lieferbarkeit müssen zusammen bewertet werden."],
    ],
    example: {
      title: "Schwache China-Daten, Kupfer steigt",
      situation:
        "Gedankenbeispiel: China-Aufträge enttäuschen, eine große Mine fällt gleichzeitig aus.",
      explanation:
        "Das ist kein Beweis, dass Nachfrage egal ist. Der neue Angebotsschock kann kurzfristig stärker sein.",
    },
    counterweights: [
      "Schrottangebot und Ersatz können Engpässe begrenzen.",
      "Angekündigte Infrastruktur ist noch keine bestellte Kupfermenge.",
    ],
    takeaway:
      "Trenne langfristige Nutzung, aktuelle Aufträge und lieferbares Angebot.",
    action:
      "Suche zu einer Kupferbewegung je einen Nachfrage- und einen Angebotsbefund.",
    quiz: {
      question:
        "Garantiert Elektrifizierung steigende Kupferpreise in jeder Woche?",
      options: [
        "Nein, kurzfristige Nachfrage, Angebot und Erwartungen wirken ebenfalls.",
        "Ja, ohne Unterbrechung.",
        "Nur weil alle Minen geschlossen sind.",
      ],
      correct: 0,
      explanation:
        "Eine strukturelle Nutzung erklärt nicht automatisch den kurzfristigen Preisweg.",
    },
    related: ["china-slowdown", "china-stimulus", "inventories"],
    terms: ["new-orders", "inventories", "contango"],
    sources: ["usgs-copper", "worldbank-metals"],
  }),
  defineLesson("metals-energy", {
    id: "iron-ore",
    title: "Eisenerz · Vor allem die Stahlkette verstehen",
    subtitle: "China-Bau ist direkter als allgemeine Technologiestimmung",
    summary:
      "Eisenerz hängt besonders an Stahlproduktion, Stahlmargen, Bau und Exportangebot.",
    context:
      "Eisenerz wird hauptsächlich zu Stahl verarbeitet. Deshalb sind Bau und Infrastruktur wichtig. Stahl kann aber auch in Maschinen oder Exportprodukten landen. Erzqualitäten unterscheiden sich; Hütten wählen unter anderem nach Produktivität und Kosten. Ein großer Hafenbestand kann verfügbare Menge anzeigen, sagt allein jedoch wenig über passende Qualität und künftige Nachfrage.",
    drivers: [
      [
        "Stahlnachfrage",
        "Bau, Infrastruktur und Industrie bestimmen Absatzmöglichkeiten.",
        "Bauaktivität, Stahlaufträge und tatsächliche Mengen.",
      ],
      [
        "Stahlmargen",
        "Schwache Margen können Produktion und Erzbedarf bremsen.",
        "Stahlpreise gegenüber Erz und weiteren Kosten.",
      ],
      [
        "Exportangebot",
        "Lieferungen großer Produzenten und Transportstörungen beeinflussen Verfügbarkeit.",
        "Verschiffung und Lagerqualität.",
      ],
    ],
    chain: [
      ["Weniger Bauprojekte", "Nachfrage nach Baustahl kann fallen."],
      ["Stahlabsatz", "Hütten treffen auf schwächeren Bedarf."],
      ["Produktion", "Schwache Margen können den Ausstoß bremsen."],
      [
        "Eisenerz/AUD",
        "Erzbedarf und australische Exportaussichten können belastet werden.",
      ],
    ],
    example: {
      title: "Konsumförderung hilft nicht jedem Metall gleich",
      situation:
        "Gedankenbeispiel: Ein Programm fördert Services und Haushaltskonsum statt große Bauprojekte.",
      explanation:
        "Es kann Gesamtwachstum unterstützen, ohne sofort viel neuen Stahlbedarf zu erzeugen. Eisenerz braucht die Verbindung zur konkreten Nachfrage.",
    },
    counterweights: [
      "Stahlexporte oder neue Infrastruktur können gegenwirken.",
      "Schiffs- und Minenstörungen können Preise trotz schwachem Bau stützen.",
    ],
    takeaway:
      "Erkläre Eisenerz über Stahlabsatz, Stahlmargen und lieferbare Erzqualität.",
    action:
      "Prüfe bei einer China-Meldung, ob sie tatsächlich Stahlverbrauch erreicht.",
    quiz: {
      question:
        "Welcher Zwischenbereich verbindet China-Bau und Eisenerz am direktesten?",
      options: [
        "Stahlproduktion.",
        "Der gesamte chinesische CPI ohne Branchenvergleich.",
        "Der Leitzins allein, ohne tatsächlichen Materialbedarf.",
      ],
      correct: 0,
      explanation:
        "Stahlwerke verwenden Eisenerz. Nachfrage nach Stahl ist ein zentraler Übertragungsweg.",
    },
    related: ["aud", "china-slowdown", "china-stimulus"],
    terms: ["margin", "inventories", "terms-of-trade"],
    sources: ["usgs-iron", "worldbank-metals", "rba-trade"],
  }),
  defineLesson("metals-energy", {
    id: "aluminium",
    title: "Aluminium · Energieintensives Industrieangebot",
    subtitle: "Nachfrage ist nur die halbe Geschichte",
    summary:
      "Aluminium verbindet Industriebedarf mit stromintensiver Produktion, Vorprodukten und Recycling.",
    context:
      "Die Herstellung von Primäraluminium braucht viel Strom. Strompreise und verfügbare Energie können deshalb Produktionskosten und Kapazität beeinflussen. Aluminium wird etwa in Transport, Bau und Verpackungen genutzt. Bauxit, Aluminiumoxid und fertiges Metall sind unterschiedliche Stufen; ein Engpass in einer Stufe muss ausdrücklich benannt werden.",
    drivers: [
      [
        "Strom und Kapazität",
        "Teure oder knappe Energie kann Hüttenproduktion begrenzen.",
        "Stromkosten und bestätigte Produktionskürzungen.",
      ],
      [
        "Industrienachfrage",
        "Transport, Bau und Verpackung besitzen unterschiedliche Zyklen.",
        "Bestellungen nach Branche.",
      ],
      [
        "Vorprodukte/Recycling",
        "Aluminiumoxid und Schrott beeinflussen Kosten und Angebot.",
        "Vorproduktpreise, Schrott und Lieferbarkeit.",
      ],
    ],
    chain: [
      ["Stromkosten steigen", "Schmelzwerke werden belastet."],
      ["Marge sinkt", "Manche Produktion wird unwirtschaftlicher."],
      ["Angebot reagiert", "Bestätigte Kürzungen können Metall verknappen."],
      [
        "Preis",
        "Der Angebotseffekt trifft auf die aktuelle Industrienachfrage.",
      ],
    ],
    example: {
      title: "Schwache Konjunktur, knapper Strom",
      situation:
        "Gedankenbeispiel: Industriebestellungen sinken, zugleich werden große Schmelzkapazitäten stillgelegt.",
      explanation:
        "Nachfrage- und Angebotsschock können gegeneinander wirken. Die Preisrichtung folgt nicht allein dem Konjunkturetikett.",
    },
    counterweights: [
      "Recycling und alternative Lieferorte können puffern.",
      "Eine hohe Stromrechnung beweist noch keine tatsächliche Produktionskürzung.",
    ],
    takeaway:
      "Bei Aluminium gehören Energie und Verarbeitungskapazität zum Kernkontext.",
    action: "Trenne Bauxit, Aluminiumoxid und Metall in deiner Erklärung.",
    quiz: {
      question: "Warum ist Strom bei Aluminium besonders relevant?",
      options: [
        "Primäraluminiumproduktion ist energieintensiv.",
        "Nur der Endverbrauch zählt; Produktionskosten spielen keine Rolle.",
        "Höhere Stromkosten erhöhen automatisch die verfügbare Metallmenge.",
      ],
      correct: 0,
      explanation:
        "Energie ist ein wichtiger Kosten- und Kapazitätsfaktor der Produktion.",
    },
    related: ["oil-shock", "copper", "supply-demand"],
    terms: ["margin", "substitution", "inventories"],
    sources: ["usgs-aluminium", "worldbank-metals"],
  }),
  defineLesson("metals-energy", {
    id: "platinum",
    title: "Platin und Palladium · Autoindustrie und konzentriertes Angebot",
    subtitle: "Edelmetallname bedeutet nicht gleiche Treiber wie Gold",
    summary:
      "Platingruppenmetalle reagieren auf industrielle Anwendungen, Ersatzmöglichkeiten und konzentrierte Produktion.",
    context:
      "Platin und Palladium werden unter anderem in Abgaskatalysatoren eingesetzt. Antriebsmix, technische Anforderungen und Recycling beeinflussen Nachfrage. Produktionsregionen sind konzentriert, sodass örtliche Störungen wichtig sein können. Wasserstoffanwendungen sind ein möglicher struktureller Bedarfskanal für Platin; angekündigte Projekte sind aber noch kein gemessener Metallverbrauch.",
    drivers: [
      [
        "Fahrzeugmix",
        "Verbrenner, Hybride und batterieelektrische Autos benötigen unterschiedliche Abgassysteme.",
        "Produktion nach Antrieb und Katalysatortechnik.",
      ],
      [
        "Ersatz und Recycling",
        "Technische Änderungen und relative Preise beeinflussen Materialwahl und Rückgewinnung.",
        "Substitution und Recyclingmengen.",
      ],
      [
        "Minenangebot",
        "Regionale Strom-, Betriebs- oder Handelsprobleme können Produktion treffen.",
        "Bestätigte Lieferausfälle und Lager.",
      ],
    ],
    chain: [
      [
        "Antriebsmix ändert sich",
        "Die Zahl benötigter Abgaskatalysatoren verändert sich.",
      ],
      [
        "Materialbedarf",
        "Platin/Palladium reagieren unterschiedlich je Technik.",
      ],
      ["Ersatz", "Hersteller prüfen technisch mögliche Anpassungen."],
      [
        "Preis",
        "Angebot und Umsetzungsgeschwindigkeit bestimmen den Gesamteffekt.",
      ],
    ],
    example: {
      title: "Wasserstoffgeschichte versus aktueller Absatz",
      situation:
        "Gedankenbeispiel: Viele Wasserstoffprojekte werden angekündigt, die tatsächliche Autokatalysatornachfrage sinkt.",
      explanation:
        "Trenne geplanten künftigen Bedarf und aktuellen Verbrauch. Eine attraktive Zukunftsgeschichte ersetzt keine Mengenbilanz.",
    },
    counterweights: [
      "Technische Substitution braucht Zeit und ist nicht unbegrenzt möglich.",
      "Minen und Recycling können die Nachfragegeschichte überlagern.",
    ],
    takeaway:
      "Platin und Palladium brauchen Industrie- und Angebotskontext, nicht nur den Goldvergleich.",
    action:
      "Prüfe, ob eine Meldung Projekte, tatsächliche Produktion oder verbrauchtes Metall beschreibt.",
    quiz: {
      question:
        "Sind angekündigte Wasserstoffprojekte schon gemessene Platinnachfrage?",
      options: [
        "Nein, Umsetzung und Materialverbrauch müssen nachgewiesen werden.",
        "Ja, vollständig am Tag der Ankündigung.",
        "Nur wenn Gold steigt.",
      ],
      correct: 0,
      explanation:
        "Zwischen Planung und Verbrauch liegen Finanzierung, Bau und Technologieentscheidungen.",
    },
    related: ["gold", "silver", "expectations"],
    terms: ["substitution", "priced-in", "inventories"],
    sources: ["usgs-platinum", "usgs-minerals"],
  }),
  defineLesson("metals-energy", {
    id: "oil",
    title: "Öl · Nachfrage, Angebot und verfügbare Puffer",
    subtitle: "Ein höherer Preis kann gute oder schlechte Nachrichten bedeuten",
    summary:
      "Öl wird global gehandelt. Entscheidend sind erwartete Verbrauchsmengen, Produktion, Lager und Lieferwege.",
    context:
      "In kurzer Zeit können Verbraucher und Produzenten ihre Mengen oft nur begrenzt ändern. Schon ein kleiner unerwarteter Unterschied zwischen Angebot und Nachfrage kann deshalb große Preiseffekte haben. Brent und WTI stehen für unterschiedliche Qualitäten und Lieferorte. Produktionsbeschlüsse, tatsächliche Förderung und erreichbare Exporte sind ebenfalls verschiedene Größen.",
    drivers: [
      [
        "Verbrauch",
        "Transport, Industrie und weitere Nutzung ändern die Nachfrage.",
        "Mengen, Raffinerien und Wachstum.",
      ],
      [
        "Förderung und Lieferwege",
        "Politik, Ausfälle und Transport bestimmen verfügbares Angebot.",
        "Tatsächliche Produktion statt nur Ankündigung.",
      ],
      [
        "Lager und Kapazität",
        "Bestände und freie Kapazität können Störungen abfedern.",
        "Lagerentwicklung und kurzfristige Lieferbarkeit.",
      ],
    ],
    chain: [
      ["Lieferung fällt aus", "Weniger Öl erreicht den Markt."],
      ["Puffer prüfen", "Lager und Ersatzförderung können helfen."],
      [
        "Kostenanstieg",
        "Ohne ausreichenden Puffer steigen Beschaffungskosten.",
      ],
      [
        "Wirtschaft",
        "Importländer werden belastet; Exportländer können Erlöse gewinnen.",
      ],
    ],
    example: {
      title: "Derselbe Preis, andere Ursache",
      situation:
        "Gedankenbeispiel: Öl steigt einmal durch starke Weltnachfrage, einmal durch einen Lieferausfall.",
      explanation:
        "Der erste Fall passt eher zu Wachstum, der zweite kann Wachstum belasten und Inflation erhöhen. Für CAD, EUR und Metalle brauchst du diese Unterscheidung.",
    },
    counterweights: [
      "Lagerfreigaben, Ersatzangebot und Nachfragerückgang können gegenwirken.",
      "Ein regionaler Engpass ist nicht automatisch ein gleich großer globaler Ausfall.",
    ],
    takeaway: "Frage bei Öl zuerst nach Nachfrageanstieg oder Angebotsverlust.",
    action:
      "Notiere Ursache, tatsächlich betroffene Menge und verfügbare Puffer, soweit belastbar bekannt.",
    quiz: {
      question:
        "Warum ist die Ursache eines Ölpreisanstiegs für Macro wichtig?",
      options: [
        "Nachfrageboom und Lieferausfall haben unterschiedliche Wachstumseffekte.",
        "Öl beeinflusst keine Kosten.",
        "Beide Fälle garantieren einen stärkeren CAD.",
      ],
      correct: 0,
      explanation:
        "Ein Preisanstieg beschreibt noch nicht, ob die Welt mehr produziert oder einen Angebotsverlust bewältigt.",
    },
    related: ["cad", "oil-shock", "inventories"],
    terms: ["inventories", "supply-shock", "backwardation"],
    sources: ["eia-oil", "eia-balance", "eia-supply"],
  }),
  defineLesson("metals-energy", {
    id: "gas",
    title: "Erdgas · Region, Wetter und Speicher",
    subtitle: "Henry Hub ist nicht dasselbe wie europäisches Gas",
    summary:
      "Gaspreise hängen an regionaler Infrastruktur, Produktion, Verbrauch, LNG und Speichern.",
    context:
      "Gas braucht Pipelines oder aufwendige Verflüssigung und Transport. Deshalb unterscheiden sich regionale Preise stärker als bei gut transportierbaren Waren. Henry Hub beschreibt einen US-Markt, TTF einen europäischen Bezug. Kälte kann Heizbedarf erhöhen, Hitze Strombedarf für Kühlung. Beides wirkt anders, wenn Speicher und Lieferwege ausreichend sind.",
    drivers: [
      [
        "Wetter und Verbrauch",
        "Heizung und Stromerzeugung verändern den Gasbedarf.",
        "Regionale Temperatur gegenüber üblichem Bedarf.",
      ],
      [
        "Produktion und LNG",
        "Förderung, Pipelines und Exportkapazität bestimmen lieferbare Mengen.",
        "Tatsächliche Flüsse und Anlagenbetrieb.",
      ],
      [
        "Speicher",
        "Bestände puffern Saisonbedarf; Entnahmeleistung zählt zusätzlich.",
        "Bestand relativ zur Jahreszeit und Lieferleistung.",
      ],
    ],
    chain: [
      ["Kälte kommt", "Heizbedarf steigt in einer Region."],
      ["Mehr Entnahme", "Speicher und Lieferungen werden beansprucht."],
      ["Puffer", "Hohe Bestände können helfen, technische Grenzen bleiben."],
      ["Preis", "Regionale Engpässe entscheiden über die Wirkung."],
    ],
    example: {
      title: "Europäischer Engpass, US-Überangebot",
      situation:
        "Gedankenbeispiel: Europas Importwege sind gestört, die USA haben große Bestände.",
      explanation:
        "Die Gaspreise müssen nicht gleich reagieren. LNG verbindet Märkte nur innerhalb realer Verflüssigungs-, Transport- und Importkapazität.",
    },
    counterweights: [
      "Wettervorhersagen ändern sich und sind keine sicheren Verbrauchszahlen.",
      "Speicherfüllstand allein sagt nichts Vollständiges über Liefergeschwindigkeit.",
    ],
    takeaway: "Beginne Gasanalysen mit Region und konkretem Preisbezug.",
    action:
      "Schreibe in jede Gasnotiz ausdrücklich Henry Hub, TTF oder den tatsächlich betrachteten Markt.",
    quiz: {
      question:
        "Warum muss US-Gas nicht gleich auf europäische Knappheit reagieren?",
      options: [
        "Transport und LNG-Kapazität begrenzen den Marktausgleich.",
        "Ein höherer Preis schafft sofort unbegrenzte LNG-Transportkapazität.",
        "Die beiden Märkte haben unabhängig von Lieferwegen stets denselben Preis.",
      ],
      correct: 0,
      explanation:
        "Regionale Infrastruktur begrenzt, wie schnell Angebot einen anderen Markt erreicht.",
    },
    related: ["oil-shock", "inventories", "basis"],
    terms: ["lng", "inventories", "basis"],
    sources: ["eia-gas", "eia-gas-storage", "eia-gas-futures"],
  }),
];
