import { defineLesson } from "../learning-types";

export const basicsLessons = [
  defineLesson("basics", {
    id: "fx-pairs",
    title: "Eine Währung hat immer ein Gegenüber",
    subtitle: "Warum ein guter CAD trotzdem gegen USD fallen kann",
    summary:
      "Ein Wechselkurs ist ein Vergleich von zwei Währungen. Du brauchst deshalb immer beide Geschichten.",
    context:
      "Stell dir zwei Läufer vor: Beide werden schneller, aber einer verbessert sich stärker. Genau so kann eine Wirtschaft gute Daten liefern und ihre Währung trotzdem im Paar verlieren. Bei USD/CAD steht USD vorne und CAD hinten. Der Kurs sagt, wie viele kanadische Dollar ein US-Dollar kostet. Ein steigender USD/CAD bedeutet deshalb einen schwächeren CAD gegenüber USD.",
    drivers: [
      [
        "Die erste Währung",
        "Neue Erwartungen zu Wachstum, Zinsen und Risiken verändern die Nachfrage nach ihr.",
        "Daten und Zentralbank der Basiswährung.",
      ],
      [
        "Die zweite Währung",
        "Ihre Entwicklung kann die erste Geschichte verstärken oder aufheben.",
        "Dieselben Größen auf der Gegenseite.",
      ],
      [
        "Die Schreibweise",
        "CAD/USD und USD/CAD beschreiben denselben Vergleich aus entgegengesetzter Sicht.",
        "Welche Währung steht vorne?",
      ],
    ],
    chain: [
      ["Information", "Kanadas Aussichten verbessern sich."],
      ["Vergleich", "Die US-Aussichten verbessern sich noch stärker."],
      ["Neubewertung", "USD kann relativ attraktiver werden."],
      ["Paar", "USD/CAD kann steigen, obwohl Kanada gute Daten hat."],
    ],
    example: {
      title: "Zwei gute Nachrichten",
      situation:
        "Gedankenbeispiel: Kanadische Beschäftigung wächst stärker als erwartet. Gleichzeitig überrascht die Fed mit einer strengeren Zinsbotschaft.",
      explanation:
        "Die CAD-Nachricht wirkt unterstützend. Die USD-Nachricht kann aber größer sein. Eine einzelne Überschrift reicht deshalb für die Richtung des Paares nicht.",
    },
    counterweights: [
      "Ein breiter Währungsindex kann anders aussehen als ein einzelnes Paar.",
      "Absicherungen, Positionierung und kurze Liquiditätsbewegungen können den Vergleich überlagern.",
    ],
    takeaway:
      "Frage immer: positiv oder negativ gegenüber welcher anderen Währung?",
    action:
      "Schreibe bei deinem nächsten Paar zwei Sätze: Was spricht für die erste, was für die zweite Währung?",
    quiz: {
      question: "USD/CAD steigt. Was bedeutet das für CAD gegenüber USD?",
      options: [
        "CAD wird stärker.",
        "CAD wird schwächer.",
        "Beide Währungen steigen gleich stark.",
      ],
      correct: 1,
      explanation:
        "Ein US-Dollar kostet nun mehr CAD. CAD hat gegenüber USD an Wert verloren.",
    },
    related: ["cad", "usd", "expectations"],
    terms: ["base-quote", "appreciation"],
    sources: ["boe-fx", "rba-fx"],
    tools: [{ label: "Paare in der Macro Heatmap", path: "/macro" }],
  }),
  defineLesson("basics", {
    id: "expectations",
    title: "Märkte reagieren auf Überraschungen",
    subtitle: "Actual, Forecast und Previous auseinanderhalten",
    summary:
      "Eine gute Zahl kann enttäuschen. Entscheidend ist oft, was vorher erwartet wurde.",
    context:
      "Ein Kurs enthält schon Erwartungen. Wenn alle mit viel Wachstum rechnen, ist normales Wachstum keine neue gute Nachricht. Forecast bedeutet erwarteter Wert, Actual der veröffentlichte Wert und Previous der vorherige Wert. Zusätzlich können alte Zahlen nachträglich korrigiert werden. Der Vergleich mit gestern und der Vergleich mit der Erwartung beantworten unterschiedliche Fragen.",
    drivers: [
      [
        "Überraschung",
        "Der Abstand zwischen tatsächlicher und erwarteter Zahl kann eine Neubewertung auslösen.",
        "Actual im Vergleich zu Forecast.",
      ],
      [
        "Zusammensetzung",
        "Ein starker Gesamtwert kann schwache wichtige Untergruppen verdecken.",
        "Details und Revisionen.",
      ],
      [
        "Zinsreaktion",
        "Daten wirken auf Währungen oft über die erwartete Reaktion der Zentralbank.",
        "Renditen und Zentralbankbotschaft.",
      ],
    ],
    chain: [
      ["Vorher", "Der Markt erwartet im Beispiel 2,0 Prozent Wachstum."],
      ["Veröffentlichung", "Es kommen 1,5 Prozent."],
      ["Einordnung", "Wachstum bleibt positiv, enttäuscht aber die Erwartung."],
      ["Folge", "Eine Zinssenkung könnte wahrscheinlicher werden."],
    ],
    example: {
      title: "Positiv und trotzdem enttäuschend",
      situation:
        "Gedankenbeispiel: Neue Stellen steigen um 100.000. Erwartet waren 180.000, zuvor waren es 80.000.",
      explanation:
        "Gegenüber dem vorherigen Monat ist die Zahl höher. Gegenüber der Erwartung ist sie niedriger. Erst Löhne, Arbeitslosenquote und Revisionen zeigen, wie eindeutig die Botschaft ist.",
    },
    counterweights: [
      "Forecasts sind Schätzungen und können fehlen oder voneinander abweichen.",
      "Positionierung und bereits eingepreiste Ängste können eine scheinbar klare Reaktion umdrehen.",
    ],
    takeaway:
      "Gut oder schlecht ist etwas anderes als besser oder schlechter als erwartet.",
    action:
      "Notiere vor einem Release die Erwartung. Vergleiche danach Zahl, Details und Kursreaktion getrennt.",
    quiz: {
      question:
        "Ein PMI steigt von 48 auf 49; erwartet war 51. Welche Aussage passt?",
      options: [
        "Er verbessert sich, enttäuscht aber die Erwartung.",
        "Er beweist einen starken Aufschwung.",
        "Previous und Forecast sind dasselbe.",
      ],
      correct: 0,
      explanation:
        "Die Veränderung gegenüber dem Vormonat ist positiv; die Überraschung gegenüber 51 ist negativ. Beides kann gleichzeitig stimmen.",
    },
    related: ["growth", "labor", "central-banks"],
    terms: ["surprise", "revision", "priced-in"],
    sources: ["ecb-transmission", "rba-transmission"],
    tools: [
      { label: "Releases im Wirtschaftskalender", path: "/economic-calendar" },
    ],
  }),
  defineLesson("basics", {
    id: "central-banks",
    title: "Wie Zentralbanken Märkte beeinflussen",
    subtitle: "Der künftige Zinsweg zählt mit",
    summary:
      "Zinsen verändern Kreditkosten, Nachfrage und Kapitalflüsse. Die Wirkung braucht Zeit.",
    context:
      "Eine Zentralbank kann höhere Preise nicht direkt wegschalten. Sie beeinflusst die Bedingungen, unter denen Menschen und Firmen Geld ausgeben oder sparen. Höhere Zinsen machen neue Kredite und die Anschlussfinanzierung teurer. Gleichzeitig werden verzinste Anlagen interessanter. Für Währungen zählt auch, wie dieser Zinsweg im Vergleich zu anderen Ländern aussieht.",
    drivers: [
      [
        "Zinsentscheidung",
        "Sie verändert die kurzfristigen Finanzierungskosten.",
        "Entscheidung gegen vorherige Erwartung.",
      ],
      [
        "Kommunikation",
        "Ein unveränderter Zins kann mit einer deutlich strengeren oder lockereren Botschaft verbunden sein.",
        "Ausblick, Bedingungen und Abstimmung.",
      ],
      [
        "Übertragung",
        "Bestehende Festzinskredite reagieren langsamer als variable Kredite.",
        "Kreditvergabe, Konsum und Investitionen.",
      ],
    ],
    chain: [
      ["Zins steigt", "Neue Finanzierung wird teurer."],
      ["Entscheidungen", "Manche Käufe und Investitionen werden verschoben."],
      ["Nachfrage", "Der Druck auf Preise kann nachlassen."],
      [
        "Währung",
        "Ein höherer relativer Zins kann unterstützen, sofern Risiken nicht überwiegen.",
      ],
    ],
    example: {
      title: "Zins unverändert, Botschaft neu",
      situation:
        "Gedankenbeispiel: Die Bank hält den Zins, erklärt aber, dass Inflation hartnäckiger geworden ist.",
      explanation:
        "Wenn vorher schnelle Senkungen erwartet wurden, kann schon diese Botschaft Renditen verändern. Der aktuelle Zins allein beschreibt die Nachricht nicht vollständig.",
    },
    counterweights: [
      "Ein höherer Zins kann auch Ausdruck einer Krise oder hoher Inflation sein.",
      "Die tatsächliche Wirkung hängt von Schulden, Kreditlaufzeiten und Vertrauen ab.",
    ],
    takeaway: "Vergleiche Entscheidung, Erwartung und künftigen Zinsweg.",
    action:
      "Lies bei der nächsten Entscheidung den Ausblick und nenne die zwei Daten, von denen die Bank weitere Schritte abhängig macht.",
    quiz: {
      question: "Kann eine Zinspause die Währung bewegen?",
      options: [
        "Nein, ohne Zinsänderung gibt es keine Nachricht.",
        "Ja, wenn sich die Erwartungen durch die Kommunikation ändern.",
        "Die Kommunikation zählt erst, wenn eine tatsächliche Zinsänderung folgt.",
      ],
      correct: 1,
      explanation:
        "Eine neue Botschaft kann die erwarteten nächsten Entscheidungen verändern.",
    },
    related: ["real-yields", "inflation", "gbp"],
    terms: ["hawkish", "dovish", "rate-path"],
    sources: ["ecb-transmission", "rba-transmission", "boe-inflation"],
    tools: [
      { label: "Leitzinsen vergleichen", path: "/rates" },
      { label: "Zentralbank-Briefings lesen", path: "/central-bank-reports" },
    ],
  }),
  defineLesson("basics", {
    id: "real-yields",
    title: "Realzinsen: Was nach Inflation übrig bleibt",
    subtitle: "Warum Gold auch bei hoher Inflation fallen kann",
    summary:
      "Nominale Zinsen sagen nicht alles. Die erwartete Kaufkraft des Ertrags zählt mit.",
    context:
      "Ein Zins von fünf Prozent klingt attraktiv. Wenn Preise im gleichen Zeitraum ungefähr vier Prozent steigen, bleibt vereinfacht nur etwa ein Prozent Kaufkraftgewinn vor Kosten und Steuern. Für Märkte ist oft die erwartete künftige Inflation wichtig. Eine heutige CPI-Zahl einfach von einer zehnjährigen Rendite abzuziehen vermischt unterschiedliche Zeiträume.",
    drivers: [
      [
        "Nominale Rendite",
        "Höhere Zinsen erhöhen den Ertrag einer verzinsten Alternative.",
        "Passende Laufzeit der Anleihe.",
      ],
      [
        "Inflationserwartung",
        "Steigende erwartete Preise verringern den künftigen Kaufkraftertrag.",
        "Erwartung für denselben Zeitraum.",
      ],
      [
        "Alternativkosten",
        "Gold zahlt keinen laufenden Zins. Verzinsliche Alternativen können attraktiver werden.",
        "Reale Renditen und USD gemeinsam.",
      ],
    ],
    chain: [
      [
        "Zinserwartung",
        "Nominale Rendite steigt im Beispiel von 4 auf 5 Prozent.",
      ],
      ["Preiserwartung", "Erwartete Inflation bleibt bei 3 Prozent."],
      ["Realzins", "Die einfache Näherung steigt von 1 auf 2 Prozent."],
      ["Vergleich", "Zinslose Anlagen bekommen stärkere Konkurrenz."],
    ],
    example: {
      title: "Inflation steigt, Realzins auch",
      situation:
        "Gedankenbeispiel: Erwartete Inflation steigt etwas, nominale Renditen steigen aber noch stärker.",
      explanation:
        "Der Realzins kann steigen. Hohe Inflation allein ist deshalb kein ausreichender Grund für steigendes Gold. Absicherungsbedarf oder Zentralbankkäufe können gleichzeitig in die andere Richtung wirken.",
    },
    counterweights: [
      "Marktbasierte Inflationserwartungen enthalten auch Liquiditäts- und Risikoprämien.",
      "Gold reagiert zusätzlich auf Käufe, Vertrauen und Positionierung.",
    ],
    takeaway:
      "Bei Realzinsen müssen Zeithorizont und erwartete Inflation zusammenpassen.",
    action:
      "Erkläre eine Goldbewegung mit zwei Hypothesen: reale Renditen und Absicherungsnachfrage. Suche getrennte Belege.",
    quiz: {
      question:
        "Nominalzins steigt stärker als erwartete Inflation. Was passiert näherungsweise?",
      options: [
        "Der Realzins fällt immer.",
        "Der Realzins steigt.",
        "Es lässt sich gar nichts vergleichen.",
      ],
      correct: 1,
      explanation:
        "Nominalzins minus erwartete Inflation wird größer. Das ist eine Näherung für vergleichbare Zeiträume.",
    },
    related: ["gold", "bonds", "inflation"],
    terms: ["real-yield", "opportunity-cost", "breakeven"],
    sources: ["chicago-real", "chicago-gold"],
    tools: [
      { label: "Nominale Staatsanleiherenditen", path: "/government-bonds" },
    ],
  }),
  defineLesson("basics", {
    id: "inflation",
    title: "Inflation verstehen, ohne Begriffe zu vermischen",
    subtitle: "Langsamer teurer ist noch nicht billiger",
    summary:
      "Inflation ist die Veränderung des Preisniveaus. Sinkende Inflation bedeutet nicht automatisch sinkende Preise.",
    context:
      "Wenn dein Einkauf erst 100, dann 110 und danach 112 Euro kostet, sind die Preise weiter gestiegen. Nur die Geschwindigkeit ist kleiner geworden. Das heißt Disinflation. Deflation bedeutet dagegen sinkendes Preisniveau. CPI betrachtet einen Verbraucherwarenkorb. Kerninflation lässt bestimmte schwankende Bestandteile weg; ihre genaue Definition hängt von der Quelle ab.",
    drivers: [
      [
        "Nachfrage",
        "Mehr Kaufbereitschaft bei begrenzter Kapazität kann Preise erhöhen.",
        "Konsum, Aufträge und Kapazität.",
      ],
      [
        "Kosten",
        "Energie, Löhne oder Lieferprobleme können das Angebot verteuern.",
        "Energiepreise und Dienstleistungspreise.",
      ],
      [
        "Erwartungen",
        "Wenn Firmen und Beschäftigte länger höhere Preise erwarten, können Preise und Lohnforderungen reagieren.",
        "Erwartungen und Lohnabschlüsse.",
      ],
    ],
    chain: [
      ["Energie wird teurer", "Transport und Produktion können mehr kosten."],
      ["Weitergabe", "Firmen entscheiden, wie viel sie weiterreichen."],
      ["Verbraucher", "Ein Teil landet später im Warenkorb."],
      [
        "Zentralbank",
        "Dauer und Breite des Preisdrucks beeinflussen ihre Reaktion.",
      ],
    ],
    example: {
      title: "Von 10 auf 2 Prozent",
      situation:
        "Gedankenbeispiel: Ein Preis steigt von 100 auf 110. Im nächsten Jahr steigt er um zwei Prozent auf 112,20.",
      explanation:
        "Die Inflation ist gefallen, der Preis nicht. Zur Rückkehr auf 100 wäre eine Preissenkung nötig. Dieser Unterschied verhindert falsche Schlüsse aus einer sinkenden Inflationsrate.",
    },
    counterweights: [
      "Ein Vorjahresvergleich hängt auch vom damaligen Ausgangsniveau ab.",
      "Warenpreise können fallen, während Dienstleistungen teurer werden.",
    ],
    takeaway: "Trenne Preisniveau, Änderungsrate und Ursache.",
    action:
      "Prüfe bei einem CPI-Release Vorjahr, Vormonat und die wichtigsten Untergruppen.",
    quiz: {
      question: "Inflation sinkt von 6 auf 3 Prozent. Was folgt daraus?",
      options: [
        "Alle Preise sind halbiert.",
        "Der Warenkorb wird insgesamt langsamer teurer.",
        "Es herrscht automatisch Deflation.",
      ],
      correct: 1,
      explanation:
        "Eine positive Inflationsrate bedeutet weiter steigende Preise im betrachteten Durchschnitt.",
    },
    related: ["ppi", "stagflation", "central-banks"],
    terms: [
      "cpi",
      "disinflation",
      "deflation",
      "base-effect",
      "pce",
      "yoy",
      "mom",
    ],
    sources: ["boe-inflation", "rba-inflation", "fed-price-goal"],
    tools: [{ label: "Inflationsdaten einordnen", path: "/economic-data" }],
  }),
  defineLesson("basics", {
    id: "ppi",
    title: "PPI: Preise an der Produktionsseite",
    subtitle: "Ein Hinweis auf Preisdruck, kein automatischer CPI-Vorlauf",
    summary:
      "PPI beschreibt Erzeugerpreise. Ein Rückgang kann Entlastung oder schwache Nachfrage bedeuten.",
    context:
      "Stell dir eine Fabrik vor, die Produkte verkauft. Der PPI schaut auf Preise an der Erzeugerseite, der CPI auf Preise für Verbraucher. Dazwischen liegen andere Warenkörbe, Dienstleistungen, Handelsspannen, Steuern und Transport. Der chinesische industrielle PPI ist außerdem anders abgegrenzt als der breite US-PPI. Vergleiche deshalb zuerst die Definition der Reihe.",
    drivers: [
      [
        "Rohstoffkosten",
        "Günstigere Energie oder Metalle können Produktionspreise entlasten.",
        "Inputpreise und Branchenbeiträge.",
      ],
      [
        "Nachfrage",
        "Weniger Aufträge können den Spielraum für Verkaufspreise verringern.",
        "Aufträge, Absatz und Lager.",
      ],
      [
        "Kapazität",
        "Viel Angebot gegenüber Nachfrage kann Preiswettbewerb auslösen.",
        "Auslastung und Produktion.",
      ],
    ],
    chain: [
      ["Weniger Bestellungen", "Fabriken treffen auf schwächeren Absatz."],
      ["Preiswettbewerb", "Einige senken ihre Verkaufspreise."],
      ["PPI sinkt", "Erzeugerpreise können fallen."],
      [
        "Weitergabe offen",
        "Verbraucherpreise reagieren abhängig von Margen, Wechselkursen und Warenkorb.",
      ],
    ],
    example: {
      title: "Zwei Wege zum gleichen PPI",
      situation:
        "Gedankenbeispiel: PPI fällt einmal wegen billigerem Öl und einmal wegen fehlender Aufträge.",
      explanation:
        "Im ersten Fall können sinkende Kosten helfen. Im zweiten können Umsatz und Margen leiden. Dieselbe Zahl trägt unterschiedliche wirtschaftliche Geschichten. Gewinne hängen von Verkaufspreisen, Mengen und Kosten zusammen ab.",
    },
    counterweights: [
      "Ein einzelner Industriezweig kann den Gesamtindex stark bewegen.",
      "Sinkende Inputpreise müssen nicht im gleichen Umfang beim Verbraucher ankommen.",
    ],
    takeaway:
      "Frage beim PPI: Welche Preise fallen, aus welchem Grund und mit welcher Wirkung auf Margen?",
    action:
      "Verbinde eine PPI-Zahl mit Produktionsmenge, neuen Aufträgen und Rohstoffpreisen.",
    quiz: {
      question:
        "Beweist ein sinkender chinesischer PPI automatisch sinkenden deutschen CPI?",
      options: [
        "Ja, beide Indizes sind identisch.",
        "Nein, Warenkorb und Übertragung unterscheiden sich.",
        "Ja, ohne zeitliche Verzögerung.",
      ],
      correct: 1,
      explanation:
        "Handelspreise, Wechselkurse, Margen und lokale Dienstleistungen beeinflussen die Weitergabe.",
    },
    related: ["china-ppi", "china-slowdown", "inflation"],
    terms: ["ppi", "margin", "pass-through", "yoy", "mom"],
    sources: ["bls-ppi", "imf-china-report"],
    tools: [
      { label: "PPI und andere Wirtschaftsdaten", path: "/economic-data" },
    ],
  }),
  defineLesson("basics", {
    id: "growth",
    title: "Wachstum: BIP, PMI und neue Aufträge",
    subtitle: "Niveau, Tempo und Erwartung sind drei verschiedene Dinge",
    summary:
      "Wachstumsdaten helfen dir zu verstehen, ob Nachfrage und Produktion an Kraft gewinnen.",
    context:
      "BIP misst wirtschaftliche Produktion in einem Zeitraum. Reales BIP versucht Preisänderungen herauszurechnen. Ein PMI ist dagegen eine Unternehmensbefragung: Er zeigt, ob befragte Firmen Verbesserungen oder Verschlechterungen melden. Bei vielen PMIs trennt 50 Expansion von Rückgang gegenüber dem Vormonat. Er misst weder den Euro-Wert der Wirtschaft noch direkt eine jährliche BIP-Wachstumsrate.",
    drivers: [
      [
        "Neue Aufträge",
        "Sie können Hinweise auf künftige Produktion geben.",
        "Auftragseingänge getrennt vom Gesamtindex.",
      ],
      [
        "Konsum und Investition",
        "Haushalte und Unternehmen erzeugen unterschiedliche Nachfrageimpulse.",
        "Realer Konsum, Bau und Investitionen.",
      ],
      [
        "Vergleichszeitraum",
        "Vorquartal und Vorjahr erzählen verschiedene Geschichten.",
        "Einheit und Saisonbereinigung.",
      ],
    ],
    chain: [
      ["Neue Nachfrage", "Firmen bekommen mehr Aufträge."],
      ["Produktion", "Sie planen mehr Ausstoß."],
      [
        "Arbeit und Material",
        "Bedarf an Beschäftigung und Vorprodukten kann steigen.",
      ],
      ["Markt", "Wachstums- und Zinserwartungen werden geprüft."],
    ],
    example: {
      title: "49 ist besser als 46",
      situation:
        "Gedankenbeispiel: Ein Industrie-PMI verbessert sich von 46 auf 49.",
      explanation:
        "Die gemeldete Schrumpfung kann nachlassen. Der Wert bleibt aber unter 50. Verbesserung des Tempos ist noch kein Beweis für Expansion. Prüfe außerdem Dienstleistungen und neue Aufträge.",
    },
    counterweights: [
      "BIP wird revidiert und blickt zurück.",
      "Umfragen können Stimmung stärker erfassen als tatsächliche Mengen.",
    ],
    takeaway:
      "Frage: wächst die Wirtschaft, verbessert sich ihr Tempo oder überrascht sie nur die Erwartung?",
    action:
      "Vergleiche Industrie, Dienstleistungen und neue Aufträge, bevor du einen allgemeinen Wachstumsbefund formulierst.",
    quiz: {
      question: "Was misst ein PMI hauptsächlich?",
      options: [
        "Die Höhe des BIP in Euro.",
        "Die gemeldete Richtung von Veränderungen bei befragten Firmen.",
        "Den fairen Wechselkurs.",
      ],
      correct: 1,
      explanation:
        "Ein PMI ist ein Befragungsindex. Er ist keine direkte Produktionssumme.",
    },
    related: ["expectations", "copper", "china-slowdown"],
    terms: ["gdp", "pmi", "new-orders"],
    sources: ["rba-growth", "ism"],
    tools: [{ label: "Wachstumsdaten vergleichen", path: "/economic-data" }],
  }),
  defineLesson("basics", {
    id: "labor",
    title: "Arbeitsmarkt: Mehr als eine Jobzahl",
    subtitle: "Beschäftigung, Löhne und Erwerbsbeteiligung zusammen lesen",
    summary:
      "Ein Arbeitsmarktbericht enthält mehrere Perspektiven auf Nachfrage und möglichen Preisdruck.",
    context:
      "Firmen stellen oft erst ein, wenn sie genug Nachfrage erwarten. Beschäftigung kann deshalb verzögert reagieren. Die Arbeitslosenquote berücksichtigt Menschen, die arbeiten oder aktiv Arbeit suchen. Wenn Menschen die Suche aufgeben, kann die Quote fallen, obwohl kein neuer Job entsteht. Löhne, Arbeitsstunden und Erwerbsbeteiligung geben zusätzlichen Kontext.",
    drivers: [
      [
        "Beschäftigung",
        "Mehr Stellen können Einkommen und Konsum stützen.",
        "Jobwachstum und Revisionen.",
      ],
      [
        "Löhne",
        "Steigende Löhne stärken Kaufkraft, können aber bei schwacher Produktivität Kosten erhöhen.",
        "Lohnwachstum und Produktivität.",
      ],
      [
        "Erwerbsbeteiligung",
        "Ein verändertes Arbeitsangebot beeinflusst die Arbeitslosenquote.",
        "Quote und Beteiligung gemeinsam.",
      ],
    ],
    chain: [
      ["Nachfrage steigt", "Firmen benötigen mehr Arbeitskraft."],
      ["Einstellungen", "Beschäftigung kann wachsen."],
      [
        "Engpässe",
        "Bei wenig verfügbarem Personal können Löhne stärker steigen.",
      ],
      ["Zinsweg", "Die Zentralbank prüft Wachstum und Inflationsdruck."],
    ],
    example: {
      title: "Arbeitslosigkeit sinkt ohne Jobboom",
      situation:
        "Gedankenbeispiel: Die Arbeitslosenquote fällt, zugleich verlassen viele Menschen den Arbeitsmarkt.",
      explanation:
        "Die Quote allein suggeriert Stärke. Die Beteiligung erklärt eine andere mögliche Ursache. Suche nach Beschäftigung und Arbeitsstunden, bevor du die Zahl bewertest.",
    },
    counterweights: [
      "Starke Jobdaten können aus wenigen Branchen stammen.",
      "Lohnwachstum ist zusammen mit Produktivität und Preisentwicklung zu lesen.",
    ],
    takeaway:
      "Lies Stellen, Quote, Beteiligung, Löhne und Revisionen als gemeinsames Bild.",
    action:
      "Notiere nach einem Bericht einen stärkenden und einen schwächenden Befund.",
    quiz: {
      question:
        "Kann die Arbeitslosenquote fallen, weil Menschen die Jobsuche aufgeben?",
      options: [
        "Ja, die Quote hängt auch von der Erwerbsbevölkerung ab.",
        "Nein, sie zählt immer alle Menschen.",
        "Die Quote sinkt nur, wenn die Zahl der Arbeitsplätze wächst.",
      ],
      correct: 0,
      explanation:
        "Wer nicht mehr aktiv sucht, gehört nach der üblichen Definition nicht mehr zu den Arbeitslosen. Landesdefinitionen müssen geprüft werden.",
    },
    related: ["usd", "gbp", "soft-landing"],
    terms: ["participation", "wage-growth", "revision"],
    sources: ["bls-labor", "rba-labor"],
    tools: [{ label: "Arbeitsmarktdaten ansehen", path: "/economic-data" }],
  }),
  defineLesson("basics", {
    id: "bonds",
    title: "Anleihen: Kurs und Rendite bewegen sich gegensinnig",
    subtitle: "Warum höhere Yields nicht automatisch gute Nachrichten sind",
    summary:
      "Bei fest verzinsten Anleihen fällt der Kurs meist, wenn vergleichbare Marktrenditen steigen.",
    context:
      "Eine alte Anleihe zahlt einen festen Kupon. Wenn neue vergleichbare Anleihen mehr Zins zahlen, wird die alte weniger attraktiv und ihr Kurs muss meist fallen. Rendite ist der Ertrag im Verhältnis zum bezahlten Preis und zu den künftigen Zahlungen. Sie ist weder Kupon noch Kurs. Für den Vergleich brauchst du dieselbe Laufzeit, Währung und ähnliche Kreditqualität.",
    drivers: [
      [
        "Zinserwartung",
        "Der erwartete Zinsweg beeinflusst besonders kurze Laufzeiten.",
        "Gleiche Laufzeiten in beiden Ländern.",
      ],
      [
        "Inflation und Laufzeitrisiko",
        "Lange Laufzeiten verlangen Ausgleich für unsichere künftige Preise und Zinsen.",
        "Inflationserwartung und Laufzeitprämie.",
      ],
      [
        "Kreditvertrauen",
        "Eine höhere Rendite kann eine größere Risikoprämie ausdrücken.",
        "Abstände zu vergleichbaren sicheren Anleihen.",
      ],
    ],
    chain: [
      ["Neue Renditen steigen", "Neue Anleihen bieten mehr Ertrag."],
      ["Alte feste Zahlungen", "Ihr Kupon bleibt unverändert."],
      ["Kurs passt sich an", "Die alte Anleihe wird günstiger."],
      [
        "Rendite steigt",
        "Der geringere Preis erhöht den rechnerischen Ertrag.",
      ],
    ],
    example: {
      title: "Wachstum oder Vertrauensverlust?",
      situation:
        "Gedankenbeispiel: Die britische Rendite steigt. Einmal wegen robuster Nachfrage, einmal wegen Sorge um Staatsfinanzen.",
      explanation:
        "Für GBP können diese Ursachen unterschiedlich wirken. Im zweiten Fall ist die höhere Rendite teilweise ein geforderter Risikoausgleich. Das ist kein kostenloser Währungsvorteil.",
    },
    counterweights: [
      "Lange Laufzeit bedeutet meist stärkere Kursempfindlichkeit.",
      "Kreditrisiko und Liquidität können die reine Zinsgeschichte überlagern.",
    ],
    takeaway: "Erkläre zuerst, weshalb die Rendite steigt.",
    action:
      "Vergleiche einen Zinsabstand nur für denselben Beobachtungstag und dieselbe Laufzeit.",
    quiz: {
      question:
        "Neue vergleichbare Marktzinsen steigen. Was passiert typischerweise mit einer alten Festzinsanleihe?",
      options: [
        "Ihr Kupon steigt automatisch.",
        "Ihr Kurs fällt.",
        "Ein fester Kupon hält den Verkaufspreis bis zur Fälligkeit konstant.",
      ],
      correct: 1,
      explanation:
        "Die festen Zahlungen werden im Vergleich weniger attraktiv. Ein geringerer Preis gleicht das aus.",
    },
    related: ["real-yields", "gbp", "token-bonds"],
    terms: ["yield", "coupon", "duration", "term-premium"],
    sources: ["sec-bonds", "ecb-transmission"],
    tools: [{ label: "Renditen und Zinskurven", path: "/government-bonds" }],
  }),
];
