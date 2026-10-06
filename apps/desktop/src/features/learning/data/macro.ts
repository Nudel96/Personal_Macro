import { defineLesson } from "../learning-types";

export const macroLessons = [
  defineLesson("macro", {
    id: "china-slowdown",
    title: "Wenn China stagniert: Wer spürt welchen Kanal?",
    subtitle: "Bau, Industrie und Konsum nicht gleichsetzen",
    summary:
      "Schwache chinesische Nachfrage kann Rohstoffe, Exporteure und Währungen treffen. Der betroffene Sektor entscheidet.",
    context:
      "Mit Stagnation kann gemeint sein, dass Produktion kaum wächst, Nachfrage schwach ist oder ein einzelner Sektor schrumpft. Das ist nicht dasselbe. China verbindet Rohstoffimport, industrielle Produktion und Endnachfrage. Eine Baukrise wirkt besonders auf Stahl und Eisenerz. Weniger Nachfrage nach Maschinen trifft andere Länder und Firmen. Futter und Lebensmittel können sich anders entwickeln. Dieses Kapitel ist ein Szenario, keine Aussage zur heutigen China-Lage.",
    drivers: [
      [
        "Immobilien und Bau",
        "Weniger neue Projekte können Stahl- und Materialbedarf verringern.",
        "Baubeginne, Verkäufe, Stahlabsatz und Mengen.",
      ],
      [
        "Industrie und Exporte",
        "Schwache Endnachfrage kann Aufträge und Margen belasten; Auslandsabsatz kann teilweise ausgleichen.",
        "Neue Aufträge, Produktion, Exporte und Lager.",
      ],
      [
        "Konsum und Politik",
        "Vertrauen, Einkommen und Unterstützung verändern die Nachfrage unterschiedlich.",
        "Realer Konsum, Beschäftigung und konkrete Maßnahmen.",
      ],
    ],
    chain: [
      ["Bau bleibt schwach", "Weniger neue Projekte brauchen Material."],
      ["Stahlkette", "Stahlnachfrage und Hüttenmargen können leiden."],
      ["Eisenerz", "Importbedarf oder Preis kann unter Druck geraten."],
      [
        "Australien/AUD",
        "Exporterlöse und Wachstumsannahmen können belastet werden; Zinsen und USD bleiben eigene Treiber.",
      ],
    ],
    example: {
      title: "Kupfer, Eisenerz und Soja getrennt denken",
      situation:
        "Gedankenbeispiel: Chinas Bau schrumpft, Stromnetzinvestitionen bleiben stark, Futterverbrauch bleibt stabil.",
      explanation:
        "Eisenerz bekommt einen klareren Baubelastungskanal. Kupfer kann zusätzliche Netzunterstützung haben. Soja braucht die Futter-/Ölkette. Du musst nicht aus einer China-Überschrift dieselbe Richtung für alle drei machen.",
    },
    counterweights: [
      "Angebotsausfälle können Rohstoffpreise trotz schwacher Nachfrage stützen.",
      "Neue Politik kann Erwartungen bewegen, bevor reale Mengen reagieren.",
    ],
    takeaway:
      "Benutze die Reihenfolge: China-Sektor → konkrete Nachfrage → Lieferland/Asset → Gegenkräfte.",
    action:
      "Wähle ein Asset. Zeichne seinen China-Kanal und nenne ausdrücklich einen Grund, warum die Wirkung ausbleiben könnte.",
    quiz: {
      question:
        "Warum trifft schwacher China-Bau Eisenerz oft direkter als Soja?",
      options: [
        "Weil Eisenerz an Stahl hängt, Soja stärker an Futter und Öl.",
        "Weil jede China-Zahl alle Preise identisch steuert.",
        "Weil die Währung den tatsächlichen Verwendungszweck vollständig ersetzt.",
      ],
      correct: 0,
      explanation:
        "Wirtschaftliche Übertragung läuft über konkrete Güter und Käufer, nicht allein über das Länderetikett.",
    },
    related: ["china-ppi", "china-stimulus", "iron-ore", "copper", "soybeans"],
    terms: ["new-orders", "margin", "terms-of-trade"],
    sources: [
      "imf-china-report",
      "imf-spillovers",
      "worldbank-metals",
      "usda-soy-trade",
    ],
    tools: [
      { label: "China im Weltatlas", path: "/world-atlas" },
      {
        label: "China-CPI/AUD-Regime mit eigenen Grenzen",
        path: "/regime-insights",
      },
    ],
  }),
  defineLesson("macro", {
    id: "china-ppi",
    title: "Chinas PPI fällt: Entlastung oder Warnzeichen?",
    subtitle: "Vom Fabrikpreis zu Margen, Handel und Weltinflation",
    summary:
      "Sinkende chinesische Erzeugerpreise können Kostenentlastung, schwache Nachfrage oder starkes Angebot ausdrücken.",
    context:
      "Der industrielle PPI schaut auf chinesische Erzeugerpreise, nicht direkt auf deinen Einkauf. Eine fallende Zahl kann entstehen, weil Energie billiger wird, Käufer fehlen oder viele Firmen um dieselben Kunden konkurrieren. Diese Ursachen unterscheiden sich. Verkaufspreisrückgänge können Margen drücken, wenn Kosten nicht ebenso fallen. Bei gleichzeitig günstigeren Inputs kann sich die Marge aber auch verbessern. Gewinne hängen zusätzlich von Mengen ab.",
    drivers: [
      [
        "Inputkosten",
        "Billigere Rohstoffe können Produktionspreise senken und Kosten entlasten.",
        "Rohstoffpreise und Input-/Outputreihen.",
      ],
      [
        "Nachfrage und Kapazität",
        "Wenige Aufträge bei viel Produktion können Preisdruck erzeugen.",
        "Aufträge, Lager, Auslastung und Branchen.",
      ],
      [
        "Exportübertragung",
        "Günstigere Exportware kann Importpreise anderer Länder entlasten; Wechselkurse und Handelskosten verändern die Wirkung.",
        "Exportpreise, lokale Importpreise und Währung.",
      ],
    ],
    chain: [
      [
        "Nachfrage bleibt schwach",
        "Fabriken können nicht alles zu bisherigen Preisen verkaufen.",
      ],
      ["Preise werden gesenkt", "Der PPI kann fallen."],
      [
        "Firmen und Exporte",
        "Margen können leiden; günstigere Auslandsangebote sind möglich.",
      ],
      [
        "Weltweiter Effekt",
        "Importpreise können gedämpft werden, während lokale Dienstleistungen und Handelskosten gegenwirken.",
      ],
    ],
    example: {
      title: "PPI fällt, Verbraucherpreise nicht gleich",
      situation:
        "Gedankenbeispiel: Eine chinesische Fabrik senkt Preise. Der Importeur hat alte Lager, höhere Frachtkosten und einen schwächeren lokalen Wechselkurs.",
      explanation:
        "Die günstigere Ware erreicht den Verbraucher möglicherweise erst später, teilweise oder gar nicht. Auch Mieten und viele Dienstleistungen folgen dieser Fabrikpreiskette nicht direkt.",
    },
    counterweights: [
      "Ein PPI-Rückgang beweist allein weder Rezession noch flächendeckendes Überangebot.",
      "Energie, Wechselkurse, Zölle, Fracht und Handelsspannen können die Weitergabe verändern.",
    ],
    takeaway:
      "Sinkender PPI ist eine Frage nach Ursache und Weitergabe, keine fertige Währungs- oder Inflationsprognose.",
    action:
      "Prüfe drei Belege: Kosten, Aufträge und Export-/Importpreise. Formuliere danach eine bedingte Wirkungskette.",
    quiz: {
      question: "Welche Erklärung unterscheidet sinnvolle PPI-Analysen?",
      options: [
        "Alle Preisrückgänge bedeuten dasselbe.",
        "Kostenentlastung und schwache Nachfrage können dieselbe Zahl erzeugen, aber andere Margenwirkungen haben.",
        "PPI ist immer identisch mit CPI.",
      ],
      correct: 1,
      explanation:
        "Die Ursache bestimmt, ob ein Rückgang eher entlastet oder auf Absatzprobleme hinweist. Mengen und Kosten ergänzen den Preis.",
    },
    related: ["ppi", "inflation", "china-slowdown", "cny"],
    terms: ["ppi", "pass-through", "overcapacity", "deflation"],
    sources: ["imf-china-report", "imf-china-outlook", "bls-ppi", "rba-fx"],
    tools: [
      { label: "PPI mit anderen Daten vergleichen", path: "/economic-data" },
    ],
  }),
  defineLesson("macro", {
    id: "china-stimulus",
    title: "China-Unterstützung: Welche Nachfrage entsteht wirklich?",
    subtitle: "Ankündigung, Kredit und tatsächliche Bestellung unterscheiden",
    summary:
      "Ein großes Programm beeinflusst Assets je nach Verwendung, Finanzierung und Umsetzung unterschiedlich.",
    context:
      "Unterstützung kann Kredite erleichtern, Schulden umstrukturieren, Einkommen stärken oder Infrastruktur finanzieren. Das sind verschiedene Kanäle. Eine Bilanzentlastung löst nicht automatisch neue Bauaufträge aus. Ein Netzausbau erreicht Kupfer anders als direkte Konsumhilfe. Kurse können schon auf eine Ankündigung reagieren, während reale Mengen erst später sichtbar werden.",
    drivers: [
      [
        "Ziel des Programms",
        "Konsum, Bau, Netze und Refinanzierung brauchen unterschiedliche Güter.",
        "Konkrete Verwendung statt nur Gesamtsumme.",
      ],
      [
        "Übertragung",
        "Banken, Firmen und Haushalte müssen Unterstützung tatsächlich nutzen können.",
        "Kreditnachfrage und Projektfortschritt.",
      ],
      [
        "Zeit und Erwartung",
        "Ankündigungen können bereits eingepreist sein; Umsetzung kann enttäuschen.",
        "Neuigkeit, Fristen und reale Bestellungen.",
      ],
    ],
    chain: [
      ["Maßnahme", "Im Beispiel wird Netzausbau finanziert."],
      ["Umsetzung", "Projekte müssen genehmigt und gebaut werden."],
      [
        "Materialbedarf",
        "Leitungen können Kupfer und weitere Materialien benötigen.",
      ],
      [
        "Markt",
        "Bestätigte Nachfrage trifft auf Angebot und bereits eingepreiste Erwartungen.",
      ],
    ],
    example: {
      title: "Schuldenhilfe ist keine Baustelle",
      situation:
        "Gedankenbeispiel: Ein Programm ersetzt alte teure Schulden durch günstigere Finanzierung.",
      explanation:
        "Das kann stabilisieren, muss aber nicht im gleichen Umfang neue Zement-, Stahl- oder Erzbestellungen erzeugen. Frage, was wirklich gekauft wird.",
    },
    counterweights: [
      "Schwaches Vertrauen kann trotz günstigerer Kredite Nachfrage bremsen.",
      "Angebotsengpässe oder Finanzierungslücken können Umsetzung verzögern.",
    ],
    takeaway:
      "Folge dem Geld bis zur tatsächlichen Verwendung und zum Materialbedarf.",
    action:
      "Schreibe für eine Maßnahme: Wer erhält Geld, wofür, wann und welcher Beleg bestätigt den nächsten Schritt?",
    quiz: {
      question:
        "Welcher Nachweis ist direkter für Rohstoffbedarf als die Ankündigung einer Summe?",
      options: [
        "Tatsächliche Projekte und Materialbestellungen.",
        "Die angekündigte Summe allein, ohne Blick auf ihre Verwendung.",
        "Eine steigende Börse allein, ohne Mengen- und Projektbelege.",
      ],
      correct: 0,
      explanation:
        "Erst Verwendung und Umsetzung verbinden ein Programm mit konkreter Nachfrage.",
    },
    related: ["copper", "iron-ore", "expectations"],
    terms: ["stimulus", "new-orders", "priced-in"],
    sources: ["imf-china-outlook", "imf-china-report", "worldbank-metals"],
  }),
  defineLesson("macro", {
    id: "oil-shock",
    title: "Ölpreisschock: Gewinner, Verlierer und Zielkonflikte",
    subtitle: "Von der Tankrechnung zu Inflation und Währungen",
    summary:
      "Ein Angebotsausfall kann Energie verteuern und gleichzeitig reales Wachstum belasten.",
    context:
      "Wenn Öl teurer wird, steigen einige Kosten für Transport und Produktion. Haushalten bleibt weniger Geld für andere Dinge. Exportländer können höhere Erlöse erzielen, Importländer werden eher belastet. Die Wirkung hängt von Absicherung, Subventionen, Energieintensität und Lieferverfügbarkeit ab. Zentralbanken müssen überlegen, ob der Preisschub vorübergehend bleibt oder breitere Inflation erzeugt.",
    drivers: [
      [
        "Ausfall und Puffer",
        "Nur der nicht aufgefangene Teil erzeugt zusätzlichen Knappheitsdruck.",
        "Betroffene Menge, Lager und Ersatzangebot.",
      ],
      [
        "Kostenweitergabe",
        "Firmen können Kosten weitergeben, Margen verringern oder Produktion anpassen.",
        "Energieanteil und Preisverhalten.",
      ],
      [
        "Geldpolitik",
        "Höhere Preise und schwächeres Wachstum erzeugen einen Zielkonflikt.",
        "Inflationserwartungen und Zentralbankbotschaft.",
      ],
    ],
    chain: [
      ["Ölangebot sinkt", "Ein Lieferweg fällt im Beispiel aus."],
      [
        "Energie verteuert sich",
        "Transport und Produktion können teurer werden.",
      ],
      ["Kaufkraft sinkt", "Andere Nachfrage kann nachlassen."],
      [
        "Assets unterscheiden sich",
        "CAD/NOK haben einen Exportkanal; EUR und energieabhängige Branchen können belastet werden.",
      ],
    ],
    example: {
      title: "Exportland mit globaler Gegenkraft",
      situation:
        "Gedankenbeispiel: Norwegens Energieerlöse steigen. Gleichzeitig wächst globale Risikoangst und Kapital verlässt kleinere Märkte.",
      explanation:
        "NOK muss nicht gewinnen. Ein Erlösvorteil ist ein Kanal innerhalb einer größeren finanziellen Reaktion.",
    },
    counterweights: [
      "Lagerfreigabe, Energieersatz und Nachfragerückgang können dämpfen.",
      "Höhere Produzentenpreise bedeuten nicht gleiche Verbraucherweitergabe.",
    ],
    takeaway: "Trenne Kosten, Einkommen, Nachfrage und Geldpolitik.",
    action:
      "Ordne zwei betroffene Assets ihren tatsächlichen Kanälen zu und ergänze je eine Gegenkraft.",
    quiz: {
      question:
        "Kann ein Angebots-Ölschock Inflation erhöhen und Wachstum senken?",
      options: [
        "Ja, höhere Kosten können gleichzeitig Kaufkraft belasten.",
        "Nein, Wachstum und Inflation sind immer gleichgerichtet.",
        "Nur wenn alle Zinsen null sind.",
      ],
      correct: 0,
      explanation:
        "Ein Kostenschock kann Produktion und Nachfrage belasten, während Preise steigen.",
    },
    related: ["oil", "cad", "nok", "stagflation"],
    terms: ["supply-shock", "pass-through", "terms-of-trade"],
    sources: ["eia-oil", "rba-inflation", "boc-oil"],
  }),
  defineLesson("macro", {
    id: "stagflation",
    title: "Stagflation · Wenig Wachstum, hartnäckige Inflation",
    subtitle: "Warum eine einzige Marktregel hier besonders schlecht passt",
    summary:
      "Stagflation verbindet schwache wirtschaftliche Aktivität mit starkem oder hartnäckigem Preisdruck.",
    context:
      "In einem einfachen Nachfrageboom steigen oft Wachstum und Preise gemeinsam. Bei einem ungünstigen Angebotsschock können Kosten steigen, obwohl Produktion oder Kaufkraft leiden. Die Zentralbank kann den Engpass nicht direkt reparieren. Sie muss zwischen Inflationsbekämpfung und zusätzlichen Belastungen für Nachfrage abwägen. Das Ergebnis hängt von Dauer, Erwartungen und Vertrauen ab.",
    drivers: [
      [
        "Angebotskosten",
        "Energie- oder Lieferprobleme können Produktion verteuern.",
        "Kostenquellen und Lieferfähigkeit.",
      ],
      [
        "Reale Nachfrage",
        "Höhere Rechnungen und Zinsen können andere Ausgaben bremsen.",
        "Realer Konsum und Aufträge.",
      ],
      [
        "Erwartung und Reaktion",
        "Anhaltender Preisdruck kann Lohn-/Preissetzung und Zinsweg beeinflussen.",
        "Erwartungen, Löhne und Geldpolitik.",
      ],
    ],
    chain: [
      ["Kostenanstieg", "Unternehmen zahlen mehr für Inputs."],
      ["Preise und Margen", "Preise können steigen, Margen leiden."],
      ["Nachfrage", "Reale Kaufkraft kann sinken."],
      [
        "Zielkonflikt",
        "Strengere Politik könnte Inflation bremsen, aber Wachstum zusätzlich belasten.",
      ],
    ],
    example: {
      title: "Schwaches Wachstum ist nicht automatisch Zinssenkung",
      situation:
        "Gedankenbeispiel: Aufträge sinken, zugleich steigen längerfristige Inflationserwartungen.",
      explanation:
        "Die Bank kann trotz Wachstumsschwäche vorsichtig mit Lockerung sein. Für Währungen und Gold kommt es auf relative Politik und reale Renditen an.",
    },
    counterweights: [
      "Ein kurzer Preisschub ist noch keine anhaltende Stagflation.",
      "Produktivität, Ersatzangebot und stabilisierte Erwartungen können entlasten.",
    ],
    takeaway: "Prüfe Angebot, reale Nachfrage und Inflation getrennt.",
    action:
      "Vermeide ein Regimeetikett aus einer Zahl. Suche mindestens einen Mengen- und einen Preisdruckbeleg.",
    quiz: {
      question:
        "Was unterscheidet Stagflation von einem einfachen Nachfrageboom?",
      options: [
        "Schwache Aktivität kann mit hartnäckigem Preisdruck zusammenkommen.",
        "Es reicht, dass die Inflation fällt; die Wirtschaftslage spielt keine Rolle.",
        "Stagflation bedeutet ausschließlich fallende Verbraucherpreise.",
      ],
      correct: 0,
      explanation:
        "Bei einem Angebotsschock können Wachstum und Inflation ungünstig auseinanderlaufen.",
    },
    related: ["oil-shock", "inflation", "real-yields"],
    terms: ["stagflation", "supply-shock", "real-yield"],
    sources: ["rba-inflation", "rba-transmission", "boe-inflation"],
  }),
  defineLesson("macro", {
    id: "soft-landing",
    title: "Soft Landing · Abkühlung ohne starken Einbruch",
    subtitle: "Eine plausible Möglichkeit, keine feste Schablone",
    summary:
      "Beim Soft Landing lässt Inflation nach, während die Wirtschaft einen schweren Einbruch vermeidet.",
    context:
      "Zinsen sollen übermäßige Nachfrage bremsen, ohne unnötig viel Beschäftigung zu zerstören. Ein sanfter Verlauf wäre, dass Lieferfähigkeit oder Produktivität helfen und Preisdruck sinkt, bevor eine starke Rezession entsteht. Der Markt diskutiert solche Szenarien häufig früh. Ein Etikett ist jedoch noch keine abgeschlossene Beobachtung.",
    drivers: [
      [
        "Inflationsbreite",
        "Nachlassender Druck in mehreren Bereichen ist belastbarer als eine einzige billige Komponente.",
        "Waren, Dienstleistungen und Löhne.",
      ],
      [
        "Arbeitsmarkt",
        "Stabile Beschäftigung bei nachlassenden Engpässen passt eher zur sanften Abkühlung.",
        "Jobs, Stunden und Arbeitslosenquote.",
      ],
      [
        "Kredit/Nachfrage",
        "Schuldenkosten wirken verzögert und können den Verlauf verändern.",
        "Kreditbedingungen, realer Konsum und Aufträge.",
      ],
    ],
    chain: [
      ["Preisdruck lässt nach", "Angebot oder Nachfrage entspannen sich."],
      ["Beschäftigung hält", "Der Arbeitsmarkt bricht nicht stark ein."],
      ["Zinsweg", "Vorsichtige Lockerung kann möglich werden."],
      [
        "Bewertung",
        "Assets reagieren auf Gewinne, Zinsen und bereits eingepreiste Erwartungen.",
      ],
    ],
    example: {
      title: "Sinkende Inflation mit zwei möglichen Ursachen",
      situation:
        "Gedankenbeispiel: Inflation fällt. Einmal verbessern sich Lieferketten, einmal kollabiert Nachfrage.",
      explanation:
        "Der erste Fall passt eher zum sanften Verlauf. Im zweiten können niedrigere Zinsen mit schlechteren Gewinnen einhergehen. Gleiche Inflationsrichtung, anderer Kontext.",
    },
    counterweights: [
      "Neue Energie- oder Handelsschocks können den Verlauf stören.",
      "Späte Datenrevisionen können das Bild verändern.",
    ],
    takeaway:
      "Erkläre, warum Inflation fällt und ob reale Nachfrage stabil bleibt.",
    action:
      "Vergleiche Preisentspannung mit Beschäftigung, Stunden und realem Konsum.",
    quiz: {
      question: "Beweist fallende Inflation allein ein Soft Landing?",
      options: [
        "Nein, sie kann auch durch starken Nachfrageeinbruch fallen.",
        "Ja, immer.",
        "Nur wenn alle Rohstoffe gleichzeitig steigen.",
      ],
      correct: 0,
      explanation:
        "Zum sanften Verlauf gehört auch die Vermeidung eines schweren Aktivitätseinbruchs.",
    },
    related: ["labor", "inflation", "growth"],
    terms: ["disinflation", "rate-path", "revision"],
    sources: ["rba-growth", "rba-inflation", "bis-carry-unwind"],
  }),
  defineLesson("macro", {
    id: "dollar-cycle",
    title: "Ein stärkerer USD: Folgen außerhalb der USA",
    subtitle: "Importkosten und Dollarschulden als zwei Kanäle",
    summary:
      "Ein stärkerer Dollar kann importierte Güter und die Bedienung von Dollarschulden in lokaler Währung verteuern.",
    context:
      "Viele Güter und Kredite werden in Dollar abgerechnet. Wenn deine Währung gegenüber USD fällt, kostet eine unveränderte Dollarrechnung lokal mehr. Das betrifft Firmen und Länder unterschiedlich: Ein Exporteur mit Dollarerlösen kann einen Ausgleich haben, ein Importeur mit rein lokalen Einnahmen eher nicht. Absicherung verändert den Zeitpunkt und die Stärke der Wirkung.",
    drivers: [
      [
        "Handelswährung",
        "Eine lokale Abwertung erhöht unveränderte USD-Rechnungen in Landeswährung.",
        "Rechnungswährung und Importanteil.",
      ],
      [
        "Schuldenwährung",
        "USD-Verbindlichkeiten benötigen Dollar, unabhängig von lokaler Einnahmenwährung.",
        "Schulden, Laufzeiten und USD-Einnahmen.",
      ],
      [
        "Absicherung und Politik",
        "Hedges, Reserven und Finanzierungsmöglichkeiten können Belastungen puffern.",
        "Tatsächliche Währungsdeckung und Refinanzierung.",
      ],
    ],
    chain: [
      ["USD steigt", "Für einen Dollar braucht man mehr lokale Währung."],
      ["Rechnungen", "Importe oder Zinszahlungen werden lokal teurer."],
      ["Kaufkraft/Margen", "Kosten können Nachfrage oder Gewinne belasten."],
      [
        "Rückwirkung",
        "Inflation, Geldpolitik und Kreditbedingungen können sich verändern.",
      ],
    ],
    example: {
      title: "Gleiche Rechnung, andere Belastung",
      situation:
        "Gedankenbeispiel: Ein Importeur zahlt 100 USD. Der lokale Kurs steigt von 1 auf 1,20 je Dollar.",
      explanation:
        "Die Rechnung steigt lokal von 100 auf 120, obwohl der USD-Preis gleich ist. Ein Exporteur mit eigenen Dollarerlösen erlebt einen anderen Nettoeffekt.",
    },
    counterweights: [
      "Ein USD-Rohstoffpreis kann gleichzeitig sinken und lokal teilweise ausgleichen.",
      "Absicherungen verschieben die unmittelbare Belastung.",
    ],
    takeaway: "Prüfe Zahlungswährung, Einnahmenwährung und Absicherung.",
    action:
      "Suche bei einer Firma oder einem Land nach der Netto-Währungsposition, nicht nur nach dem USD-Kurs.",
    quiz: {
      question: "Wer ist bei USD-Stärke eher ungeschützt belastet?",
      options: [
        "Ein Importeur mit USD-Rechnungen und lokalen Einnahmen ohne Absicherung.",
        "Jeder Exporteur garantiert gleich.",
        "Niemand, Rechnungswährungen sind egal.",
      ],
      correct: 0,
      explanation:
        "Die Währungsseite der Kosten passt hier nicht zur Währungsseite der Einnahmen.",
    },
    related: ["usd", "em-currencies", "pass-through-lesson"],
    terms: ["reserve-currency", "pass-through", "hedging"],
    sources: ["fed-dollar", "rba-fx", "imf-spillovers"],
  }),
  defineLesson("macro", {
    id: "terms-of-trade",
    title: "Terms of Trade · Was Exporte im Verhältnis kaufen können",
    subtitle: "Warum Exportpreise Währungen beeinflussen können",
    summary:
      "Terms of Trade vergleichen Export- mit Importpreisen. Sie beschreiben keine vollständige Handelsbilanz.",
    context:
      "Stell dir ein Land vor, das Rohstoffe verkauft und Maschinen importiert. Wenn seine Exportpreise steigen, während Importpreise gleich bleiben, kann es mit denselben Exportmengen mehr Importe bezahlen. Das ist ein günstigeres Austauschverhältnis. Exportvolumen, Importvolumen und Kapitalflüsse bestimmen aber zusätzliche Wirkungen.",
    drivers: [
      [
        "Exportpreise",
        "Höhere Preise können Erlöse bei gleicher Menge steigern.",
        "Tatsächlich exportierter Warenkorb.",
      ],
      [
        "Importpreise",
        "Teurere Energie oder Maschinen können den Vorteil aufzehren.",
        "Warenkorb der Importe.",
      ],
      [
        "Mengen und Kapital",
        "Ein Preisvorteil hilft weniger, wenn Produktion sinkt oder Kapital abfließt.",
        "Volumen, Einkommen und Kapitalbedingungen.",
      ],
    ],
    chain: [
      ["Exportpreis steigt", "Ein Rohstoffexporteur erlöst mehr je Einheit."],
      ["Importpreis bleibt", "Einkäufe kosten vorerst nicht mehr."],
      [
        "Realer Spielraum",
        "Mehr Importe können mit derselben Exportmenge bezahlt werden.",
      ],
      [
        "Währung",
        "Bessere Aussichten können unterstützen, aber Zinsen und Risiko bleiben wichtig.",
      ],
    ],
    example: {
      title: "Preis hoch, Menge niedrig",
      situation:
        "Gedankenbeispiel: Der Ölpreis steigt um einen gedachten Betrag, Kanadas Exportmenge fällt gleichzeitig wegen eines Ausfalls.",
      explanation:
        "Ein besserer Preisvergleich garantiert keine höheren Gesamterlöse. Preise und Mengen sind getrennt zu prüfen.",
    },
    counterweights: [
      "Ein globaler Kostenschock kann zugleich Importpreise erhöhen.",
      "Der Zusammenhang zwischen Terms of Trade und Wechselkurs ist nicht konstant.",
    ],
    takeaway:
      "Exportpreisvorteil, Gesamterlös und Wechselkurs sind drei verschiedene Größen.",
    action:
      "Vergleiche für einen Rohstoffexporteur Exportpreise, Importpreise und tatsächliche Mengen.",
    quiz: {
      question: "Was vergleicht das Austauschverhältnis?",
      options: [
        "Exportpreise mit Importpreisen.",
        "Ausschließlich Aktienkurse.",
        "Exportmengen mit Importmengen, unabhängig vom Preis.",
      ],
      correct: 0,
      explanation:
        "Terms of Trade ist ein relativer Preisvergleich im Außenhandel, keine vollständige Zahlungsbilanz.",
    },
    related: ["aud", "cad", "nzd", "nok"],
    terms: ["terms-of-trade", "appreciation", "risk-premium"],
    sources: ["rba-trade", "rbnz-commodities", "boc-oil"],
  }),
];
