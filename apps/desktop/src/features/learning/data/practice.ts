import { defineLesson } from "../learning-types";

export const practiceLessons = [
  defineLesson("practice", {
    id: "supply-demand",
    title: "Angebot und Nachfrage · Der gemeinsame Ausgangspunkt",
    subtitle: "Mengen, Erwartungen und Anpassungsgeschwindigkeit",
    summary:
      "Ein Preis ist das Ergebnis mehrerer Kräfte. Entscheidend ist oft die Veränderung gegenüber dem erwarteten Gleichgewicht.",
    context:
      "Mehr Käufer bei gleichem verfügbaren Angebot können den Preis erhöhen. Mehr Angebot bei gleichem Bedarf kann ihn senken. In der Realität ändern sich oft beide gleichzeitig. Lager, Lieferorte und die Reaktionsgeschwindigkeit machen aus der einfachen Grundidee einen konkreten Markt. Auch erwartete Veränderungen können den Preis bewegen, bevor eine neue Menge geliefert wird.",
    drivers: [
      [
        "Angebot",
        "Produktion, Lieferwege und verfügbare Lager bestimmen, was Käufer tatsächlich erreichen.",
        "Mengen, Orte und Lieferzeit.",
      ],
      [
        "Nachfrage",
        "Endverbrauch, Verarbeitung und Lageraufbau sind unterschiedliche Kaufmotive.",
        "Verbrauch versus Vorratskäufe.",
      ],
      [
        "Anpassung",
        "Ersatz und neue Kapazität reagieren je nach Gut unterschiedlich schnell.",
        "Technische Grenzen und Zeithorizont.",
      ],
    ],
    chain: [
      [
        "Neue Information",
        "Ein Ausfall wird größer eingeschätzt als erwartet.",
      ],
      ["Verfügbarkeit", "Käufer prüfen Puffer und Ersatz."],
      ["Reaktion", "Mengen oder Preise müssen sich anpassen."],
      [
        "Neuer Vergleich",
        "Nachfrage, Angebot und Erwartung werden gemeinsam neu bewertet.",
      ],
    ],
    example: {
      title: "Kleine Ernte muss nicht steigende Preise bedeuten",
      situation:
        "Gedankenbeispiel: Ernte fällt um einen gedachten Betrag, Verbrauch fällt noch stärker.",
      explanation:
        "Das Verhältnis kann entspannter statt enger werden. Eine Angebotsüberschrift braucht immer den Nachfragevergleich.",
    },
    counterweights: [
      "Ein lokaler Engpass muss kein globaler sein.",
      "Eine bereits erwartete Veränderung kann wenig neue Preiswirkung haben.",
    ],
    takeaway: "Frage nach verfügbarer Menge, Bedarf, Puffer und Überraschung.",
    action:
      "Schreibe vier Zeilen für ein Asset: Angebot, Nachfrage, Lager, neue Information.",
    quiz: {
      question:
        "Angebot sinkt, Nachfrage sinkt stärker. Muss der Preis steigen?",
      options: [
        "Nein, die Bilanz kann sich trotzdem entspannen.",
        "Ja, Angebot ist die einzige Größe.",
        "Ja, jede Menge ist irrelevant.",
      ],
      correct: 0,
      explanation:
        "Die relative Entwicklung beider Seiten und die vorherige Erwartung zählen.",
    },
    related: ["inventories", "expectations", "soybeans"],
    terms: ["inventories", "substitution", "priced-in"],
    sources: ["cme-fundamentals", "eia-balance", "usda-wasde"],
  }),
  defineLesson("practice", {
    id: "inventories",
    title: "Lagerbestände · Der Puffer zwischen Produktion und Verbrauch",
    subtitle: "Ort und Verfügbarkeit sind wichtiger als eine große Zahl",
    summary:
      "Bestände können Engpässe abfedern. Die passende Einordnung braucht Verbrauch, Standort und Jahreszeit.",
    context:
      "Ein Lager ist wie ein Vorrat zu Hause: Zehn Packungen reichen lange bei wenig Verbrauch und kurz bei viel Verbrauch. Stocks-to-use setzt Endlager in Beziehung zum Verbrauch eines passenden Zeitraums. Das ist ein Bilanzhinweis, keine feste Preisformel. Globale Bestände können an Orten liegen, an denen sie dem betrachteten Käufer nicht zur Verfügung stehen.",
    drivers: [
      [
        "Bestand relativ zum Bedarf",
        "Dieselbe Menge hat bei anderem Verbrauch einen anderen Pufferwert.",
        "Definition, Zeitraum und Stocks-to-use.",
      ],
      [
        "Standort und Qualität",
        "Transport, Besitz und Güteeigenschaften begrenzen nutzbare Mengen.",
        "Lieferbare statt nur registrierte Bestände.",
      ],
      [
        "Saison und Veränderung",
        "Ernte und Winterbedarf erzeugen typische Lagerbewegungen.",
        "Vergleich mit derselben Jahreszeit.",
      ],
    ],
    chain: [
      ["Produktion geringer als Verbrauch", "Der Markt benötigt einen Puffer."],
      ["Lager werden genutzt", "Bestände sinken."],
      [
        "Puffer wird kleiner",
        "Neue Störungen können schwerer abfangbar werden.",
      ],
      [
        "Preiswirkung",
        "Erwartung, Lieferbarkeit und Nachfragereaktion entscheiden zusätzlich.",
      ],
    ],
    example: {
      title: "Hoher Bestand, unpassender Ort",
      situation:
        "Gedankenbeispiel: Weltweit gibt es viel Getreide, aber wichtige Lager sind nicht zum Export freigegeben.",
      explanation:
        "Der Puffer für einen Importeur ist kleiner als die globale Zahl suggeriert. Lieferbarer Bestand und Weltbestand sind nicht gleich.",
    },
    counterweights: [
      "Lageraufbau kann Angebotsstärke oder enttäuschte Nachfrage ausdrücken.",
      "Nicht jeder offizielle Lagerbericht deckt alle Bestände ab.",
    ],
    takeaway: "Lies Bestände mit Nenner, Ort, Qualität und Saison.",
    action:
      "Beschrifte jeden Lagervergleich mit Markt, Zeitraum und tatsächlicher Verfügbarkeit.",
    quiz: {
      question: "Was bedeutet ein höherer Lagerbestand allein?",
      options: [
        "Noch keinen eindeutigen Preisbefund; Bedarf und Verfügbarkeit fehlen.",
        "Immer steigende Preise.",
        "Immer exakt genug Vorrat für ein Jahr.",
      ],
      correct: 0,
      explanation: "Ein Bestand braucht den Verbrauchs- und Lieferkontext.",
    },
    related: ["soybeans", "gas", "basis"],
    terms: ["inventories", "stocks-to-use", "marketing-year"],
    sources: ["usda-wasde", "eia-balance", "eia-gas-storage"],
  }),
  defineLesson("practice", {
    id: "crop-calendar",
    title: "Agrarwetter · Ort und Pflanzenphase zuerst",
    subtitle: "Eine Temperatur ist noch kein Ertragsschaden",
    summary:
      "Wetter wird erst mit Anbauort, Entwicklungsphase und tatsächlicher Abdeckung agrarökonomisch verständlich.",
    context:
      "Regen kann bei Trockenheit helfen und bei der Ernte behindern. Hitze in einer empfindlichen Phase ist anders als Wärme nach der Ernte. Ein typischer Kalender ist eine Orientierung und misst keine aktuelle Pflanzenentwicklung. Einzelne Wetterpunkte beschreiben außerdem kein ganzes Anbaugebiet. Für einen tatsächlichen Ertragsschaden braucht es weitere Belege.",
    drivers: [
      [
        "Standort",
        "Wetter muss relevante Produktionsflächen treffen.",
        "Region, Punktabdeckung und belegte Produktion.",
      ],
      [
        "Entwicklungsphase",
        "Saat, Blüte, Reifung und Ernte besitzen andere Empfindlichkeiten.",
        "Aktuelle Crop-Progress-Berichte.",
      ],
      [
        "Dauer und Ausgangslage",
        "Boden, vorherige Feuchte und Dauer verändern die Wirkung.",
        "Zeitraum und bestätigte Feldberichte.",
      ],
    ],
    chain: [
      ["Wetterereignis", "Ein Modell zeigt Hitze oder Regen."],
      ["Region prüfen", "Ist dort relevante Produktion?"],
      ["Phase prüfen", "Welche Pflanzenphase wird tatsächlich gemeldet?"],
      [
        "Befund suchen",
        "Ernteberichte müssen eine mögliche Wirkung bestätigen oder widerlegen.",
      ],
    ],
    example: {
      title: "Gleicher Regen, andere Wirkung",
      situation:
        "Gedankenbeispiel: Regen erreicht ein wachsendes Feld nach Trockenheit und ein erntereifes Feld gleichzeitig.",
      explanation:
        "Wasserzufuhr kann dem ersten helfen, die Ernte beim zweiten erschweren. Ein allgemeines gut/schlecht für Regen wäre zu grob.",
    },
    counterweights: [
      "Vorhersagen sind Modelle, keine sicheren zukünftigen Messwerte.",
      "Ein Wetterrisiko ist kein direktes Preissignal; Lager und Nachfrage bleiben wichtig.",
    ],
    takeaway:
      "Benutze die Kette Wetter → Ort → Phase → bestätigter Pflanzen-/Erntebefund.",
    action:
      "Vergleiche einen Wetterhinweis mit Crop Progress und späteren Ernteschätzungen.",
    quiz: {
      question:
        "Beweist ein heißer Wetterpunkt bereits einen nationalen Ernteverlust?",
      options: [
        "Nein, Fläche, Phase und Feldbefund fehlen.",
        "Ja, jeder Punkt repräsentiert jedes Feld.",
        "Ja, automatisch mit genauer Prozentzahl.",
      ],
      correct: 0,
      explanation:
        "Punktmodell und Ertragsmessung sind verschiedene Informationen.",
    },
    related: ["corn", "soybeans", "coffee", "rapeseed"],
    terms: ["yield-crop", "marketing-year", "revision"],
    sources: ["usda-crop-progress", "usda-wasde"],
    tools: [
      { label: "Wetter mit regionalen Grenzen ansehen", path: "/weather" },
    ],
  }),
  defineLesson("practice", {
    id: "basis",
    title: "Basis · Warum lokaler Preis und Futures abweichen",
    subtitle: "Ort, Qualität und Zeit ausdrücklich benennen",
    summary:
      "Die Basis beschreibt einen Preisabstand zwischen Kassamarkt und passendem Futures. Die Vorzeichenkonvention muss klar sein.",
    context:
      "Ein lokaler Käufer zahlt nicht nur den Börsenpreis. Qualität, Fracht, Lieferzeit und regionales Angebot bestimmen seinen Preis mit. In der Agrarpraxis wird Basis häufig als Kassapreis minus Futures angegeben; andere Quellen verwenden die umgekehrte Schreibweise. Ohne Beschriftung kann deshalb positiv genau das Gegenteil meinen. Wähle außerdem einen passenden Kontrakt und gleiche Einheiten.",
    drivers: [
      [
        "Lokale Verfügbarkeit",
        "Regionale Knappheit kann einen Aufschlag gegenüber dem Referenzmarkt erzeugen.",
        "Lieferort und verfügbare Menge.",
      ],
      [
        "Transport und Qualität",
        "Kosten und Produkteigenschaften erklären einen Teil des Abstands.",
        "Fracht, Sorte und identische Einheit.",
      ],
      [
        "Kontrakt und Definition",
        "Laufzeit und Vorzeichen bestimmen den Vergleich.",
        "Cash minus Futures oder umgekehrt? ",
      ],
    ],
    chain: [
      ["Lokales Angebot wird knapp", "Ein Käufer muss Ersatz beschaffen."],
      ["Lieferkosten", "Entfernte Ware kostet zusätzlich Fracht."],
      ["Kassapreis", "Der lokale Preis kann relativ steigen."],
      ["Basis", "Der Abstand verändert sich auch bei unverändertem Futures."],
    ],
    example: {
      title: "Zwei Preise, klare Rechnung",
      situation:
        "Gedankenbeispiel: Lokaler Preis 105, Futures 100 in gleicher Einheit.",
      explanation:
        "Mit Cash minus Futures ist die Basis +5. Mit Futures minus Cash ist sie −5. Die wirtschaftliche Situation ist dieselbe; nur die Konvention ist anders.",
    },
    counterweights: [
      "Unterschiedliche Güte oder Einheit machen einen Abstand nicht direkt vergleichbar.",
      "Kontraktwechsel können Sprünge erzeugen, die keine lokale Knappheit messen.",
    ],
    takeaway: "Beschrifte Basis immer mit Ort, Qualität, Kontrakt und Formel.",
    action:
      "Rechne einen Preisabstand erst nach Prüfung von Einheit, Termin und Vorzeichen.",
    quiz: {
      question:
        "Cash 105, Futures 100: Welche Basis ergibt Cash minus Futures?",
      options: ["+5", "−5", "Immer 0"],
      correct: 0,
      explanation:
        "105 minus 100 ergibt +5. Mit umgekehrter Definition wäre das Vorzeichen anders.",
    },
    related: ["futures", "wheat", "inventories"],
    terms: ["basis", "futures", "spread"],
    sources: ["cme-glossary", "cme-basis"],
  }),
  defineLesson("practice", {
    id: "futures",
    title: "Futures, Contango und Backwardation",
    subtitle: "Liefertermine sind keine Preisprognose mit Garantie",
    summary:
      "Futures sind Verträge für bestimmte Bedingungen und Termine. Ihre Zeitstruktur beeinflusst den Ertrag beim Rollen.",
    context:
      "Ein Futures gehört zu einer festgelegten Menge, Qualität, Abwicklung und Laufzeit. Viele Positionen werden vor Fälligkeit geschlossen oder in einen späteren Kontrakt gerollt. Contango beschreibt eine steigende Terminstruktur, Backwardation eine fallende. Finanzierung, Lager, Nutzen sofort verfügbarer Ware und Erwartungen spielen mit. Die Kurve ist keine sichere Vorhersage künftiger Spotpreise.",
    drivers: [
      [
        "Haltekosten",
        "Finanzierung und Lager können spätere Lieferung verteuern.",
        "Kosten und konkrete Kontraktlaufzeiten.",
      ],
      [
        "Sofortverfügbarkeit",
        "Knapp verfügbare Ware kann heute besonders wertvoll sein.",
        "Lager und nahe Terminabstände.",
      ],
      [
        "Rollen",
        "Ein Kontraktwechsel und spätere Preisentwicklung beeinflussen die Anlage.",
        "Produktregeln, Rolltermine und Gebühren.",
      ],
    ],
    chain: [
      ["Laufzeit endet", "Die Position soll weiterlaufen."],
      ["Alter Kontrakt schließen", "Der bisherige Vertrag wird beendet."],
      [
        "Neuen eröffnen",
        "Eine spätere Laufzeit hat möglicherweise einen anderen Preis.",
      ],
      [
        "Ertrag",
        "Preisbewegung, Rollstruktur und Kosten bestimmen das Ergebnis zusammen.",
      ],
    ],
    example: {
      title: "Spotpreis reicht für den Produktertrag nicht",
      situation:
        "Gedankenbeispiel: Ein Rohstoffpreis bleibt stabil, ein rollendes Produkt hält aber andere Kontrakte über die Zeit.",
      explanation:
        "Die Anlage kann wegen Terminstruktur und Kosten anders laufen als der Spotchart. Prüfe das konkrete Produkt statt beide Reihen gleichzusetzen.",
    },
    counterweights: [
      "Contango kann sich ändern und misst nicht nur Überangebot.",
      "Broker-CFDs, Futures und rollende Fonds haben unterschiedliche Regeln.",
    ],
    takeaway:
      "Benenne Instrument, Laufzeit und Rollregeln vor dem Preisvergleich.",
    action:
      "Lies die Kontraktspezifikation und die Rollmethodik eines Produkts, bevor du seine Historie interpretierst.",
    quiz: {
      question:
        "Ist eine steigende Futureskurve eine Garantie für steigende Spotpreise?",
      options: [
        "Nein, Kosten, Verfügbarkeit und Erwartungen wirken mit.",
        "Ja, vertraglich garantiert.",
        "Ja, solange kein Kontrakt physisch geliefert wird.",
      ],
      correct: 0,
      explanation:
        "Eine Terminstruktur ist ein heutiger relativer Preis verschiedener Liefertermine.",
    },
    related: ["basis", "oil", "risk"],
    terms: ["futures", "contango", "backwardation", "roll-yield"],
    sources: ["cme-curve", "cme-roll", "eia-gas-futures"],
  }),
  defineLesson("practice", {
    id: "cot",
    title: "COT · Positionierung als Kontext",
    subtitle: "Wer hält was, aus welchem Grund und von wann?",
    summary:
      "COT-Berichte zeigen Positionen bestimmter Teilnehmergruppen. Sie sind verzögerter Kontext, kein Live-Orderfluss.",
    context:
      "Die CFTC veröffentlicht Aufschlüsselungen offener Positionen. Die üblichen Berichte beziehen sich auf einen Dienstag und werden normalerweise später am Freitag veröffentlicht; Feiertagspläne können abweichen. Commercials können Risiken absichern, Spekulanten andere Motive haben. Berichtsgruppen und Futures-only/Futures-plus-Optionen unterscheiden sich. Netto ist Long minus Short, nicht die gesamte Aktivität.",
    drivers: [
      [
        "Gruppe und Markt",
        "Eine Absicherung hat einen anderen Zweck als eine spekulative Position.",
        "Berichtstyp und Teilnehmerdefinition.",
      ],
      [
        "Niveau und Änderung",
        "Großer Nettobestand und neuer Zufluss sind verschiedene Dinge.",
        "Long, Short, Netto und Vorwoche.",
      ],
      [
        "Historischer Vergleich",
        "Ein Extrem kann Gedränge zeigen, aber längere Zeit bestehen bleiben.",
        "Stichprobe, Datenstand und Preisreaktion.",
      ],
    ],
    chain: [
      [
        "Positionen wachsen",
        "Eine Gruppe erhöht im Beispiel ihre Netto-Long-Position.",
      ],
      [
        "Kontext prüfen",
        "Motive und Gesamtpositionen können unterschiedlich sein.",
      ],
      [
        "Gedränge",
        "Bei ähnlichen Positionen kann ein Schock mehr Rückbau auslösen.",
      ],
      ["Zeitpunkt offen", "Ein Extrem liefert keinen festen Wendepunkt."],
    ],
    example: {
      title: "Netto steigt ohne neue Longs",
      situation:
        "Gedankenbeispiel: Longs bleiben gleich, Shorts werden reduziert.",
      explanation:
        "Netto wird positiver, ohne dass neue Long-Positionen aufgebaut wurden. Die Einzelkomponenten erklären die Veränderung besser.",
    },
    counterweights: [
      "Die Erhebung beschreibt nicht alle weltweiten Positionen eines Assets.",
      "Ein altes Extrem ist keine aktuelle Position und kein alleiniger Einstieg.",
    ],
    takeaway: "Lies Gruppe, Stichtag, Einzelpositionen und Historie gemeinsam.",
    action:
      "Schreibe zu einem COT-Bild Erhebungsdatum, Publikationsdatum und den Grund der Nettoänderung.",
    quiz: {
      question: "Kann Netto-Long zunehmen, obwohl Longs unverändert bleiben?",
      options: [
        "Ja, wenn Shorts abgebaut werden.",
        "Nein, Netto ist immer gleich Long.",
        "Nur wenn der Kurs unverändert ist.",
      ],
      correct: 0,
      explanation:
        "Netto = Long minus Short. Weniger Short erhöht Netto bei gleichen Longs.",
    },
    related: ["carry-trade", "liquidity", "checklist"],
    terms: ["cot", "net-position", "hedging"],
    sources: ["cftc-cot", "cftc-notes", "cftc-schedule"],
    tools: [{ label: "COT mit Stichtag vergleichen", path: "/cot" }],
  }),
  defineLesson("practice", {
    id: "seasonality",
    title: "Seasonality · Kalenderkontext mit Grenzen",
    subtitle: "Ein Durchschnitt ist kein persönliches Versprechen",
    summary:
      "Saisonale Muster beschreiben vergangene Verläufe. Stichprobe, Instrument und außergewöhnliche Jahre zählen.",
    context:
      "Ernte, Heizbedarf, Feiertage und institutionelle Abläufe können kalenderbezogene Muster erzeugen. Preisrenditen sind dennoch eine historische Verteilung, keine feste Uhr. Ein Durchschnitt kann durch wenige extreme Jahre dominiert sein. Spot, Futures und rollende Produkte sind unterschiedliche Instrumente. Ein Muster ersetzt keine aktuelle Angebots-/Nachfrageprüfung.",
    drivers: [
      [
        "Ökonomischer Kalender",
        "Ein nachvollziehbarer Ablauf ist hilfreicher als eine zufällig schöne Linie.",
        "Ernte, Verbrauch oder bekannte Abläufe.",
      ],
      [
        "Stichprobe",
        "Wenige Jahre und Ausreißer können den Befund unsicher machen.",
        "Jahre, Median, Streuung und Einzeljahre.",
      ],
      [
        "Instrument/Zeitraum",
        "Kontrakte, Datenlücken und gewählte Fenster beeinflussen das Ergebnis.",
        "Spot/Futures, Kosten und genaue Datenbasis.",
      ],
    ],
    chain: [
      ["Historische Reihe", "Vergangene Jahre werden verglichen."],
      ["Muster", "Ein Zeitraum hat im Mittel eine bestimmte Rendite."],
      ["Robustheit", "Prüfe Einzeljahre und alternative Fenster."],
      ["Heutiger Kontext", "Aktuelle Treiber können das Muster überlagern."],
    ],
    example: {
      title: "Positiver Durchschnitt mit vielen Verlustjahren",
      situation:
        "Gedankenbeispiel: Ein sehr starkes Jahr zieht den Mittelwert hoch, obwohl mehrere Jahre verlieren.",
      explanation:
        "Durchschnitt, Trefferquote und Streuung beantworten andere Fragen. Du brauchst die Verteilung, um den Befund zu verstehen.",
    },
    counterweights: [
      "Muster können durch Strukturänderungen verschwinden.",
      "Viele ausprobierte Zeitfenster erhöhen das Risiko zufälliger Treffer.",
    ],
    takeaway: "Frage nach Mechanismus, Stichprobe und Verteilung.",
    action:
      "Prüfe zu einer Saisonkurve mindestens ein schwaches Einzeljahr und den möglichen wirtschaftlichen Grund des Musters.",
    quiz: {
      question:
        "Garantiert ein positiver saisonaler Durchschnitt ein positives nächstes Jahr?",
      options: [
        "Nein, Verteilung und aktueller Kontext bleiben offen.",
        "Ja, der Kalender garantiert es.",
        "Nur wenn alle früheren Jahre gleich lang sind.",
      ],
      correct: 0,
      explanation:
        "Historische Häufigkeiten sind keine Zusage für den nächsten Verlauf.",
    },
    related: ["crop-calendar", "correlations", "futures"],
    terms: ["seasonality", "sample-size", "overfitting"],
    sources: ["cme-fundamentals", "eia-gas", "sec-past-performance"],
    tools: [{ label: "Saisonale Daten mit Stichprobe", path: "/seasonality" }],
  }),
  defineLesson("practice", {
    id: "correlations",
    title: "Korrelation · Zusammenlaufen ist noch keine Ursache",
    subtitle: "Ein gemeinsamer Treiber kann zwei Preise bewegen",
    summary:
      "Eine Korrelation beschreibt gemeinsames Verhalten in einem gewählten Zeitraum. Sie erklärt nicht automatisch den Mechanismus.",
    context:
      "Wenn zwei Preise oft gleichzeitig steigen, können sie direkt verbunden sein oder auf einen dritten Faktor reagieren. CAD und Öl können zum Beispiel beide von stärkerer globaler Nachfrage profitieren. Die Beziehung kann sich ändern, wenn ein Angebotsschock oder die Fed dominiert. Auch Zeitraum, Frequenz und Instrument verändern den statistischen Vergleich.",
    drivers: [
      [
        "Gemeinsamer Faktor",
        "USD, Risiko oder Wachstum können beide Reihen beeinflussen.",
        "Alternative gemeinsame Ursachen.",
      ],
      [
        "Fenster und Frequenz",
        "Tägliche Bewegungen können anders zusammenhängen als monatliche.",
        "Gleiche Datenpunkte und Zeiträume.",
      ],
      [
        "Regimewechsel",
        "Andere Schocks können eine alte Beziehung schwächen oder umkehren.",
        "Ursache der aktuellen Bewegung.",
      ],
    ],
    chain: [
      ["Zwei Preise laufen zusammen", "Eine historische Beziehung fällt auf."],
      ["Hypothese", "Ein gemeinsamer Nachfragefaktor könnte beide bewegen."],
      [
        "Gegenbeispiel",
        "Prüfe eine Phase mit Angebotsstress oder anderem Zinsweg.",
      ],
      ["Einordnung", "Nutze den Zusammenhang als bedingten Kontext."],
    ],
    example: {
      title: "CAD und Öl in zwei Phasen",
      situation:
        "Gedankenbeispiel: Öl steigt erst mit Weltnachfrage, später durch einen Lieferausfall bei starkem USD.",
      explanation:
        "Die gleiche Ölrichtung kann mit anderer CAD-Reaktion zusammenfallen. Ein Koeffizient aus der ersten Phase erklärt nicht automatisch die zweite.",
    },
    counterweights: [
      "Preisniveaus mit gemeinsamen Trends können irreführend korreliert aussehen.",
      "Eine kleine Stichprobe ist anfällig für Zufall und Ausreißer.",
    ],
    takeaway:
      "Suche einen Mechanismus, einen dritten Faktor und ein Gegenbeispiel.",
    action:
      "Formuliere eine Wenn-dann-Hypothese und eine Situation, in der sie nicht gelten müsste.",
    quiz: {
      question: "Beweist gemeinsame Bewegung eine direkte Ursache?",
      options: [
        "Nein, ein dritter Faktor kann beide bewegen.",
        "Ja, immer.",
        "Ja, wenn die beiden Reihen mindestens einen Monat gemeinsam steigen.",
      ],
      correct: 0,
      explanation:
        "Korrelation ist eine Beschreibung. Eine Ursache braucht zusätzlichen wirtschaftlichen und empirischen Beleg.",
    },
    related: ["cad", "oil", "checklist"],
    terms: ["correlation", "sample-size", "overfitting"],
    sources: ["boc-forecast", "rba-aud"],
  }),
  defineLesson("practice", {
    id: "liquidity",
    title: "Liquidität · Verkaufen können und finanzieren können",
    subtitle: "Zwei Bedeutungen, die in Krisen zusammenkommen",
    summary:
      "Marktliquidität beschreibt Handelbarkeit; Finanzierungsliquidität die Fähigkeit, Zahlungen und Sicherheiten zu leisten.",
    context:
      "Ein Vermögenswert kann langfristig solide sein, aber heute schwer verkäuflich. Ein Anleger kann wiederum gute Anlagen halten und trotzdem dringend Bargeld brauchen. Wenn zusätzliche Sicherheiten verlangt werden, können Verkäufe erzwungen werden. Dadurch bewegen sich manchmal viele Assets gleichzeitig, obwohl ihre wirtschaftlichen Treiber verschieden sind.",
    drivers: [
      [
        "Marktliquidität",
        "Wenige Käufer oder dünne Orderbücher erhöhen die Wirkung einer Order.",
        "Spread, handelbare Menge und Marktzeit.",
      ],
      [
        "Finanzierung",
        "Fällige Zahlungen und Sicherheiten können kurzfristige Verkäufe auslösen.",
        "Margin-Anforderungen und Refinanzierung.",
      ],
      [
        "Hebel und Gedränge",
        "Viele ähnlich finanzierte Positionen können dieselbe Reaktion verstärken.",
        "Volatilität und Positionierung.",
      ],
    ],
    chain: [
      ["Schock", "Preise bewegen sich stark."],
      ["Sicherheiten steigen", "Gehebelte Anleger brauchen Liquidität."],
      ["Verkäufe", "Auch andere Anlagen werden verkauft."],
      [
        "Verstärkung",
        "Wenig Käufer können weitere Preisrückgänge begünstigen.",
      ],
    ],
    example: {
      title: "Gute Anlage, schlechter Verkaufsmoment",
      situation:
        "Gedankenbeispiel: Eine Anlage hat unveränderte langfristige Aussichten, Käufer sind im Stressmoment aber knapp.",
      explanation:
        "Der kurzfristig erreichbare Preis kann schlechter sein. Qualität und sofortige Handelbarkeit sind nicht dasselbe.",
    },
    counterweights: [
      "Notenbankmaßnahmen und neue Käufer können Finanzierung entspannen.",
      "Ein breiter Verkauf ist allein noch kein Beweis für eine bestimmte Finanzierungskette.",
    ],
    takeaway:
      "Frage nicht nur nach Wert, sondern auch nach handelbarer Menge und Zahlungsbedarf.",
    action:
      "Benenne in einer Stressgeschichte, wer verkaufen muss und aus welchem belegbaren Grund.",
    quiz: {
      question:
        "Kann eine langfristig solide Anlage aus Liquiditätsbedarf verkauft werden?",
      options: [
        "Ja, ein Anleger kann trotzdem sofort Geld benötigen.",
        "Nein, nur schlechte Anlagen werden verkauft.",
        "Nur wenn ihr Kupon null ist.",
      ],
      correct: 0,
      explanation:
        "Anlagenqualität und Finanzierungsfähigkeit des Halters sind getrennte Dinge.",
    },
    related: ["gold", "jpy", "carry-trade", "risk"],
    terms: ["liquidity", "margin-call", "leverage", "spread"],
    sources: ["bis-carry", "bis-carry-unwind", "eia-financial"],
  }),
  defineLesson("practice", {
    id: "risk",
    title: "Eine gute Erklärung ist noch kein guter Trade",
    subtitle: "Zeithorizont, Verlustgrenze und Instrument verstehen",
    summary:
      "Eine wirtschaftliche Hypothese kann plausibel sein und trotzdem einen ungünstigen Handelsverlauf haben.",
    context:
      "Du kannst einen Treiber richtig verstehen und zu früh handeln, die Gegenwährung übersehen oder ein unpassendes Instrument benutzen. Hebel verstärkt Gewinne und Verluste. Eine geplante Verlustgrenze hängt von tatsächlicher Ausführung ab; bei Sprüngen kann sie schlechter erreicht werden. Lernwissen hilft beim Begründen, ersetzt aber keine konkrete Prüfung der Bedingungen.",
    drivers: [
      [
        "Zeithorizont",
        "Ein langfristiger Bedarf erklärt nicht jeden kurzfristigen Kursweg.",
        "Geltungszeitraum deiner Hypothese.",
      ],
      [
        "Instrument und Größe",
        "Kontraktmenge, Tickwert, Währung und Hebel bestimmen den Geldverlust.",
        "Brokerspezifikation und Kontowährung.",
      ],
      [
        "Gegenbeleg",
        "Ein klarer Prüfpunkt verhindert, dass jede Entwicklung zur passenden Geschichte gemacht wird.",
        "Welche Beobachtung widerlegt die These? ",
      ],
    ],
    chain: [
      ["Hypothese", "Du erwartest einen bedingten wirtschaftlichen Effekt."],
      ["Prüfpunkt", "Definiere, welche neue Information dagegen spricht."],
      ["Geldwirkung", "Verstehe Menge, Kosten und möglichen Verlust."],
      ["Review", "Bewerte später Erklärung und Ausführung getrennt."],
    ],
    example: {
      title: "Richtiges Thema, falsche Einheit",
      situation:
        "Gedankenbeispiel: Kupferbedarf wird plausibel erklärt, aber die Kontraktmenge wird mit einer kleinen CFD-Menge verwechselt.",
      explanation:
        "Die Geldwirkung kann völlig anders sein. Inhaltliches Verständnis und korrekte Positionsrechnung müssen getrennt geprüft werden.",
    },
    counterweights: [
      "Ein Stop garantiert bei Kurssprüngen keine exakte Ausführung.",
      "Eine positive historische Trefferquote beschreibt weder Verlustgröße noch nächsten Trade.",
    ],
    takeaway:
      "Verbinde Verständnis mit Zeithorizont, Gegenbeleg und tatsächlicher Geldwirkung.",
    action:
      "Erkläre zuerst eine Hypothese ohne Handel. Nutze später die echten Instrumentdaten, wenn du eine Positionsrechnung prüfst.",
    quiz: {
      question:
        "Warum reicht eine plausible Macro-Geschichte nicht als Tradeentscheidung?",
      options: [
        "Timing, Instrument, Gegenkräfte und Verlustwirkung bleiben offen.",
        "Weil Wirtschaft nie Einfluss hat.",
        "Weil ein guter Treiber jedes Risiko entfernt.",
      ],
      correct: 0,
      explanation:
        "Die Erklärung beantwortet eine andere Frage als die konkrete Ausführung und Geldwirkung.",
    },
    related: ["futures", "checklist", "correlations"],
    terms: ["leverage", "sample-size", "hedging"],
    sources: ["cftc-risk", "sec-crypto-risk", "sec-past-performance"],
  }),
  defineLesson("practice", {
    id: "carry-trade",
    title: "Carry Trade · Zinsdifferenz gegen Wechselkursrisiko",
    subtitle: "Der kleine laufende Vorteil kann schnell überlagert werden",
    summary:
      "Carry nutzt eine Zinsdifferenz. Eine ungünstige Währungsbewegung kann den Ertrag übersteigen.",
    context:
      "Die Grundidee lautet: günstig finanzieren und eine höher verzinste Alternative halten. Wenn dafür Währungen getauscht werden, entsteht meist ein Wechselkursrisiko. Absicherung verändert den wirtschaftlichen Zinsvorteil und kostet selbst. Carry ist daher weder ein kostenloses Zinsgeschenk noch eine Zusage über den Spotkurs.",
    drivers: [
      [
        "Zinsabstand",
        "Er bestimmt einen Teil des laufenden Ertrags vor Kosten.",
        "Finanzierungs- und Anlagebedingungen.",
      ],
      [
        "Wechselkurs",
        "Ein Kursverlust kann viele Monate Zinsvorteil aufzehren.",
        "Währung und Absicherung.",
      ],
      [
        "Volatilität und Rückbau",
        "Hebel und ähnliche Positionen können Schocks verstärken.",
        "Positionierung und Margin.",
      ],
    ],
    chain: [
      [
        "Günstige Finanzierung",
        "Im Beispiel wird in einer niedrig verzinsten Währung geliehen.",
      ],
      ["Höher verzinste Anlage", "Die Zielwährung wird gekauft."],
      ["Risiko steigt", "Wechselkurs oder Finanzierung wird ungünstiger."],
      [
        "Rückbau",
        "Zielanlage wird verkauft, Finanzierungswährung zurückgekauft.",
      ],
    ],
    example: {
      title: "Jahreszins gegen Wochenbewegung",
      situation:
        "Gedankenbeispiel: Eine Zinsdifferenz beträgt vier Prozent pro Jahr. Die Zielwährung verliert in einer Woche fünf Prozent.",
      explanation:
        "Der kurzfristige Währungsverlust kann den langsamen Zinsvorteil übersteigen. Mit Hebel wird die Geldwirkung größer.",
    },
    counterweights: [
      "Zinsdifferenzen können sich ändern.",
      "Absicherung und reale Finanzierungskosten verändern den theoretischen Ertrag.",
    ],
    takeaway:
      "Carry ist ein Ertragskanal mit Preis-, Finanzierungs- und Rückbaurisiko.",
    action:
      "Skizziere die Finanzierung und nenne, welche Währung bei einem Ausstieg zurückgekauft werden müsste.",
    quiz: {
      question:
        "Kann eine kleine schnelle Währungsbewegung einen Jahreszinsvorteil übersteigen?",
      options: [
        "Ja, Zeithorizont und Größe unterscheiden sich.",
        "Nein, Zinsen schützen den Kurs.",
        "Nur ohne Fremdwährung.",
      ],
      correct: 0,
      explanation:
        "Zins fließt über Zeit, Kurse können sich sofort stark verändern.",
    },
    related: ["jpy", "em-currencies", "liquidity"],
    terms: ["carry", "hedging", "leverage"],
    sources: ["bis-carry", "bis-carry-unwind"],
  }),
  defineLesson("practice", {
    id: "checklist",
    title: "Eine ruhige Macro-Routine in fünf Fragen",
    subtitle: "Vom Wiederfinden zur überprüfbaren Hypothese",
    summary:
      "Du brauchst nicht alles gleichzeitig. Ein Treiber, eine Kette und ein Gegenbeleg reichen für einen klaren Lernschritt.",
    context:
      "Beginne mit einer konkreten Frage, etwa: Warum könnte schwacher China-Bau Eisenerz betreffen? Schreibe dann die Zwischenstationen auf. Markiere, was du weißt und was noch Annahme ist. Beobachte später einen passenden Datenpunkt. Diese Routine ist ein Lernvorschlag; du kannst jederzeit pausieren und wieder einsteigen.",
    drivers: [
      [
        "Was hat sich geändert?",
        "Eine neue Information ist klarer als eine allgemeine Erzählung.",
        "Originalquelle, Datum und Erwartung.",
      ],
      [
        "Über welchen Weg?",
        "Eine benannte Zwischenstation verhindert Sprünge in der Erklärung.",
        "Käufer, Mengen, Kosten oder Zinsweg.",
      ],
      [
        "Was spricht dagegen?",
        "Eine Gegenkraft macht die Hypothese überprüfbar.",
        "Alternative Ursache und Gegenbeleg.",
      ],
    ],
    chain: [
      ["Frage wählen", "Beschränke dich auf ein Asset und eine Ursache."],
      ["Kette schreiben", "Verbinde Ursache, Wirtschaft und Asset."],
      ["Beleg suchen", "Wähle einen konkreten passenden Datenpunkt."],
      [
        "Nachsehen",
        "Vergleiche Erwartung und tatsächliche Entwicklung ohne die alte These umzuschreiben.",
      ],
    ],
    example: {
      title: "Eine kurze Notiz",
      situation:
        "Gedankenbeispiel: Weniger Baubeginne → weniger Stahlbedarf → potenziell weniger Eisenerzbedarf.",
      explanation:
        "Gegenkraft: mehr Stahlexporte oder Angebotsausfall. Beobachtung: Stahlproduktion und Lager. So bekommst du Kontext mit einem klaren nächsten Schritt.",
    },
    counterweights: [
      "Ein passender Kursverlauf beweist den angenommenen Kanal noch nicht.",
      "Viele gleichzeitig gesuchte Belege können Überblick und Überprüfbarkeit erschweren.",
    ],
    takeaway:
      "Fünf Fragen: Was neu? Warum? Wen betrifft es? Was dagegen? Woran prüfen?",
    action:
      "Nutze die Notiz im Kapitel für genau diese fünf Zeilen. Ein unklarer Punkt wird dein nächstes Lernthema.",
    quiz: {
      question: "Was macht eine Lernhypothese überprüfbar?",
      options: [
        "Ein benannter Mechanismus, ein passender Beleg und ein möglicher Gegenbeleg.",
        "Eine möglichst lange Liste ohne Bezug.",
        "Dass jede Preisbewegung immer bestätigt.",
      ],
      correct: 0,
      explanation:
        "Du brauchst einen klaren Zusammenhang und eine Beobachtung, die ihn auch widerlegen könnte.",
    },
    related: ["expectations", "correlations", "risk"],
    terms: ["surprise", "priced-in", "revision"],
    sources: ["rba-growth", "cme-fundamentals"],
    tools: [
      { label: "Einen passenden Release suchen", path: "/economic-calendar" },
    ],
  }),
  defineLesson("practice", {
    id: "pass-through-lesson",
    title: "Preisweitergabe · Warum Kosten nicht sofort im Laden ankommen",
    subtitle: "Wechselkurs, Lager, Verträge und Margen",
    summary:
      "Pass-through beschreibt, wie ein Preis- oder Wechselkursimpuls andere Preise erreicht. Die Weitergabe ist oft unvollständig und verzögert.",
    context:
      "Eine importierte Ware wird günstiger, aber der Händler hat noch alte Ware im Lager. Er bezahlt weiter Miete und Löhne. Vielleicht verändert sich gleichzeitig der Wechselkurs. Deshalb ist der Weg von Fabrikpreis zu Verbraucherpreis kein direkter Schalter. Warenkorb, Wettbewerb und Verträge bestimmen, wie viel und wie schnell ankommt.",
    drivers: [
      [
        "Lager und Verträge",
        "Alte Einkaufspreise und Absicherungen verschieben die Wirkung.",
        "Lagerdauer und Preisbindung.",
      ],
      [
        "Lokale Kosten/Marge",
        "Arbeit, Miete, Transport und Handelsspannen bilden weitere Preisteile.",
        "Kostenanteile und Wettbewerb.",
      ],
      [
        "Wechselkurs",
        "Ein günstigerer Fremdwährungspreis kann lokal durch Abwertung ausgeglichen werden.",
        "Rechnungswährung und lokaler Importpreis.",
      ],
    ],
    chain: [
      ["Erzeugerpreis fällt", "Eine Fabrik liefert günstiger."],
      ["Importkosten", "Fracht und Währung verändern den lokalen Einkauf."],
      ["Handelsstufe", "Lager und Margen beeinflussen die Preisentscheidung."],
      ["Verbraucher", "Nur ein Teil kann später im Warenkorb sichtbar werden."],
    ],
    example: {
      title: "Fabrikpreis fällt, lokale Rechnung bleibt",
      situation:
        "Gedankenbeispiel: USD-Preis sinkt, die lokale Währung verliert etwa im gleichen Verhältnis gegen USD.",
      explanation:
        "Die lokale Importrechnung kann ungefähr gleich bleiben. Die Preisweitergabe hängt vom gemeinsamen Effekt ab, nicht nur von der Fabrikmeldung.",
    },
    counterweights: [
      "Wettbewerb kann Weitergabe fördern, Marktmacht kann sie begrenzen.",
      "Viele Dienstleistungen haben wenig direkten Bezug zu importierter Fabrikware.",
    ],
    takeaway:
      "Folge dem Preis durch alle Stufen und prüfe Währung, Lager und lokale Kosten.",
    action:
      "Zeichne den Weg für ein konkretes Produkt: Fabrik → Import → Handel → Verbraucher.",
    quiz: {
      question:
        "Warum kommt ein günstigerer Fabrikpreis möglicherweise nicht sofort im CPI an?",
      options: [
        "Lager, Währung, lokale Kosten und Margen können die Weitergabe verändern.",
        "CPI misst ausschließlich chinesische Fabriken.",
        "Alle Preise werden sekündlich neu festgelegt.",
      ],
      correct: 0,
      explanation:
        "Produzent und Verbraucher sind verschiedene Stufen mit eigenen Bedingungen.",
    },
    related: ["china-ppi", "dollar-cycle", "inflation"],
    terms: ["pass-through", "margin", "hedging"],
    sources: ["rba-fx", "rbnz-pass-through", "bls-ppi"],
  }),
];
