import { defineLesson } from "../learning-types";

export const agricultureLessons = [
  defineLesson("agriculture", {
    id: "soybeans",
    title: "Soja · Eine Bohne, zwei große Nachfrageketten",
    subtitle: "Tierfutter, Pflanzenöl, China und Erntewetter",
    summary:
      "Soja wird vor allem zu Schrot und Öl verarbeitet. Für den Preis zählen Angebot, Verarbeitung, Exporte und Lager.",
    context:
      "Soja ist zugleich Proteinquelle und Ölquelle. Beim Verarbeiten, dem Crush, entstehen Schrot für Futter und Öl für Lebensmittel oder industrielle Nutzung. China ist ein wichtiger Käufer, Brasilien und die USA wichtige Anbieter. Eine Änderung in einer dieser Ketten kann die Bohne beeinflussen. Der Preis eines US-Futures ist aber nicht automatisch der gleiche Preis, den eine brasilianische Firma am Hafen erhält.",
    drivers: [
      [
        "Fläche, Ertrag und Wetter",
        "Erntemenge entsteht aus Fläche und Ertrag. Hitze oder Trockenheit sind je nach Region und Entwicklungsphase unterschiedlich relevant.",
        "USDA-Flächen/Erträge, Crop Progress und konkrete Regionen.",
      ],
      [
        "China und Tierfutter",
        "Tierbestände, Futterration und Verarbeitung beeinflussen die Schrot- und Bohnennachfrage.",
        "Importmengen, Crush und Futternachfrage.",
      ],
      [
        "Öl, Exporte und Lager",
        "Ölnachfrage kann Crush stützen. Handelspolitik, Fracht und Lager bestimmen die Verfügbarkeit.",
        "WASDE, Exportverkäufe, Lager und Herkunftspreise.",
      ],
    ],
    chain: [
      [
        "Erwartete Ernte sinkt",
        "Im Gedankenbeispiel wird weniger Angebot erwartet.",
      ],
      [
        "Puffer prüfen",
        "Vorhandene Lager können den Ausfall abfangen oder knapp sein.",
      ],
      ["Verarbeitung und Exporte", "Käufer konkurrieren um verfügbare Bohnen."],
      [
        "Preiswirkung offen",
        "Druck nach oben ist möglich, sofern Nachfrage und andere Ernten nicht gegenwirken.",
      ],
    ],
    example: {
      title: "China wächst schwach, kauft dennoch Soja",
      situation:
        "Gedankenbeispiel: Chinas Bau schwächelt, Futterbedarf bleibt stabil. Gleichzeitig fallen Preise für Importbohnen.",
      explanation:
        "Ein schwaches Gesamt-BIP bedeutet nicht automatisch weniger Sojaimporte. Käufer können Lager auffüllen, Bezugsquellen wechseln oder mehr verarbeiten. Für Soja brauchst du die Futter-/Ölkette und tatsächliche Mengen.",
    },
    counterweights: [
      "Gute Ernten in einem anderen Anbauland können einen regionalen Verlust ausgleichen.",
      "Mehr Crush erhöht auch das Angebot beider Produkte; Schrot kann trotz höherer Ölpreise unter Druck stehen.",
    ],
    takeaway:
      "Erkläre Soja über Bohne, Schrot, Öl, Exportfluss und Lager zusammen.",
    action:
      "Lies eine WASDE-Änderung in dieser Reihenfolge: Ernte, Verbrauch, Exporte, Endlager. Prüfe danach den Grund.",
    quiz: {
      question:
        "Warum muss schwaches chinesisches Bauwachstum Soja nicht genauso treffen wie Eisenerz?",
      options: [
        "Soja hängt an anderen Nachfrageketten, etwa Futter und Öl.",
        "China importiert keine Soja.",
        "Alle Rohstoffe haben identische Verbraucher.",
      ],
      correct: 0,
      explanation:
        "Bau/Stahl und Futter/Öl sind unterschiedliche Ketten. Die Gesamtwirtschaft allein reicht nicht zur Übertragung.",
    },
    related: ["soy-crush", "china-slowdown", "crop-calendar", "inventories"],
    terms: ["crush", "stocks-to-use", "basis", "marketing-year"],
    sources: ["usda-soy", "usda-soy-trade", "usda-wasde"],
    tools: [
      { label: "Anbauregionen und Wetter einordnen", path: "/weather" },
      { label: "Lange Rohstoffentwicklungen", path: "/world-atlas" },
    ],
  }),
  defineLesson("agriculture", {
    id: "soy-crush",
    title: "Sojaschrot und Sojaöl · Gemeinsam produziert, anders nachgefragt",
    subtitle: "Warum beide Preise auseinanderlaufen können",
    summary:
      "Crush verbindet Bohne, Schrot und Öl. Die Nachfrage nach den zwei Produkten bleibt unterschiedlich.",
    context:
      "Eine Mühle kauft Bohnen und verkauft Schrot plus Öl. Der gemeinsame Erlös muss Bohnen, Verarbeitung und weitere Kosten decken. Ein kräftiger Ölerlös kann Verarbeitung attraktiver machen, auch wenn Schrot schwächer ist. Die Verarbeitung produziert aber weiterhin beides. Mehr Crush kann deshalb zusätzliches Schrot auf den Markt bringen.",
    drivers: [
      [
        "Schrotnachfrage",
        "Tierfütterung und Ersatzproteine beeinflussen den Bedarf.",
        "Futterverbrauch, Tierbestände und Schrotimporte.",
      ],
      [
        "Ölnachfrage",
        "Lebensmittel und je nach Markt Biokraftstoffe konkurrieren mit anderen Ölen.",
        "Ölnutzung, Politik und Palm-/Rapsölpreise.",
      ],
      [
        "Verarbeitungsmarge",
        "Erwartete Produkterlöse gegenüber Bohnenkosten beeinflussen Verarbeitung.",
        "Crush, Kapazität und gemeinsame Erlöse.",
      ],
    ],
    chain: [
      ["Ölnachfrage steigt", "Ein Produkt wird stärker gebraucht."],
      ["Verarbeitung lohnt eher", "Der gemeinsame Produkterlös kann steigen."],
      [
        "Mehr Bohnen werden verarbeitet",
        "Es entstehen mehr Öl und mehr Schrot.",
      ],
      [
        "Schrotangebot wächst",
        "Ohne passende Futtermehrnachfrage kann Schrot schwächer werden.",
      ],
    ],
    example: {
      title: "Öl hoch, Schrot niedrig",
      situation:
        "Gedankenbeispiel: Öl wird stärker nachgefragt. Mühlen fahren ihre Verarbeitung hoch, Futterverbrauch bleibt unverändert.",
      explanation:
        "Zusätzliches Schrot muss Absatz finden. Unterschiedliche Preisrichtungen sind deshalb möglich, obwohl beide aus derselben Bohne entstehen.",
    },
    counterweights: [
      "Kapazität und Transport können mehr Verarbeitung verhindern.",
      "Politische Regeln und Endnachfrage können sich ändern.",
    ],
    takeaway: "Gemeinsame Produktion bedeutet keine identische Preisrichtung.",
    action:
      "Lies Schrot und Öl immer zusammen mit Bohnenkosten und Verarbeitungsmenge.",
    quiz: {
      question:
        "Was entsteht zusätzlich, wenn wegen höherer Ölnachfrage mehr Soja verarbeitet wird?",
      options: [
        "Nur Öl.",
        "Auch mehr Schrot.",
        "Automatisch weniger Bohnenangebot weltweit.",
      ],
      correct: 1,
      explanation:
        "Crush liefert gemeinsam Öl und Schrot. Die Nachfrage nach Schrot muss separat geprüft werden.",
    },
    related: ["soybeans", "palm-oil", "rapeseed"],
    terms: ["crush", "margin", "substitution"],
    sources: ["usda-soy-sector", "usda-soy-yearbook"],
  }),
  defineLesson("agriculture", {
    id: "corn",
    title: "Mais · Futter, Ethanol und Flächenkonkurrenz",
    subtitle: "Ein Getreide zwischen Landwirtschaft und Energie",
    summary:
      "Maisnachfrage kommt unter anderem aus Futter, Ethanol und Exporten. Wetter und Ernteerwartungen verändern das Angebot.",
    context:
      "Mais wird für Tierfutter, industrielle Verarbeitung und Kraftstoff verwendet. Bauern entscheiden zudem, welche Kultur auf eine Fläche kommt. Höhere erwartete Erlöse einer Alternative können die Maisfläche beeinflussen. Der Bezug zu Öl entsteht über Ethanolökonomie und Regeln, ist aber keine feste tägliche Preisformel.",
    drivers: [
      [
        "Fläche und Ertrag",
        "Sie bestimmen zusammen den größten Teil der Erntemenge.",
        "Flächenschätzungen, Ertrag und Pflanzenzustand.",
      ],
      [
        "Futter und Exporte",
        "Tierbestände, Ersatzgetreide und Auslandskäufe verändern Verbrauch.",
        "Futterverbrauch und Exportmengen.",
      ],
      [
        "Ethanol",
        "Verarbeitung hängt von Absatz, Margen und geltenden Regeln ab.",
        "Ethanolproduktion und Energiepreise.",
      ],
    ],
    chain: [
      ["Wetterproblem", "Ertragserwartung sinkt im Beispiel."],
      ["Angebotsbilanz", "Ernte und Endlager werden neu geschätzt."],
      [
        "Verbrauch reagiert",
        "Hohe Preise können Ersatz oder Einsparung fördern.",
      ],
      [
        "Neues Gleichgewicht",
        "Preis und tatsächliche Knappheit passen sich gemeinsam an.",
      ],
    ],
    example: {
      title: "Trockenheit trifft nicht jede Woche gleich",
      situation:
        "Gedankenbeispiel: Hitze kommt in einer empfindlichen Entwicklungsphase statt erst nach der Ernte.",
      explanation:
        "Zeitpunkt und betroffene Produktionsregion bestimmen die Relevanz. Ein heißer Kartenpunkt ist noch kein gemessener landesweiter Ertragsschaden.",
    },
    counterweights: [
      "Große Lager oder gute Ernten anderswo können puffern.",
      "Ein Ölpreisanstieg erhöht die Maisnachfrage nicht automatisch.",
    ],
    takeaway:
      "Verbinde Angebot mit drei Verbrauchswegen: Futter, Ethanol und Export.",
    action:
      "Prüfe bei einer Wetterüberschrift Region, Phase und Anteil der betroffenen Produktion, soweit belegt.",
    quiz: {
      question: "Warum kann Energie für Mais relevant sein?",
      options: [
        "Mais wird unter anderem zu Ethanol verarbeitet.",
        "Ethanolnachfrage bestimmt unabhängig von Margen und Kapazität den gesamten Maispreis.",
        "Jeder Ölpreis verdoppelt Mais sofort.",
      ],
      correct: 0,
      explanation:
        "Der Ethanolkanal verbindet Mais und Energie, allerdings mit eigenen Kapazitäten, Margen und Regeln.",
    },
    related: ["crop-calendar", "inventories", "oil"],
    terms: ["yield-crop", "marketing-year", "substitution"],
    sources: ["usda-corn", "usda-wasde", "usda-crop-progress"],
    tools: [{ label: "Maisregionen im Wetterbereich", path: "/weather" }],
  }),
  defineLesson("agriculture", {
    id: "wheat",
    title: "Weizen · Qualität und Exportwege zählen",
    subtitle: "Die weltweite Menge ist nicht überall gleich verfügbar",
    summary:
      "Weizenpreise hängen an Ernten, Qualitätsklassen, Exportpolitik und Logistik.",
    context:
      "Weizen ist kein vollkommen einheitliches Produkt. Protein, Sorte und Verwendungszweck unterscheiden Brot- und Futterketten. Dazu kommen Winter- und Sommerweizen mit anderen Kalendern. Eine große globale Ernte hilft einem Importeur nur, wenn passende Qualität verfügbar und lieferbar ist. Logistische oder politische Hürden können einzelne Märkte deshalb verknappen.",
    drivers: [
      [
        "Ernte und Qualität",
        "Menge und Protein-/Backqualität können unterschiedliche Probleme zeigen.",
        "Region, Sorte und Qualitätsberichte.",
      ],
      [
        "Exportzugang",
        "Ausfuhrregeln, Häfen und Fracht bestimmen erreichbares Angebot.",
        "Lieferwege und bestätigte Restriktionen.",
      ],
      [
        "Verbrauch und Ersatz",
        "Mühlen und Futterhersteller können nur begrenzt austauschen.",
        "Importbedarf und Ersatzgetreide.",
      ],
    ],
    chain: [
      ["Exportweg gestört", "Eine Herkunft liefert weniger."],
      [
        "Käufer suchen Ersatz",
        "Andere Regionen müssen passende Qualität liefern.",
      ],
      ["Fracht und Preise", "Lokale Aufschläge können steigen."],
      ["Gesamtmarkt", "Wirkung hängt von Alternativen und Lagern ab."],
    ],
    example: {
      title: "Viel Weizen, wenig passende Qualität",
      situation:
        "Gedankenbeispiel: Die Ernte ist groß, enthält aber weniger backfähigen Weizen.",
      explanation:
        "Die Summe der Tonnen erzählt nicht die ganze Geschichte. Ein Mühlenmarkt kann eng sein, während Futterweizen reichlich vorhanden ist.",
    },
    counterweights: [
      "Andere Exportländer können Lieferungen übernehmen.",
      "Ein Lagerbestand in einem Land ist nicht automatisch exportierbar.",
    ],
    takeaway: "Frage bei Weizen nach Qualität, Standort und Lieferbarkeit.",
    action:
      "Benenne bei einer Weizenanalyse die Sorte beziehungsweise den Futures-Kontrakt.",
    quiz: {
      question:
        "Warum reicht die globale Weizenmenge nicht immer zur Beurteilung?",
      options: [
        "Qualität, Ort und Exportzugang können entscheidend sein.",
        "Alle Körner haben dieselbe Nutzung.",
        "Fracht spielt nie eine Rolle.",
      ],
      correct: 0,
      explanation:
        "Verfügbares passendes Angebot ist enger definiert als weltweit produzierte Tonnen.",
    },
    related: ["basis", "crop-calendar", "inventories"],
    terms: ["basis", "substitution", "marketing-year"],
    sources: ["usda-wheat", "usda-wasde"],
  }),
  defineLesson("agriculture", {
    id: "coffee",
    title: "Kaffee · Arabica, Robusta und mehrjährige Pflanzen",
    subtitle: "Warum ein Wetterschock länger nachwirken kann",
    summary:
      "Kaffee verbindet Sorten, Anbauregionen, Wetter, Lager und langsam reagierende Produktionskapazität.",
    context:
      "Kaffeesträucher liefern nicht sofort nach einer Neuanpflanzung volle Erträge. Deshalb kann das Angebot kurzfristig schlecht auf Preissprünge reagieren. Arabica und Robusta besitzen unterschiedliche Märkte und Eigenschaften. Brasilien und Vietnam spielen in unterschiedlichen Teilen der Kette wichtige Rollen. Der Ladenpreis eines Cappuccinos enthält außerdem Arbeit, Miete und Marge; er ist kein reiner Rohkaffeepreis.",
    drivers: [
      [
        "Wetter und Pflanzenzustand",
        "Frost, Trockenheit oder Nässe können je nach Phase und Ort Produktion beeinflussen.",
        "Regionale Berichte und bestätigte Erntefolgen.",
      ],
      [
        "Sorten und Ersatz",
        "Röster können Mischungen teilweise verändern, aber nicht beliebig.",
        "Arabica-/Robusta-Preisabstand.",
      ],
      [
        "Lager und Export",
        "Vorräte, Erntezugang und Transport bestimmen das kurzfristige Angebot.",
        "Lager, Ausfuhren und Ernteschätzungen.",
      ],
    ],
    chain: [
      [
        "Ernteausblick schwächer",
        "Künftiges verfügbares Angebot wird kleiner eingeschätzt.",
      ],
      ["Lager als Puffer", "Käufer nutzen Vorräte oder suchen Alternativen."],
      [
        "Mischungen ändern",
        "Ein Teil der Nachfrage kann auf andere Qualität wechseln.",
      ],
      [
        "Preis und Dauer",
        "Wirkung hängt von Lager und langsamer Angebotsanpassung ab.",
      ],
    ],
    example: {
      title: "Frostmeldung ohne Größenangabe",
      situation:
        "Gedankenbeispiel: Eine Schlagzeile nennt Frost, aber keine betroffene Fläche oder Pflanzenschäden.",
      explanation:
        "Die Meldung ist ein Anlass zur Prüfung. Sie erlaubt noch keine belastbare Schätzung des Ernteverlusts oder der Preisrichtung.",
    },
    counterweights: [
      "Andere Herkunftsländer oder Sorten können teilweise ausgleichen.",
      "Eine negative Nachricht kann bereits im Preis enthalten sein.",
    ],
    takeaway: "Trenne Sorte, Region, bestätigten Schaden und verfügbare Lager.",
    action:
      "Vergleiche eine Wetterüberschrift mit dem nächsten Ernte-/Exportbericht.",
    quiz: {
      question: "Warum reagiert Kaffeeangebot oft langsam auf hohe Preise?",
      options: [
        "Neue Pflanzen brauchen Zeit bis zu relevanten Erträgen.",
        "Höhere Preise erhöhen die nächste Ernte unabhängig von Pflanzenalter und Wetter.",
        "Preise bestimmen immer sofort die Ernte.",
      ],
      correct: 0,
      explanation:
        "Mehrjährige Pflanzen begrenzen die kurzfristige Angebotsanpassung.",
    },
    related: ["cocoa", "crop-calendar", "expectations"],
    terms: ["substitution", "inventories", "priced-in"],
    sources: ["usda-coffee", "usda-coffee-report"],
    tools: [{ label: "Kaffee und Wetterkontext", path: "/weather" }],
  }),
  defineLesson("agriculture", {
    id: "cocoa",
    title: "Kakao · Konzentriertes Angebot und Verarbeitung",
    subtitle: "Ernteprobleme, Mahlungen und knappe Vorräte",
    summary:
      "Kakao reagiert auf Erntebedingungen, Pflanzenkrankheiten, verfügbare Bestände und Verarbeitungsnachfrage.",
    context:
      "Kakaobäume sind mehrjährige Pflanzen. Große Produktionsregionen in Westafrika machen dortige Bedingungen für das Weltangebot wichtig. Die Verarbeitung zu Butter, Pulver und anderen Produkten heißt hier Mahlung oder Grinding. Mahlungsmengen helfen beim Verständnis der Nachfrage, sind aber nicht identisch mit den Schokoladenkäufen im Laden.",
    drivers: [
      [
        "Ernte und Baumgesundheit",
        "Wetter, Krankheiten und Pflege beeinflussen die lieferbare Menge.",
        "Ernteberichte und regionale Bestätigungen.",
      ],
      [
        "Bestände",
        "Kleine Puffer machen neue Ausfälle schwerer ausgleichbar.",
        "ICCO-Bilanz und verfügbare Lager.",
      ],
      [
        "Mahlungen und Nachfrage",
        "Verarbeitung reagiert auf Absatz, Finanzierung und hohe Bohnenkosten.",
        "Mahlungsmengen und Produktnachfrage.",
      ],
    ],
    chain: [
      ["Angebot fällt aus", "Weniger Bohnen erreichen Käufer."],
      ["Lager sinken", "Der Puffer wird beansprucht."],
      ["Kosten steigen", "Verarbeiter müssen mehr bezahlen oder reduzieren."],
      [
        "Nachfrage passt sich an",
        "Hohe Preise können Absatz und Verarbeitung bremsen.",
      ],
    ],
    example: {
      title: "Preise hoch, Mahlungen schwach",
      situation:
        "Gedankenbeispiel: Bohnen werden knapp und teuer. Verarbeiter reduzieren ihre Mahlungen.",
      explanation:
        "Schwache Verarbeitung kann eine Folge hoher Kosten sein. Sie beweist nicht, dass das Angebotsproblem verschwunden ist. Beide Seiten gehören in die Bilanz.",
    },
    counterweights: [
      "Hohe Preise fördern mittel- und langfristig zusätzliche Produktion.",
      "Nachfragereduktion kann den Preisdruck begrenzen; der Zeitpunkt ist offen.",
    ],
    takeaway:
      "Bei Kakao prüfst du Angebotsschaden und Nachfragereaktion gleichzeitig.",
    action:
      "Trenne in einem Bericht Ernte, Bestände und Mahlungen in drei eigene Notizen.",
    quiz: {
      question:
        "Sind Mahlungsmengen genau dasselbe wie Endkundenkäufe von Schokolade?",
      options: [
        "Ja, ohne Lager oder Verzögerung.",
        "Nein, sie messen Verarbeitung an einer anderen Stelle der Kette.",
        "Sie messen die spätere Konsumnachfrage ohne zeitliche Verzögerung.",
      ],
      correct: 1,
      explanation:
        "Zwischen Verarbeitung und Konsum liegen Produkte, Lager, Transport und Zeit.",
    },
    related: ["coffee", "inventories", "supply-demand"],
    terms: ["grindings", "inventories", "margin"],
    sources: ["icco", "icco-market"],
  }),
  defineLesson("agriculture", {
    id: "cotton",
    title: "Baumwolle · Feld trifft Modekonjunktur",
    subtitle: "Wetter allein erklärt einen industriellen Agrarrohstoff nicht",
    summary:
      "Baumwolle braucht sowohl eine Erntegeschichte als auch eine Textil- und Konsumgeschichte.",
    context:
      "Baumwolle wächst auf dem Feld, wird aber vor allem in Textilien verwendet. Deshalb kann schwacher Konsum ihre Nachfrage anders treffen als ein Grundnahrungsmittel. Garnspinnereien und Bekleidungsfirmen haben eigene Lagerzyklen. Synthetische Fasern sind mögliche Alternativen, ersetzen Baumwolle aber nicht für jeden Zweck gleich gut.",
    drivers: [
      [
        "Ernte und Fläche",
        "Wasser, Wetter und Anbauentscheidungen verändern Angebot.",
        "Regionale Erntemengen und Fläche.",
      ],
      [
        "Textilnachfrage",
        "Schwache Bestellungen können Spinnereien und Faserbedarf belasten.",
        "Verarbeitung, Textilaufträge und Lager.",
      ],
      [
        "Ersatz und Handel",
        "Preisabstände, Qualität und Handelszugang beeinflussen Beschaffung.",
        "Faserpreise und Exportflüsse.",
      ],
    ],
    chain: [
      ["Konsum schwächer", "Kleidung wird weniger bestellt."],
      ["Textillager", "Firmen bauen Vorräte ab."],
      ["Spinnereien", "Sie können weniger Rohbaumwolle kaufen."],
      ["Preis", "Der Nachfragekanal kann trotz Ernteproblemen belasten."],
    ],
    example: {
      title: "Kleine Ernte, schwacher Markt",
      situation:
        "Gedankenbeispiel: Eine Ernteprognose sinkt, gleichzeitig werden Textilaufträge deutlich reduziert.",
      explanation:
        "Weniger Angebot und weniger Nachfrage arbeiten gegeneinander. Prüfe die Gesamtbilanz statt nur das Wetter.",
    },
    counterweights: [
      "Textillageraufbau kann Nachfrage vorübergehend von Endkäufen lösen.",
      "Qualitätsunterschiede begrenzen Ersatzmöglichkeiten.",
    ],
    takeaway:
      "Baumwolle ist ein Agrarangebot mit starkem industriellem Nachfragekontext.",
    action:
      "Ergänze jede Baumwoll-Wetternotiz um einen Befund zur Textilnachfrage.",
    quiz: {
      question: "Welche zusätzliche Nachfragekette gehört zu Baumwolle?",
      options: [
        "Textilien und Bekleidung.",
        "Nur das Wetter; Konsumausgaben sind davon unabhängig.",
        "Nur die Lebensmittelverarbeitung.",
      ],
      correct: 0,
      explanation:
        "Die Verarbeitung in Textilien verbindet Baumwolle mit Konsum und Industriebestellungen.",
    },
    related: ["china-slowdown", "growth", "supply-demand"],
    terms: ["inventories", "substitution", "new-orders"],
    sources: ["usda-cotton", "usda-wasde"],
  }),
  defineLesson("agriculture", {
    id: "sugar",
    title: "Zucker · Rohr, Rübe und die Ethanol-Alternative",
    subtitle: "Produzenten können Nutzung und Exportangebot verändern",
    summary:
      "Zucker hängt an Ernten, Verarbeitung, Exportregeln und bei manchen Produzenten an der Ethanolökonomie.",
    context:
      "Zucker kommt aus Rohr oder Rüben. Bei geeigneten Anlagen kann Zuckerrohr unterschiedlich für Zucker und Ethanol verwendet werden. Dadurch zählen neben Wetter und Nahrungskonsum auch relative Erlöse, Kapazität und Regeln. Ein Rohzucker-Futures und raffinierter Zucker bilden unterschiedliche Qualitäten und Lieferbedingungen ab.",
    drivers: [
      [
        "Ernte und Zuckergehalt",
        "Nicht nur Pflanzenmenge, sondern auch der gewinnbare Zucker zählt.",
        "Erntemenge, Qualität und Verarbeitung.",
      ],
      [
        "Zucker gegen Ethanol",
        "Relative Erlöse können den Produktionsmix beeinflussen.",
        "Zucker-/Ethanolpreise und lokale Regeln.",
      ],
      [
        "Exportverfügbarkeit",
        "Politische Vorgaben und Logistik verändern lieferbares Angebot.",
        "Exportmengen und bestätigte Beschränkungen.",
      ],
    ],
    chain: [
      ["Ethanol wird attraktiver", "Der alternative Erlös steigt im Beispiel."],
      [
        "Verarbeitungsmix",
        "Geeignete Anlagen können mehr Rohr für Ethanol nutzen.",
      ],
      [
        "Zuckerangebot",
        "Weniger Zucker steht möglicherweise zum Export bereit.",
      ],
      ["Weltmarkt", "Andere Produzenten und Lager bestimmen den Ausgleich."],
    ],
    example: {
      title: "Gute Rohrernte, weniger Zuckerexport",
      situation:
        "Gedankenbeispiel: Es gibt viel Rohr, aber ein größerer Teil geht in Ethanol.",
      explanation:
        "Die Pflanzenmenge allein sagt nicht, wie viel Zucker exportiert wird. Verarbeitungsmix und tatsächliche Ausfuhr gehören zum Kontext.",
    },
    counterweights: [
      "Nicht jede Anlage kann beliebig zwischen Produkten wechseln.",
      "Rübenproduktion oder andere Exporteure können gegenwirken.",
    ],
    takeaway:
      "Bei Zucker gehören Ernte, gewinnbarer Zucker und Verarbeitungsmix zusammen.",
    action:
      "Prüfe bei einer großen Ernteprognose auch die erwartete Zuckerproduktion und Exporte.",
    quiz: {
      question:
        "Kann mehr Zuckerrohr trotzdem mit weniger exportiertem Zucker einhergehen?",
      options: [
        "Ja, wenn mehr für andere Nutzung wie Ethanol verwendet wird.",
        "Nein, die Verwendung ist immer fest.",
        "Nur wenn der Weltmarktpreis unverändert bleibt.",
      ],
      correct: 0,
      explanation:
        "Verarbeitung und Exportregeln bestimmen, welche Menge tatsächlich zum Zuckerangebot wird.",
    },
    related: ["corn", "oil", "basis"],
    terms: ["substitution", "margin", "marketing-year"],
    sources: ["usda-sugar", "usda-sugar-background"],
  }),
  defineLesson("agriculture", {
    id: "palm-oil",
    title: "Palmöl · Produktion, Exportpolitik und andere Öle",
    subtitle: "Der Markt für Pflanzenöle ist verbunden, aber nicht identisch",
    summary:
      "Palmöl hängt an Anbaubedingungen, verfügbarem Exportangebot, Nachfrage und Konkurrenz durch andere Öle.",
    context:
      "Ölpalmen sind mehrjährige Pflanzen. Große Produktionszentren in Indonesien und Malaysia machen dortige Bedingungen wichtig. Palmöl wird in Lebensmitteln und industriell genutzt. Nationale Biokraftstoffnutzung kann die Menge beeinflussen, die für den Export bleibt. Andere Öle können je nach Verwendungszweck teilweise ersetzen.",
    drivers: [
      [
        "Produktion",
        "Wetter, Pflanzenalter und Erntezugang beeinflussen die Mengen.",
        "Produktions- und Lagerberichte.",
      ],
      [
        "Inlandsnutzung und Politik",
        "Mehr heimischer Verbrauch oder Exportregeln können das Weltangebot verändern.",
        "Bestätigte Regeln und tatsächliche Exporte.",
      ],
      [
        "Andere Pflanzenöle",
        "Preisabstände lenken Beschaffung, soweit Produkte austauschbar sind.",
        "Soja-, Raps- und Sonnenblumenöl.",
      ],
    ],
    chain: [
      ["Inlandsnutzung steigt", "Mehr Öl wird lokal benötigt."],
      [
        "Exportpuffer",
        "Bei gleicher Produktion bleibt weniger für den Weltmarkt.",
      ],
      ["Käufer wechseln", "Sie prüfen alternative Öle."],
      [
        "Verbundene Märkte",
        "Ein Teil der Nachfrage kann andere Pflanzenöle erreichen.",
      ],
    ],
    example: {
      title: "Politische Ankündigung und Mengen",
      situation:
        "Gedankenbeispiel: Eine neue Beimischung wird angekündigt, die Umsetzung ist noch offen.",
      explanation:
        "Ankündigung, tatsächlicher Verbrauch und verfügbare Exporte sind drei verschiedene Beobachtungen. Plane keine sichere Mengenwirkung aus dem ersten Schritt allein.",
    },
    counterweights: [
      "Gute Produktion und Lager können die zusätzliche Nutzung ausgleichen.",
      "Technische Eigenschaften und Regeln begrenzen Ersatz.",
    ],
    takeaway: "Prüfe beim Palmöl die Mengenbilanz und den Pflanzenölverbund.",
    action:
      "Vergleiche Palmöl mit mindestens einem anderen Pflanzenöl und kontrolliere tatsächliche Exportmengen.",
    quiz: {
      question: "Warum kann Sojaöl auf eine Palmölknappheit reagieren?",
      options: [
        "Weil manche Käufer teilweise auf andere Öle ausweichen können.",
        "Weil alle Öle dasselbe Futures-Symbol haben.",
        "Weil jeder Käufer ohne Qualitäts- oder Kostenunterschied wechseln kann.",
      ],
      correct: 0,
      explanation:
        "Teilweise Ersatzmöglichkeiten verbinden die Nachfrage, ohne die Märkte gleichzusetzen.",
    },
    related: ["soy-crush", "rapeseed", "inventories"],
    terms: ["substitution", "inventories", "marketing-year"],
    sources: ["usda-oil-yearbook", "usda-oil-outlook"],
  }),
  defineLesson("agriculture", {
    id: "rapeseed",
    title: "Raps · Öl, Schrot und unterschiedliche Anbauformen",
    subtitle: "Europa und Kanada brauchen ihren eigenen Kontext",
    summary:
      "Raps verbindet Pflanzenölnachfrage, Futterprodukte, regionale Ernten und konkurrierende Ölsaaten.",
    context:
      "Raps wird wie andere Ölsaaten verarbeitet und liefert Öl plus Schrot. Europäischer Winterraps und wichtige kanadische Canola-Anbausysteme haben andere Kalender und Sorteneigenschaften. Ein Ereignis in einer Region lässt sich deshalb nicht allein über den Monat auf eine andere übertragen. Saat, Überwinterung, Blüte und Ernte brauchen örtlichen Kontext.",
    drivers: [
      [
        "Regionale Ernte",
        "Wetter, Fläche und Sorteneigenschaften bestimmen Angebot.",
        "Land, Anbauform und Entwicklungsphase.",
      ],
      [
        "Öl und Verarbeitung",
        "Erlöse für beide Produkte beeinflussen Crush und Bohnen-/Saatnachfrage.",
        "Öl-/Schrotpreise und Kapazität.",
      ],
      [
        "Handel und Ersatz",
        "Einfuhrregeln und konkurrierende Ölsaaten verändern Beschaffung.",
        "Liefermengen und Pflanzenölabstände.",
      ],
    ],
    chain: [
      ["Ernteausblick fällt", "Eine Region erwartet weniger Saat."],
      ["Verarbeitung sucht Angebot", "Mühlen prüfen Herkunft und Preis."],
      ["Ersatzmöglichkeiten", "Andere Saaten oder Öle helfen nur teilweise."],
      ["Preisabstand", "Regionale Aufschläge können sich verändern."],
    ],
    example: {
      title: "Gleicher Monat, andere Phase",
      situation:
        "Gedankenbeispiel: Ein europäisches Winterrapsfeld und eine kanadische Frühjahrsfläche werden im gleichen Monat betrachtet.",
      explanation:
        "Die Pflanzen können in verschiedenen Phasen sein. Wetterrelevanz ist deshalb regional, nicht nur kalendarisch.",
    },
    counterweights: [
      "Andere Ölsaaten und Importmengen können einen Engpass begrenzen.",
      "Qualität und Verarbeitung verhindern vollständige Austauschbarkeit.",
    ],
    takeaway:
      "Benenne bei Raps immer Region, Anbauform und Öl-/Schrotzusammenhang.",
    action:
      "Öffne zuerst die konkrete Region, bevor du einen Wetterhinweis auf Raps überträgst.",
    quiz: {
      question:
        "Reicht derselbe Monat, um Wetterwirkungen in Europa und Kanada gleichzusetzen?",
      options: [
        "Ja, alle Pflanzen sind synchron.",
        "Nein, Anbauform und Entwicklungsphase unterscheiden sich.",
        "Nur der Börsenkurs bestimmt die Blüte.",
      ],
      correct: 1,
      explanation:
        "Ein typischer Kalender ist ein Einstieg. Die tatsächliche regionale Pflanzenphase braucht eigene Prüfung.",
    },
    related: ["crop-calendar", "soy-crush", "palm-oil"],
    terms: ["crush", "substitution", "yield-crop"],
    sources: ["usda-oil-yearbook", "usda-oil-outlook"],
    tools: [{ label: "Rapsregionen und Phasen", path: "/weather" }],
  }),
];
