import { defineLesson } from "../learning-types";

export const currencyLessons = [
  defineLesson("currencies", {
    id: "cad",
    title: "CAD · Kanada ist mehr als Öl",
    subtitle: "Energie, USA und relative Zinsen verbinden",
    summary:
      "CAD reagiert auf Rohstoffe, die US-Wirtschaft, Zinsunterschiede und Vertrauen. Öl allein erklärt ihn nicht.",
    context:
      "Kanada verkauft Energie und andere Rohstoffe ins Ausland und ist wirtschaftlich eng mit den USA verbunden. Höhere Exportpreise können Einkommen und Investitionen unterstützen. Die Bank of Canada (BoC) ist Kanadas Zentralbank; die Federal Reserve (Fed) ist das Zentralbanksystem der USA. Für den Wechselkurs zählt auch, ob Anleger kanadische Anlagen relativ attraktiv finden. Ein Ölpreisanstieg wegen guter Weltnachfrage ist eine andere Nachricht als ein Ölpreisanstieg wegen eines Kriegs. USD/CAD steigt, wenn CAD gegenüber USD schwächer wird.",
    drivers: [
      [
        "Öl und Exportpreise",
        "Höhere Erlöse können Kanadas Außenwirtschaft stützen. Qualität, Transportkosten und Preisabstände beeinflussen, was tatsächlich ankommt.",
        "WTI, kanadische Preisabstände und Ursache der Bewegung.",
      ],
      [
        "BoC gegenüber Fed",
        "Ein erwarteter Zinsnachteil kann Rohstoffunterstützung überlagern. Absicherungen und Risiken begrenzen die einfache Zinslogik.",
        "Zinswege und vergleichbare kurze Renditen.",
      ],
      [
        "USA und Handel",
        "US-Nachfrage hilft vielen kanadischen Exporteuren. Handelsunsicherheit kann das Gegenteil bewirken.",
        "US-Wachstum, Exportaufträge und Handelsregeln.",
      ],
    ],
    chain: [
      ["Nachfrage nach Energie", "Die Welt kauft im Gedankenbeispiel mehr Öl."],
      ["Kanadische Erlöse", "Exportfirmen können mehr einnehmen."],
      [
        "Wirtschaft und Kapital",
        "Einkommen und Investitionsaussichten können profitieren.",
      ],
      [
        "CAD im Vergleich",
        "Unterstützung ist möglich, sofern USD-Zinsvorteil oder Risikoangst nicht dominieren.",
      ],
    ],
    example: {
      title: "Öl steigt, CAD fällt trotzdem",
      situation:
        "Gedankenbeispiel: Ein Lieferausfall treibt Öl hoch. Anleger suchen gleichzeitig USD-Liquidität; die BoC wird als deutlich lockerer als die Fed eingeschätzt.",
      explanation:
        "Drei Kräfte treffen aufeinander: bessere Ölpreise, größerer Zinsnachteil und Risikoaversion. CAD kann trotz Öl nachgeben. Deine erste Frage sollte deshalb sein: Warum steigt Öl, und was passiert auf der USD-Seite?",
    },
    counterweights: [
      "Ein Ölpreisgewinn ist kein fester CAD-Koeffizient. Beziehungen ändern sich.",
      "Hohe Haushaltsschulden und teure Finanzierung können die heimische Nachfrage dämpfen.",
    ],
    takeaway:
      "Prüfe bei CAD immer Ölursache, US-Kontext und BoC–Fed-Vergleich.",
    action:
      "Erstelle drei Spalten: Rohstoffe, Zinsen, USA/Risiko. Trage je einen Befund und eine Gegenkraft ein.",
    quiz: {
      question:
        "Öl steigt. Welche zusätzliche Frage ist für CAD besonders sinnvoll?",
      options: [
        "Steigt Öl wegen Nachfrage oder wegen Angebotsstress, und was macht USD?",
        "Reicht der Ölpreisanstieg aus, um Zinsen und USD zu ignorieren?",
        "Kann ich nun sicher mit steigendem CAD rechnen?",
      ],
      correct: 0,
      explanation:
        "Die Ursache des Ölpreisanstiegs und die Gegenseite bestimmen, ob die Rohstoffwirkung tatsächlich dominiert.",
    },
    related: ["oil", "usd", "fx-pairs", "oil-shock"],
    terms: ["terms-of-trade", "rate-path", "risk-off", "boc", "fed"],
    sources: ["boc-oil", "boc-fx", "boc-forecast"],
    tools: [
      { label: "BoC und Fed vergleichen", path: "/rates" },
      { label: "CAD-Kontext in der Heatmap", path: "/macro" },
    ],
  }),
  defineLesson("currencies", {
    id: "gbp",
    title: "GBP · Zinsen, Löhne und Vertrauen",
    subtitle:
      "Warum steigende britische Renditen zwei Geschichten haben können",
    summary:
      "GBP verbindet den Zinsweg der Bank of England mit Wachstum, Dienstleistungsinflation und Vertrauen.",
    context:
      "Das Vereinigte Königreich hat eine große Dienstleistungswirtschaft. Löhne und Dienstleistungspreise helfen zu verstehen, ob Inflation hartnäckig bleibt. Das kann den erwarteten Zinsweg beeinflussen. Zugleich belasten hohe Finanzierungskosten Haushalte und Firmen, oft erst bei einer Anschlussfinanzierung. GBP/USD enthält außerdem die US-Geschichte; EUR/GBP enthält die des Euroraums.",
    drivers: [
      [
        "BoE-Zinsweg",
        "Weniger erwartete Senkungen können Pfundanlagen relativ attraktiver machen, wenn der Risikoausgleich nicht gleichzeitig steigt.",
        "BoE-Botschaft gegenüber Fed oder EZB.",
      ],
      [
        "Löhne und Dienstleistungen",
        "Anhaltender Preisdruck kann die Bank vorsichtiger mit Senkungen machen.",
        "Löhne, Dienstleistungen und Arbeitsmarkt.",
      ],
      [
        "Wachstum und Vertrauen",
        "Schwache Nachfrage oder Zweifel an Fiskalplänen können Kapitalanleger verunsichern.",
        "Reales Wachstum, Gilts und GBP gemeinsam.",
      ],
    ],
    chain: [
      [
        "Löhne überraschen",
        "Sie steigen im Gedankenbeispiel stärker als erwartet.",
      ],
      [
        "Inflationsfrage",
        "Dienstleistungspreise könnten länger unter Druck stehen.",
      ],
      ["Zinserwartung", "Der Markt rechnet mit späteren BoE-Senkungen."],
      [
        "GBP",
        "Relative Unterstützung ist möglich, wenn Wachstums- und Vertrauensrisiken begrenzt bleiben.",
      ],
    ],
    example: {
      title: "Mehr Rendite, weniger Vertrauen",
      situation:
        "Gedankenbeispiel: Britische Anleiherenditen steigen stark, während GBP fällt und Risikoaufschläge zunehmen.",
      explanation:
        "Das kann zu einer Vertrauensgeschichte passen: Anleger verlangen mehr Entschädigung, statt einfach attraktive Zinsen zu sehen. Die Ursache der Renditebewegung ist entscheidend. Ein einzelner Chart beweist sie allerdings nicht.",
    },
    counterweights: [
      "Ein hoher Zins kann Wachstum und Schuldner belasten.",
      "Hohe Inflation stützt GBP nur dann über den Zinskanal, wenn andere Kräfte nicht überwiegen.",
    ],
    takeaway:
      "Für GBP brauchst du die Verbindung zwischen Inflation, BoE, Wachstum und Vertrauen.",
    action:
      "Vergleiche bei einer GBP-Bewegung Lohn-/Inflationsnachricht, kurze Renditen und die jeweilige Gegenwährung.",
    quiz: {
      question:
        "Warum können höhere Gilt-Renditen mit fallendem GBP zusammen auftreten?",
      options: [
        "Weil Renditen niemals etwas bedeuten.",
        "Weil sie auch eine höhere Risikoprämie wegen Vertrauenssorgen ausdrücken können.",
        "Weil GBP immer Öl folgt.",
      ],
      correct: 1,
      explanation:
        "Höhere Renditen können auf größere Risiken zurückgehen. Der zusätzliche Zins ist dann kein eindeutiger Vorteil.",
    },
    related: ["bonds", "labor", "inflation", "central-banks"],
    terms: ["risk-premium", "yield", "wage-growth"],
    sources: ["boe-fx", "boe-transmission", "sec-bonds"],
    tools: [
      { label: "BoE-Briefings", path: "/central-bank-reports" },
      { label: "Gilt-Renditen einordnen", path: "/government-bonds" },
    ],
  }),
  defineLesson("currencies", {
    id: "usd",
    title: "USD · Weltwährung und Finanzierungswährung",
    subtitle: "Fed, US-Daten und der Bedarf an Dollarliquidität",
    summary:
      "USD wird für Handel, Reserven und Finanzierung genutzt. Deshalb wirken auch globale Spannungen auf ihn.",
    context:
      "Viele internationale Rechnungen und Schulden sind in Dollar. In unsicheren Phasen kann deshalb Nachfrage nach USD entstehen, selbst wenn die Krise aus den USA kommt. Daneben zählt der erwartete Fed-Zinsweg relativ zum Ausland. Diese Rollen sind hilfreich zum Verstehen, aber keine Zusage, dass USD in jeder Krise steigt.",
    drivers: [
      [
        "Fed relativ zum Ausland",
        "Ein höherer erwarteter relativer Ertrag kann Dollar-Anlagen unterstützen.",
        "Zinswege und kurze Renditeabstände.",
      ],
      [
        "US-Wachstum und Inflation",
        "Neue Daten verändern Erwartungen für Gewinne und Geldpolitik.",
        "Jobs, Konsum, CPI/PCE und Revisionen.",
      ],
      [
        "Dollarfinanzierung",
        "Schuldenrückzahlungen, Absicherungen und Liquiditätsbedarf können USD-Nachfrage auslösen.",
        "Finanzierungsstress und breite Marktreaktion.",
      ],
    ],
    chain: [
      ["Unsicherheit", "Anleger reduzieren im Beispiel Risiken."],
      ["Liquiditätsbedarf", "Einige müssen Dollarverbindlichkeiten bedienen."],
      ["USD-Nachfrage", "Sie verkaufen andere Anlagen oder kaufen Dollar."],
      [
        "Gegenseite",
        "Währungen mit größerem Finanzierungs- oder Risikoproblem können nachgeben.",
      ],
    ],
    example: {
      title: "Schwache Daten, starker Dollar",
      situation:
        "Gedankenbeispiel: US-Daten enttäuschen, weltweit entsteht aber deutlich größerer Finanzierungsstress.",
      explanation:
        "Erwartete Fed-Senkungen sprechen gegen USD. Nachfrage nach Liquidität spricht dafür. Welche Kraft dominiert, ist eine empirische Frage, kein Widerspruch.",
    },
    counterweights: [
      "Vertrauensverlust in US-Institutionen kann den Schutzgedanken schwächen.",
      "Einzelne Paare und ein breiter Dollarindex können unterschiedlich reagieren.",
    ],
    takeaway:
      "USD hat eine heimische Zinsgeschichte und eine globale Liquiditätsgeschichte.",
    action:
      "Trenne bei USD zuerst US-Daten, relative Zinsen und globalen Stress.",
    quiz: {
      question:
        "Kann USD bei globalem Stress trotz schwacher US-Daten steigen?",
      options: [
        "Ja, Dollarfinanzierungsbedarf kann gegenläufig wirken.",
        "Nein, USD reagiert nur auf BIP.",
        "Nur wenn alle Rohstoffe steigen.",
      ],
      correct: 0,
      explanation:
        "Mehrere Treiber können gleichzeitig wirken. Dollarliquidität ist ein eigener Kanal.",
    },
    related: ["dollar-cycle", "liquidity", "fx-pairs"],
    terms: ["reserve-currency", "liquidity", "risk-off"],
    sources: ["fed-dollar", "fed-dollar-conference", "bis-carry"],
  }),
  defineLesson("currencies", {
    id: "eur",
    title: "EUR · Eine Währung, viele Volkswirtschaften",
    subtitle: "EZB, Energie und Zusammenhalt des Euroraums",
    summary:
      "EUR reagiert auf relative Zinsen, regionale Nachfrage, Energiebedingungen und Finanzierungsrisiken im Euroraum.",
    context:
      "Der Euro verbindet Volkswirtschaften mit unterschiedlichen Branchen und Staatsfinanzen. Gute deutsche Industriedaten sind deshalb nur ein Teil der Geschichte. Für EUR/USD zählt auch die Fed. Ein Energieschock kann Importkosten und Inflation erhöhen und zugleich Wachstum bremsen. Die EZB muss diese gegenläufigen Wirkungen einordnen.",
    drivers: [
      [
        "EZB gegenüber Fed",
        "Die erwartete relative Verzinsung beeinflusst Kapitalentscheidungen.",
        "Zinswege und vergleichbare Renditen.",
      ],
      [
        "Energie und Nachfrage",
        "Teure importierte Energie kann Einkommen und Produktion belasten.",
        "Energiepreise, Industrie und Dienstleistungen.",
      ],
      [
        "Finanzielle Unterschiede",
        "Steigende staatliche Risikoaufschläge können Sorge über Finanzierungsbedingungen ausdrücken.",
        "Gleiche Laufzeiten und Länderabstände.",
      ],
    ],
    chain: [
      ["Importenergie wird teurer", "Kosten für Firmen und Haushalte steigen."],
      ["Einkommen", "Weniger Kaufkraft bleibt für andere Ausgaben."],
      ["Zielkonflikt", "Inflation steigt, Wachstum kann sinken."],
      ["EUR", "Die Reaktion hängt von EZB, Gegenwährung und Vertrauen ab."],
    ],
    example: {
      title: "EZB erhöht, EUR steigt nicht",
      situation:
        "Gedankenbeispiel: Eine erwartete EZB-Erhöhung kommt, gleichzeitig verschlechtert sich der Wachstumsausblick.",
      explanation:
        "Die Entscheidung liefert wenig Überraschung, die Wachstumssorge dagegen eine neue Nachricht. Vergleiche beides mit der US-Seite.",
    },
    counterweights: [
      "Unternehmen können Energie absichern oder ihre Beschaffung ändern.",
      "Euroraum-Durchschnitte verdecken regionale Unterschiede.",
    ],
    takeaway:
      "Lies EUR als regionales Gesamtbild und immer relativ zur Gegenwährung.",
    action:
      "Verbinde bei EUR eine Zins-, eine Wachstums- und eine Energiebeobachtung.",
    quiz: {
      question: "Warum kann teure Energie den Euroraum doppelt belasten?",
      options: [
        "Sie kann Kosten erhöhen und Kaufkraft senken.",
        "Sie garantiert mehr reales Einkommen.",
        "Sie macht die Fed bedeutungslos.",
      ],
      correct: 0,
      explanation:
        "Ein Kostenanstieg kann Inflation treiben und gleichzeitig Nachfrage bremsen.",
    },
    related: ["oil-shock", "stagflation", "central-banks"],
    terms: ["terms-of-trade", "spread", "hawkish"],
    sources: ["ecb-transmission", "rba-inflation", "eia-oil"],
  }),
  defineLesson("currencies", {
    id: "aud",
    title: "AUD · China, Rohstoffe und Risikobereitschaft",
    subtitle: "Eisenerz erklärt einen Teil, nicht jeden Handelstag",
    summary:
      "AUD verbindet Australiens Exportpreise mit globaler Nachfrage, China und dem relativen RBA-Zinsweg.",
    context:
      "Australien exportiert unter anderem Eisenerz, Kohle und Gas. Wenn Exportpreise relativ zu Importpreisen steigen, verbessert sich das Austauschverhältnis im Außenhandel. China ist für viele Rohstoffketten wichtig. Eine Schwäche beim chinesischen Bau kann deshalb anders wirken als eine Stärke in Elektronik oder Dienstleistungen.",
    drivers: [
      [
        "Exportpreise",
        "Bessere Rohstofferlöse können Einkommen und Investitionen stützen.",
        "Eisenerz und andere Exportpreise.",
      ],
      [
        "China-Nachfrage",
        "Bau, Stahl und Industrie benötigen unterschiedliche Rohstoffe.",
        "Sektoren, Mengen und neue Aufträge.",
      ],
      [
        "RBA und Risiko",
        "Relative Zinsen und globale Risikobereitschaft beeinflussen Kapitalflüsse.",
        "RBA-Zinsweg gegenüber Fed und Risikoindikatoren.",
      ],
    ],
    chain: [
      ["Bau in China schwächer", "Weniger neue Projekte werden begonnen."],
      ["Stahlbedarf", "Er kann nachlassen."],
      [
        "Eisenerzaussichten",
        "Australische Exporterlöse können unter Druck geraten.",
      ],
      [
        "AUD",
        "Ein Belastungskanal entsteht; RBA und USD können ihn verstärken oder überlagern.",
      ],
    ],
    example: {
      title: "China wächst, AUD reagiert kaum",
      situation:
        "Gedankenbeispiel: Chinas Dienstleistungen wachsen, der Bau bleibt schwach.",
      explanation:
        "Die Gesamtzahl klingt gut, hilft der Eisenerznachfrage aber möglicherweise wenig. Frage nach der Art des Wachstums statt nur nach dem BIP.",
    },
    counterweights: [
      "Angebotsausfälle können Rohstoffpreise trotz schwacher Nachfrage stützen.",
      "AUD ist kein direkter Anspruch auf das chinesische BIP.",
    ],
    takeaway:
      "Für AUD zählt, welche China-Nachfrage welche australischen Exporte erreicht.",
    action:
      "Vergleiche eine China-Nachricht mit Stahl-/Baukontext und dem RBA–Fed-Zinsbild.",
    quiz: {
      question:
        "Welche China-Nachricht ist besonders direkt für Eisenerz relevant?",
      options: [
        "Mehr Restaurantbesuche allein.",
        "Neue Bauprojekte und Stahlproduktion.",
        "Die Anzahl neuer Apps allein.",
      ],
      correct: 1,
      explanation:
        "Eisenerz wird vor allem für Stahl gebraucht. Der Sektor der Nachfrage ist entscheidend.",
    },
    related: ["iron-ore", "china-slowdown", "terms-of-trade"],
    terms: ["terms-of-trade", "risk-off", "rate-path"],
    sources: ["rba-aud", "rba-trade"],
    tools: [
      { label: "China-Kontext in Regime Insights", path: "/regime-insights" },
    ],
  }),
  defineLesson("currencies", {
    id: "nzd",
    title: "NZD · Agrarerlöse und globale Finanzierung",
    subtitle: "Milchpreise helfen beim Kontext, sind aber kein Schalter",
    summary:
      "NZD reagiert auf Exportpreise, RBNZ-Zinsen, Handelspartner und die globale Risikobereitschaft.",
    context:
      "Neuseeland exportiert viele Agrarprodukte. Gute Exportpreise können Einkommen und die Außenwirtschaft unterstützen. Gleichzeitig ist der NZD ein Finanzmarktpreis: Kapitalflüsse, Zinsdifferenzen und Risiko ändern ihn auch ohne neue Agrarnachricht. NZD/USD und AUD/NZD enthalten unterschiedliche Gegenstücke.",
    drivers: [
      [
        "Agrarpreise",
        "Bessere Exporterlöse können die wirtschaftlichen Aussichten verbessern.",
        "Milchproduktpreise, Mengen und Handelsbedingungen.",
      ],
      [
        "RBNZ relativ zum Ausland",
        "Der erwartete Zinsweg beeinflusst die Attraktivität von NZD-Anlagen.",
        "OCR-Erwartung gegenüber Fed und RBA.",
      ],
      [
        "Risiko und Partner",
        "Globale Vorsicht und schwache Handelspartner können Kapital- und Exportaussichten belasten.",
        "China-Kontext und breite Risikobereitschaft.",
      ],
    ],
    chain: [
      ["Exportpreise steigen", "Landwirtschaft kann höhere Erlöse erzielen."],
      ["Einkommen", "Investitionen und Ausgaben können profitieren."],
      ["Ausblick", "Wachstums- und Zinsannahmen werden geprüft."],
      ["NZD", "Unterstützung ist möglich, aber nicht mechanisch."],
    ],
    example: {
      title: "Milchpreise gegen Zinsnachteil",
      situation:
        "Gedankenbeispiel: Milchproduktpreise steigen, die RBNZ signalisiert gleichzeitig schnellere Senkungen als die Fed.",
      explanation:
        "Exporterlöse und relative Zinsen senden unterschiedliche Botschaften. Behalte beide, statt eine passende Geschichte auszuwählen.",
    },
    counterweights: [
      "Höhere Preise können mit geringeren Produktionsmengen einhergehen.",
      "Kurzfristige Wechselkursschwankungen sind nur begrenzt durch Exportpreise erklärbar.",
    ],
    takeaway: "Verknüpfe Agrarerlöse mit Mengen, Zinsweg und Gegenwährung.",
    action:
      "Notiere zu einer Agrarpreismeldung auch die Produktionsmenge und den RBNZ-Ausblick.",
    quiz: {
      question: "Garantieren höhere Milchpreise einen stärkeren NZD?",
      options: [
        "Ja, ohne Ausnahme.",
        "Nein, Zinsen, Mengen und globale Risiken wirken ebenfalls.",
        "Ja, solange Milchpreise in USD statt NZD gemessen werden.",
      ],
      correct: 1,
      explanation:
        "Ein Rohstoffpreis ist ein Treiber innerhalb eines größeren Zusammenhangs.",
    },
    related: ["aud", "fx-pairs", "carry-trade"],
    terms: ["terms-of-trade", "rate-path", "carry"],
    sources: ["rbnz-drivers", "rbnz-commodities"],
  }),
  defineLesson("currencies", {
    id: "jpy",
    title: "JPY · Zinsabstände und Carry-Auflösung",
    subtitle: "Warum der Yen plötzlich stark werden kann",
    summary:
      "JPY reagiert auf Japans Zinsweg, ausländische Renditen und die Auflösung von Finanzierungen in Yen.",
    context:
      "Wenn Yen-Finanzierung relativ günstig ist, können Anleger in Yen leihen und in höher verzinste Fremdwährungsanlagen investieren. Dafür verkaufen sie Yen. Beim Rückbau solcher Geschäfte brauchen sie Yen zurück. Der Ablauf erklärt einen möglichen Verstärker, macht JPY aber nicht in jeder Krise zu einer sicheren Anlage.",
    drivers: [
      [
        "BoJ gegenüber Ausland",
        "Ein kleinerer Zinsabstand kann die Attraktivität einer Yen-Finanzierung verringern.",
        "Japanische und ausländische kurze Renditen.",
      ],
      [
        "Carry und Hebel",
        "Viele ähnliche gehebelte Positionen können sich bei Stress gleichzeitig umkehren.",
        "Positionierung und Volatilität.",
      ],
      [
        "Importkosten und Politik",
        "Energieimporte und politische Maßnahmen verändern zusätzliche Rahmenbedingungen.",
        "Energiepreise und offizielle Mitteilungen.",
      ],
    ],
    chain: [
      ["Unsicherheit steigt", "Risikopositionen werden reduziert."],
      ["Carry wird geschlossen", "Fremdwährungsanlagen werden verkauft."],
      ["Yen werden gebraucht", "Finanzierungen werden zurückgeführt."],
      ["JPY kann steigen", "Die Rückkäufe können die Bewegung verstärken."],
    ],
    example: {
      title: "Wenig neue Japan-Daten, große Yen-Bewegung",
      situation:
        "Gedankenbeispiel: Volatilität steigt stark und ausländische Renditen fallen.",
      explanation:
        "Carry-Rückbau kann JPY bewegen, ohne dass Japans BIP plötzlich viel besser ist. Unterscheide heimische Nachricht und globale Positionsänderung.",
    },
    counterweights: [
      "Ein Yen-Zinsnachteil kann auch lange bestehen bleiben.",
      "Interventionen und Risikoreaktionen sind nicht zuverlässig vorhersagbar.",
    ],
    takeaway:
      "Bei JPY frage nach Zinsabstand, Finanzierung und möglichen Rückkäufen.",
    action:
      "Vergleiche die Yen-Bewegung mit ausländischen Renditen und dem breiten Stressbild.",
    quiz: {
      question:
        "Was kann beim Schließen eines yenfinanzierten Carry Trades nötig werden?",
      options: [
        "Yen zurückkaufen.",
        "Immer noch mehr Yen verkaufen.",
        "Der Zinsvorteil deckt jede Wechselkursbewegung automatisch ab.",
      ],
      correct: 0,
      explanation:
        "Eine Yen-Verbindlichkeit muss in Yen bedient werden. Rückkäufe können den Kurs stützen.",
    },
    related: ["carry-trade", "liquidity", "chf"],
    terms: ["carry", "leverage", "risk-off"],
    sources: ["bis-carry", "bis-carry-unwind"],
  }),
  defineLesson("currencies", {
    id: "chf",
    title: "CHF · Vertrauen und die Reaktion der SNB",
    subtitle:
      "Ein Schutzmotiv trifft auf niedrige Zinsen und Wechselkurspolitik",
    summary:
      "CHF kann von Schutzsuche profitieren. Die SNB und der Zinsabstand wirken dagegen oder daneben.",
    context:
      "Die Schweiz ist eine kleine, offene Wirtschaft. Wechselkurse beeinflussen deshalb Importpreise und Wettbewerbsfähigkeit. Eine starke Aufwertung kann Inflation dämpfen. Die SNB berücksichtigt den Wechselkurs in ihrer Geldpolitik und kann Devisenmaßnahmen einsetzen. Ein Schutzmotiv ist eine beobachtete Eigenschaft in manchen Phasen, keine Garantie für jeden Schock.",
    drivers: [
      [
        "Vertrauen und Schutzsuche",
        "Anleger können bei Unsicherheit Frankenanlagen bevorzugen.",
        "Art des Schocks und EUR/CHF.",
      ],
      [
        "SNB-Zinsweg",
        "Ein relativer Zinsnachteil kann die Attraktivität begrenzen.",
        "SNB gegenüber EZB und Fed.",
      ],
      [
        "Devisenpolitik",
        "Devisenkäufe oder -verkäufe können die Währungsbedingungen beeinflussen.",
        "Offizielle SNB-Botschaft, keine Gerüchte.",
      ],
    ],
    chain: [
      ["Unsicherheit", "Nachfrage nach vertrauten Anlagen nimmt zu."],
      ["CHF-Nachfrage", "Ein Teil fließt in Franken."],
      ["Importpreise", "Ein stärkerer CHF kann Importe verbilligen."],
      ["SNB-Reaktion", "Die Bank prüft die Wirkung auf Preisstabilität."],
    ],
    example: {
      title: "Aufwertung mit Gegenkraft",
      situation:
        "Gedankenbeispiel: CHF steigt durch Schutzsuche. Die SNB betont zugleich die Belastung für Preisstabilität.",
      explanation:
        "Die Zentralbankreaktion gehört zur Geschichte. Ein anfänglicher Schutzimpuls muss nicht unverändert weiterlaufen.",
    },
    counterweights: [
      "Geldpolitische Maßnahmen können Erwartungen schnell ändern.",
      "CHF, JPY und USD haben unterschiedliche Schutz- und Finanzierungsrollen.",
    ],
    takeaway:
      "Vertrauen allein genügt nicht: Lies die SNB und den relativen Zinsweg mit.",
    action:
      "Prüfe bei CHF die SNB-Erklärung zur Wechselkurswirkung und die Gegenwährung.",
    quiz: {
      question: "Warum interessiert ein stärkerer CHF die SNB?",
      options: [
        "Er kann Importpreise und damit Inflation beeinflussen.",
        "Er verändert keine Preise.",
        "Die SNB betrachtet ausschließlich die Exportmengen.",
      ],
      correct: 0,
      explanation:
        "Die offene Schweizer Wirtschaft wird über Handelspreise und Nachfrage vom Wechselkurs beeinflusst.",
    },
    related: ["jpy", "usd", "central-banks"],
    terms: ["safe-haven", "intervention", "pass-through"],
    sources: ["snb-policy", "snb-safe-haven"],
  }),
  defineLesson("currencies", {
    id: "cny",
    title: "CNY und CNH · Zwei Märkte für den Renminbi",
    subtitle: "Geldpolitik, Handel und gelenkte Wechselkursbedingungen",
    summary:
      "CNY ist der Onshore-, CNH der Offshore-Markt. Preise können auseinanderlaufen.",
    context:
      "Renminbi ist der Währungsname, Yuan die Einheit. CNY und CNH sind keine zwei völlig unabhängigen Volkswirtschaften. Sie stehen für unterschiedliche Handels- und Liquiditätsbedingungen innerhalb und außerhalb des chinesischen Festlands. Der Wechselkurs wird stärker politisch beeinflusst als bei frei schwankenden großen Währungen. China-Wachstum allein reicht deshalb nicht als Kurserklärung.",
    drivers: [
      [
        "Politischer Rahmen",
        "Fixing und geldpolitische Maßnahmen beeinflussen Erwartungen und Marktbedingungen.",
        "Offizielle Referenzkurse und Mitteilungen.",
      ],
      [
        "Handel und Kapital",
        "Exporterlöse, Importe und Kapitalnachfrage verändern den Währungsbedarf.",
        "Handelsmengen und Kapitalbedingungen.",
      ],
      [
        "Relativer Zins und USD",
        "Ein höherer USD-Ertrag kann den Vergleich verändern.",
        "Zinsabstand und breiter USD-Kontext.",
      ],
    ],
    chain: [
      ["Nachfrage schwächer", "Wachstums- und Preisannahmen verändern sich."],
      ["Politik reagiert", "Lockerung kann erwogen werden."],
      ["Zinsvergleich", "Relative Renditen können unattraktiver werden."],
      [
        "Wechselkurs",
        "Marktkräfte treffen auf politische Steuerung und getrennte Liquidität.",
      ],
    ],
    example: {
      title: "Offshore weicht ab",
      situation:
        "Gedankenbeispiel: In einem Stressmoment handeln Offshore-Teilnehmer zu einem anderen Kurs als Onshore-Teilnehmer.",
      explanation:
        "Liquidität, Zugang und Rahmenbedingungen unterscheiden sich. Du solltest CNH- und CNY-Daten ausdrücklich benennen, statt sie still zu ersetzen.",
    },
    counterweights: [
      "Maßnahmen können die kurzfristige Reaktion begrenzen oder umlenken.",
      "Ein fallender PPI beweist keine bestimmte Wechselkursentscheidung.",
    ],
    takeaway:
      "Prüfe Marktbezeichnung und politischen Rahmen vor der ökonomischen Schlussfolgerung.",
    action:
      "Kontrolliere in jeder Datenquelle ausdrücklich, ob CNY oder CNH gemeint ist.",
    quiz: {
      question: "Sind CNH und CNY immer austauschbare Kursreihen?",
      options: [
        "Ja, Zugang und Liquidität sind identisch.",
        "Nein, Onshore- und Offshore-Bedingungen können sich unterscheiden.",
        "Die Unterscheidung ist nur eine Schreibweise ohne Marktbedeutung.",
      ],
      correct: 1,
      explanation:
        "Es handelt sich um unterschiedliche Märkte für den Renminbi. Eine saubere Analyse benennt den Markt.",
    },
    related: ["china-ppi", "china-stimulus", "usd"],
    terms: ["fixing", "onshore-offshore", "capital-controls"],
    sources: ["hkma-rmb", "imf-china-report"],
  }),
  defineLesson("currencies", {
    id: "nok",
    title: "NOK · Energieexporte und ein kleiner Devisenmarkt",
    subtitle: "Norwegens Ölreichtum ist keine tägliche Kursgarantie",
    summary:
      "NOK verbindet Energieerlöse, relative Zinsen und Risiko- beziehungsweise Liquiditätsbedingungen.",
    context:
      "Norwegen exportiert viel Öl und Gas. Diese Preise beeinflussen Einkommen und Außenhandel. Die Krone ist aber zugleich eine kleinere Finanzmarktwährung. Wenn Anleger Risiken reduzieren, können Kapitalbewegungen kurzfristig stärker sein als die Rohstoffgeschichte. Staatliche Einnahmen und Fondsströme landen zudem nicht automatisch sofort als NOK-Kauf im Devisenmarkt.",
    drivers: [
      [
        "Öl und Gas",
        "Bessere Exportpreise können das Austauschverhältnis stützen.",
        "Preise, Mengen und Ursache des Anstiegs.",
      ],
      [
        "Norges Bank",
        "Der erwartete relative Zinsweg beeinflusst Kapitalentscheidungen.",
        "Zinsabstand zu EUR und USD.",
      ],
      [
        "Liquidität",
        "In einem kleineren Markt können Portfolioanpassungen besonders sichtbar werden.",
        "Volatilität und breites Risiko.",
      ],
    ],
    chain: [
      ["Energiepreise steigen", "Exporterlöse können zunehmen."],
      ["Ausblick", "Einkommen und Investitionen werden neu eingeschätzt."],
      ["Kapitalflüsse", "Anleger vergleichen Zins und Risiko."],
      [
        "NOK",
        "Die Rohstoffwirkung trifft auf Liquiditäts- und Gegenwährungseffekte.",
      ],
    ],
    example: {
      title: "Energie hoch, Krone schwach",
      situation:
        "Gedankenbeispiel: Gas wird teurer, gleichzeitig verlassen internationale Anleger kleinere Risikomärkte.",
      explanation:
        "Der Exporteffekt unterstützt, der Kapitalfluss belastet. Ein Energiechart allein erklärt die Krone deshalb nicht.",
    },
    counterweights: [
      "Energieeinnahmen werden über verschiedene staatliche und private Wege verwendet.",
      "Der Zinsvorteil kann vom Wechselkursrisiko aufgezehrt werden.",
    ],
    takeaway:
      "Bei NOK ergänzen Zins- und Liquiditätsbedingungen die Energiegeschichte.",
    action:
      "Vergleiche NOK nicht nur mit Öl, sondern auch mit EUR/NOK und anderen kleineren Währungen.",
    quiz: {
      question: "Warum kann NOK trotz besserer Ölpreise nachgeben?",
      options: [
        "Kapitalabflüsse und Risikoaversion können den Exportkanal überlagern.",
        "Bessere Exportpreise sorgen zwangsläufig am selben Tag für NOK-Käufe.",
        "Risiko und Liquidität können eine Energieexportwährung nicht beeinflussen.",
      ],
      correct: 0,
      explanation:
        "Rohstofferlöse sind ein wirtschaftlicher Treiber, kurzfristige Kapitalbewegungen ein weiterer.",
    },
    related: ["oil", "gas", "liquidity"],
    terms: ["terms-of-trade", "liquidity", "risk-premium"],
    sources: ["norges-nok", "norges-policy"],
  }),
  defineLesson("currencies", {
    id: "sek",
    title: "SEK · Industrie, Europa und Finanzierung",
    subtitle: "Die schwedische Krone im regionalen Zusammenhang",
    summary:
      "SEK reagiert auf relative Zinsen, Exportnachfrage und heimische Finanzierungsbedingungen.",
    context:
      "Schweden ist eine offene Volkswirtschaft. Die Nachfrage wichtiger Handelspartner beeinflusst Unternehmen; Zinsänderungen wirken auf Schuldner und Konsum. Die Riksbank berücksichtigt wiederum den Wechselkurs, weil er Importpreise beeinflusst. Eine schwächere Krone kann Exporte preislich unterstützen und gleichzeitig Importe verteuern.",
    drivers: [
      [
        "Riksbank relativ zur EZB",
        "Änderungen des erwarteten Zinsabstands beeinflussen SEK-Anlagen.",
        "Zinswege und vergleichbare Renditen.",
      ],
      [
        "Europäische Nachfrage",
        "Weniger Aufträge bei Partnern können den Exportausblick belasten.",
        "Industrieaufträge und Partnerkonjunktur.",
      ],
      [
        "Finanzierung und Wechselkurs",
        "Kreditkosten beeinflussen Nachfrage; Importpreise wirken zurück auf Inflation.",
        "Konsum, Kreditbedingungen und importierte Preise.",
      ],
    ],
    chain: [
      ["Zinsabstand sinkt", "SEK-Anlagen bieten relativ weniger Zins."],
      ["Kapitalvergleich", "Einige Anleger passen ihre Gewichtung an."],
      ["SEK kann nachgeben", "Der Wechselkurs verändert Importpreise."],
      [
        "Riksbank",
        "Neue Inflationsbedingungen können den nächsten Zinsweg beeinflussen.",
      ],
    ],
    example: {
      title: "Schwächere Währung mit Rückwirkung",
      situation:
        "Gedankenbeispiel: SEK fällt und importierte Produkte werden teurer.",
      explanation:
        "Das kann eine rasche geldpolitische Lockerung schwieriger machen. Wechselkurs und Zinsen beeinflussen einander.",
    },
    counterweights: [
      "Unternehmen sichern Währungsrisiken oft teilweise ab.",
      "Eine Exportpreishilfe kompensiert nicht automatisch schwache Auslandsnachfrage.",
    ],
    takeaway:
      "Denke bei SEK an Europa, Finanzierung und Rückwirkungen auf Inflation.",
    action:
      "Verbinde eine SEK-Bewegung mit Riksbank-Ausblick und Nachfrage der Handelspartner.",
    quiz: {
      question: "Was kann eine schwächere SEK bei Importen bewirken?",
      options: [
        "Sie können in SEK teurer werden.",
        "Sie werden bei unverändertem Fremdwährungspreis automatisch günstiger.",
        "Sie haben keinen Bezug zu Inflation.",
      ],
      correct: 0,
      explanation:
        "Für einen unveränderten Fremdwährungspreis werden mehr SEK benötigt; Weitergabe und Absicherung bestimmen den Effekt.",
    },
    related: ["eur", "inflation", "central-banks"],
    terms: ["pass-through", "rate-path", "appreciation"],
    sources: ["riksbank-transmission", "rba-fx"],
  }),
  defineLesson("currencies", {
    id: "em-currencies",
    title: "BRL und MXN · Hoher Zins, andere Risiken",
    subtitle: "Schwellenländerwährungen nicht als eine Gruppe behandeln",
    summary:
      "Ein hoher Zins ist kein kostenloser Vorteil. Rohstoffe, Handel, Inflation und Kapitalflüsse unterscheiden sich je Land.",
    context:
      "Brasilien und Mexiko besitzen verschiedene Wirtschaftsstrukturen. Brasiliens Rohstoffexporte machen Agrar- und Metallpreise relevant. Mexikos Produktionsketten sind eng mit US-Nachfrage verbunden. Beide Währungen können für Carry-Geschäfte genutzt werden. Der Zinsertrag muss aber zusammen mit Währungs-, Politik- und Liquiditätsrisiko gelesen werden.",
    drivers: [
      [
        "Realer und relativer Zins",
        "Hohe nominale Zinsen können hohe Inflation oder Risiken kompensieren.",
        "Inflationserwartung und Zinsweg.",
      ],
      [
        "Länderspezifischer Außenhandel",
        "Rohstoffpreise und US-Industrie treffen unterschiedliche Exportketten.",
        "Brasilien: Rohstoffe; Mexiko: US-Nachfrage.",
      ],
      [
        "Kapital und Positionierung",
        "Ein überfüllter Carry Trade kann bei Stress rasch zurückgebaut werden.",
        "Volatilität und Finanzierungsbedingungen.",
      ],
    ],
    chain: [
      ["Hoher Zins lockt", "Anleger kaufen die Zielwährung."],
      [
        "Positionen wachsen",
        "Mehr Kapital setzt auf denselben Ertragsvorteil.",
      ],
      ["Risiko steigt", "Wechselkursverluste bedrohen den Zinsertrag."],
      ["Rückbau", "Verkäufe können den Abwertungsdruck verstärken."],
    ],
    example: {
      title: "Zinsgewinn, größerer Währungsverlust",
      situation:
        "Gedankenbeispiel: Eine Anlage zahlt acht Prozent pro Jahr, die Währung verliert in deiner Kontowährung zwölf Prozent.",
      explanation:
        "Der hohe Zins verhindert keinen Verlust. Für den Gesamtertrag wirken Wechselkurs, Kosten und Zins gemeinsam; die Zahlen sind reine Rechenbeispiele.",
    },
    counterweights: [
      "Rohstoffgewinne erreichen nicht jede Branche gleich.",
      "Politische Entscheidungen und Liquidität können den Zinskanal überlagern.",
    ],
    takeaway:
      "Erkläre jedes Land einzeln und frage, welches Risiko der hohe Zins bezahlt.",
    action:
      "Erstelle getrennte Treiberlisten für BRL und MXN, statt beide als gleiches Risk-on-Signal zu behandeln.",
    quiz: {
      question: "Warum garantiert ein hoher Zins keinen positiven Ertrag?",
      options: [
        "Wechselkursverluste und Kosten können größer sein.",
        "Weil Zinsen nie ausgezahlt werden.",
        "Weil alle Länder dieselben Treiber haben.",
      ],
      correct: 0,
      explanation:
        "Dein Ertrag in Kontowährung hängt auch vom Wechselkurs und von Gebühren ab.",
    },
    related: ["carry-trade", "soybeans", "risk"],
    terms: ["carry", "real-yield", "risk-premium"],
    sources: ["bis-carry-unwind", "usda-soy-trade"],
  }),
];
