import { defineLesson } from "../learning-types";

export const tokenizationLessons = [
  defineLesson("tokenization", {
    id: "tokenization",
    title: "Tokenisierung · Ein digitales Zeichen für einen Anspruch",
    subtitle: "Was sich verbessert und was wirtschaftlich gleich bleibt",
    summary:
      "Ein Token kann einen Anspruch oder ein Eigentumsrecht digital abbilden. Die Technik allein macht den Anspruch nicht wertvoller.",
    context:
      "Stell dir eine Anleihe vor, deren Besitz und Übertragung auf einer programmierbaren Plattform geführt werden. Das ist ein möglicher Fall von Tokenisierung. Ein Token kann auch einen Fondsanteil oder einen Anspruch gegen einen Anbieter darstellen. Die wichtige Frage ist zuerst: Was steht hinter ihm und welches Recht bekommst du tatsächlich? Ein Token für Gold ist nicht dasselbe wie ein frei schwebender Kryptowährungstoken.",
    drivers: [
      [
        "Underlying und Rechte",
        "Wert und Zahlungsanspruch hängen vom zugrunde liegenden Gut und der vertraglichen Struktur ab.",
        "Emittent, Vertrag, Eigentum und Rückzahlung.",
      ],
      [
        "Technischer Nutzen",
        "Programmierung kann Abläufe verbinden, kleinere Einheiten ermöglichen oder Abwicklung vereinfachen.",
        "Nachgewiesene Funktionen statt Werbeversprechen.",
      ],
      [
        "Marktzugang",
        "Nutzung hängt von Handelsplatz, zugelassenen Teilnehmern und realer Liquidität ab.",
        "Zugang, Ausstieg und sämtliche Kosten.",
      ],
    ],
    chain: [
      [
        "Ein Anspruch existiert",
        "Zum Beispiel eine Anleihe mit festen Bedingungen.",
      ],
      ["Digitale Abbildung", "Die Plattform führt den Anspruch als Token."],
      ["Übertragung", "Regeln können Besitzwechsel und Zahlung koordinieren."],
      [
        "Dein Nutzen",
        "Vorteile entstehen erst, wenn Rechte, Kosten und Handelbarkeit für deinen Zweck passen.",
      ],
    ],
    example: {
      title: "Kleine Einheit, gleicher wirtschaftlicher Motor",
      situation:
        "Gedankenbeispiel: Ein Produkt erlaubt eine kleinere Beteiligung an einer Anleihe als ein anderes Angebot.",
      explanation:
        "Das kann den Zugang erleichtern. Kreditrisiko, Zinsrisiko, Gebühren und Währungsrisiko bleiben aber zu prüfen. Ein günstigerer klassischer Zugang kann denselben Zweck erfüllen. Die tokenisierte Form ist kein automatischer Renditevorteil.",
    },
    counterweights: [
      "Kleine Stückelung schafft nicht automatisch Käufer für deinen späteren Verkauf.",
      "Rechtliche Durchsetzbarkeit, Verwahrung und Plattformabhängigkeit können zusätzliche Risiken schaffen.",
    ],
    takeaway:
      "Tokenisierung ist eine Form der Abbildung und Abwicklung. Prüfe zuerst den Anspruch und deinen konkreten Nutzen.",
    action:
      "Schreibe für ein Beispiel vier Zeilen: Was halte ich? Wer schuldet mir etwas? Wie steige ich aus? Welche Kosten entstehen?",
    quiz: {
      question: "Was macht einen tokenisierten Anspruch für dich sinnvoll?",
      options: [
        "Allein das Wort Blockchain.",
        "Nachvollziehbare Rechte und ein tatsächlicher Vorteil bei Zugang, Kosten oder Abwicklung.",
        "Eine versprochene risikofreie Rendite.",
      ],
      correct: 1,
      explanation:
        "Die Technik muss einen konkreten Zweck erfüllen. Der wirtschaftliche Wert kommt nicht allein vom Tokenformat.",
    },
    related: ["token-rights", "token-bonds", "token-checklist", "blockchain"],
    terms: ["tokenization", "underlying", "settlement", "fractionalization"],
    sources: ["bis-token-continuum", "fsb-token", "bis-token-summary"],
  }),
  defineLesson("tokenization", {
    id: "token-rights",
    title: "Was gehört dir mit einem Token wirklich?",
    subtitle: "Eigentum, Forderung und Preisabbildung unterscheiden",
    summary:
      "Gleicher Preisbezug bedeutet nicht gleiche Rechte. Ein Token kann andere Ansprüche als das Originalgut vermitteln.",
    context:
      "Ein Aktienbezug auf dem Bildschirm kann verschiedene Strukturen meinen: eine direkt abgebildete Aktie, einen Anspruch gegen einen Verwahrer oder ein Produkt, das nur den Preis nachbildet. Dividenden, Stimmrechte, Rückgabe und Insolvenzbehandlung können sich unterscheiden. Die US-SEC beschreibt solche Unterschiede; das ersetzt keine Prüfung der Bedingungen oder des Rechtsrahmens eines konkreten deutschen/EU-Angebots.",
    drivers: [
      [
        "Rechtsstruktur",
        "Sie bestimmt, ob du Eigentum oder eine Forderung gegen einen Dritten hältst.",
        "Produktvertrag und klare Anspruchsbezeichnung.",
      ],
      [
        "Verwahrung",
        "Ein referenziertes Gut muss nachweisbar vorhanden und passend zugeordnet sein.",
        "Verwahrer, Bestandsnachweis und Trennung.",
      ],
      [
        "Durchsetzung",
        "Technische Übertragbarkeit und rechtliche Durchsetzbarkeit sind verschiedene Fragen.",
        "Rücknahme, Insolvenzbedingungen und Zuständigkeit.",
      ],
    ],
    chain: [
      [
        "Produkt verspricht Preisbezug",
        "Ein Token folgt im Beispiel einer Aktie.",
      ],
      [
        "Vertrag lesen",
        "Der Token kann ein Anspruch gegen einen Anbieter sein.",
      ],
      [
        "Rechte vergleichen",
        "Stimme, Ausschüttung und Rückgabe können abweichen.",
      ],
      [
        "Nutzen beurteilen",
        "Erst die Struktur zeigt, ob der Token deinen Zweck erfüllt.",
      ],
    ],
    example: {
      title: "Kein Stimmrecht trotz Aktienlogo",
      situation:
        "Gedankenbeispiel: Ein Token bildet den Kurs ab, die Bedingungen nennen aber keinen direkten Aktienbesitz.",
      explanation:
        "Ein Logo oder paralleler Preis schafft kein Aktionärsrecht. Wenn du Eigentum willst, muss genau dieses Recht nachweisbar sein. Unklare Bedingungen sind eine offene Frage, kein Detail zum Überspringen.",
    },
    counterweights: [
      "Eine Deckungsbescheinigung ist nicht automatisch eine rechtlich geschützte Zuordnung.",
      "Rechte hängen vom Produkt und seiner Rechtsordnung ab, nicht vom Tokenwort.",
    ],
    takeaway: "Lies zuerst das Recht hinter dem Token, danach die Oberfläche.",
    action:
      "Markiere in den Bedingungen die Passagen zu Eigentum, Verwahrung, Rücknahme und Ausfall. Wenn sie fehlen, bleibt die Prüfung offen.",
    quiz: {
      question:
        "Beweist ein Token mit Aktienpreis automatisch volle Aktionärsrechte?",
      options: [
        "Nein, die konkrete Struktur kann andere Rechte vermitteln.",
        "Ja, das Logo genügt.",
        "Ja, jede Wallet ist ein Aktienregister.",
      ],
      correct: 0,
      explanation:
        "Preisreferenz und Eigentumsrechte sind getrennte Eigenschaften.",
    },
    related: ["tokenization", "custody", "token-checklist"],
    terms: ["underlying", "issuer", "custody", "redemption"],
    sources: ["sec-token-statement", "sec-token-rights", "fsb-token"],
  }),
  defineLesson("tokenization", {
    id: "token-bonds",
    title:
      "Tokenisierte Anleihen und Fonds · Technik ändert nicht den Zinsmotor",
    subtitle: "Kredit, Laufzeit, Währung und Zugang bleiben wichtig",
    summary:
      "Ein digitales Format verändert mögliche Abläufe. Zins- und Kreditrisiken des zugrunde liegenden Produkts bleiben.",
    context:
      "Eine Anleihe verspricht Zahlungen eines Emittenten. Ein Fondsanteil beteiligt dich an einem Portfolio nach seinen Regeln. Tokenisierung kann Besitzführung oder Abwicklung verändern, aber nicht aus einer langen Festzinsanleihe risikoloses Bargeld machen. Bei einem tokenisierten Geldmarktfonds zählen Portfolio, Gebühren, Rücknahmeregeln und Währung weiterhin.",
    drivers: [
      [
        "Anlageinhalt",
        "Laufzeit und Kreditqualität bestimmen wirtschaftliche Risiken.",
        "Portfolio, Emittent und Dauer.",
      ],
      [
        "Rücknahme",
        "Ein Token kann handelbar sein, obwohl Fondsrücknahme nur zu bestimmten Zeiten erfolgt.",
        "Handel versus tatsächliche Rücknahmefristen.",
      ],
      [
        "Gesamtkosten/Währung",
        "Plattform, Netzwerk, Handel und FX können einen kleinen Zinsvorteil aufzehren.",
        "Alle Gebühren und Kontowährung.",
      ],
    ],
    chain: [
      ["Marktzinsen steigen", "Neue vergleichbare Anlagen bieten mehr Zins."],
      ["Alte Festzinsanlage", "Ihr Wert kann fallen."],
      ["Token folgt Anspruch", "Das Format verhindert den Wertverlust nicht."],
      [
        "Ausstieg",
        "Liquidität und Rücknahme bestimmen zusätzlich deinen realisierbaren Preis.",
      ],
    ],
    example: {
      title: "USD-Zins ist nicht dein EUR-Ertrag",
      situation:
        "Gedankenbeispiel: Ein Produkt verdient in Dollar, du misst dein Vermögen in Euro.",
      explanation:
        "Ein fallender Dollar kann den Zinsgewinn in Euro teilweise oder vollständig aufzehren. Vor dem Formatvergleich musst du die Währung des Vermögens und des Ertrags verstehen.",
    },
    counterweights: [
      "Kleinere Mindestbeträge können Zugang erleichtern, aber auch anders erhältlich sein.",
      "Schnelle technische Übertragung bedeutet nicht immer schnelle Fondsrücknahme.",
    ],
    takeaway:
      "Vergleiche Inhalt, Rechte und Gesamtkosten mit einem klassischen Zugang zum selben Zweck.",
    action:
      "Stelle Tokenprodukt und konventionelle Alternative nebeneinander: Portfolio, Rechte, Währung, Kosten, Ausstieg.",
    quiz: {
      question: "Was bleibt bei einer tokenisierten Festzinsanleihe relevant?",
      options: [
        "Zinsrisiko und Kreditrisiko des Emittenten.",
        "Nur die Zahl der Blockchain-Transaktionen.",
        "Kein Risiko, weil die Form digital ist.",
      ],
      correct: 0,
      explanation:
        "Die Verpackung ersetzt keine wirtschaftlichen Zahlungs- und Bewertungsbedingungen.",
    },
    related: ["bonds", "real-yields", "token-rights"],
    terms: ["yield", "duration", "redemption", "settlement"],
    sources: ["sec-bonds", "bis-token-continuum", "fsb-token"],
  }),
  defineLesson("tokenization", {
    id: "stablecoins",
    title: "Stablecoins · Stabil gegenüber was und durch wen?",
    subtitle: "Dollarpreis, Reserven und Rückgabe auseinanderhalten",
    summary:
      "Ein Stablecoin zielt auf einen Referenzwert. Das ist kein Beweis für garantierte Stabilität oder identische Bankrechte.",
    context:
      "Ein USD-Stablecoin versucht meist, seinen Wert nahe einem Dollar zu halten. Für dich in Euro schwankt ein Dollar trotzdem. Die Stabilisierung kann über Reserven, Rücknahmemechanismen oder andere Regeln erfolgen. Tokenisierte Bankeinlagen und Stablecoins sind unterschiedliche Anspruchsmodelle. Ob Schutz- oder Rückgaberechte gelten, hängt vom konkreten Produkt und dem Rechtsrahmen ab.",
    drivers: [
      [
        "Reserven und Verpflichtungen",
        "Qualität, Verfügbarkeit und Zuordnung der Deckung beeinflussen Vertrauen.",
        "Reservebericht, Prüfung und Emittent.",
      ],
      [
        "Rückgabe",
        "Ein direkter Rücknahmeanspruch kann vom Börsenverkauf verschieden sein.",
        "Wer darf wann zu welchem Preis zurückgeben?",
      ],
      [
        "Referenz und Plattform",
        "Währung, Netzwerk und Verwahrung schaffen zusätzliche Abhängigkeiten.",
        "USD/EUR, Netzwerk und Handelsplatz.",
      ],
    ],
    chain: [
      ["Viele wollen aussteigen", "Verkaufs- oder Rücknahmedruck steigt."],
      [
        "Mechanismus wird getestet",
        "Reserven und Rückgabezugang müssen funktionieren.",
      ],
      [
        "Preis kann abweichen",
        "Handels- und Rücknahmefriktionen können den Peg belasten.",
      ],
      [
        "Dein Ergebnis",
        "Referenzwährung und Zugang bestimmen die tatsächliche Auszahlung.",
      ],
    ],
    example: {
      title: "Ein Dollar bleibt ein Dollar, aber nicht ein Euro",
      situation:
        "Gedankenbeispiel: Ein Stablecoin hält exakt einen USD. Der Dollar verliert gegenüber EUR zehn Prozent.",
      explanation:
        "Sein USD-Ziel wurde erfüllt, dein EUR-Wert ist trotzdem gefallen. Das Währungsrisiko ist unabhängig vom Peg-Risiko.",
    },
    counterweights: [
      "Geprüfte Reserven lösen nicht jede operative oder rechtliche Frage.",
      "Ein Zinsangebot rund um einen Stablecoin kann aus einem zusätzlichen Kredit- oder Protokollrisiko stammen.",
    ],
    takeaway:
      "Prüfe Referenzwährung, Emittent, Reserve, Rückgabe und dein eigenes Maß für Stabilität.",
    action:
      "Beantworte schriftlich: stabil gegenüber welcher Währung, mit welchem Anspruch und welchem Ausstieg?",
    quiz: {
      question:
        "Ist ein bei 1 USD stabiler Token automatisch wertstabil in EUR?",
      options: [
        "Nein, USD/EUR schwankt weiterhin.",
        "Ja, alle Währungen sind identisch.",
        "Ja, solange er eine Wallet hat.",
      ],
      correct: 0,
      explanation:
        "Preisbindung an USD entfernt das EUR-Wechselkursrisiko nicht.",
    },
    related: ["token-rights", "defi", "usd"],
    terms: ["stablecoin", "peg", "redemption", "issuer"],
    sources: ["bis-stablecoin", "ecb-stablecoin", "bis-token-summary"],
  }),
  defineLesson("tokenization", {
    id: "smart-contracts",
    title: "Smart Contracts · Automatische Regeln brauchen richtige Eingaben",
    subtitle: "Code, Orakel und Brücken verständlich erklärt",
    summary:
      "Ein Smart Contract führt programmierte Regeln aus. Er prüft nicht automatisch, ob die wirtschaftliche Aussage stimmt.",
    context:
      "Du kannst dir einen Smart Contract wie einen öffentlich beschriebenen Automaten vorstellen: Wenn eine Bedingung erfüllt ist, führt er die festgelegte Aktion aus. Daten von außerhalb der Plattform kommen oft über ein Orakel. Eine Brücke verbindet verschiedene Netzwerke. Damit entstehen zusätzliche Stellen, deren Funktion und Kontrolle du verstehen musst.",
    drivers: [
      [
        "Code und Änderungsrechte",
        "Fehler oder administrative Eingriffe können das Verhalten verändern.",
        "Prüfungen, Update-Schlüssel und Governance.",
      ],
      [
        "Externe Daten",
        "Ein falscher Preis oder Status kann korrekte Regeln zu einem falschen Ergebnis führen.",
        "Orakelquelle und Ausfallregeln.",
      ],
      [
        "Abhängigkeiten",
        "Brücken und andere Protokolle verbinden Risiken.",
        "Welche Dienste müssen gleichzeitig funktionieren? ",
      ],
    ],
    chain: [
      ["Externes Ereignis", "Ein Preis oder eine Zahlung wird gemeldet."],
      ["Orakel", "Die Information erreicht den Vertrag."],
      ["Regel", "Der Code führt die definierte Aktion aus."],
      [
        "Ergebnis",
        "Die Aktion kann technisch korrekt sein, obwohl die Eingabe oder der Anspruch problematisch war.",
      ],
    ],
    example: {
      title: "Falscher Preis, richtiger Automat",
      situation:
        "Gedankenbeispiel: Ein Orakel liefert einen falschen Kurs und löst nach den Regeln eine Sicherheitenverwertung aus.",
      explanation:
        "Automatisierung hat das Datenproblem nicht gelöst. Du brauchst neben Codequalität auch Eingabe-, Kontroll- und Ausfallkontext.",
    },
    counterweights: [
      "Eine Codeprüfung reduziert bestimmte Risiken, garantiert aber keine Sicherheit.",
      "Ein sichtbarer Transaktionsverlauf beweist nicht, dass ein physisches Gut vorhanden ist.",
    ],
    takeaway:
      "Frage: Welche Regel, welche Eingabe, welche Kontrolle und welcher Ausfallweg?",
    action:
      "Zeichne die Abhängigkeiten eines Beispiels: Vertrag → Orakel → Verwahrer → Brücke. Markiere Unbekanntes.",
    quiz: {
      question:
        "Kann ein Smart Contract mit falschen externen Daten automatisch falsch handeln?",
      options: [
        "Ja, Automatisierung macht Eingaben nicht automatisch wahr.",
        "Nein, Code weiß alles über die reale Welt.",
        "Ein Orakel ersetzt jede Kontrolle der Datenquelle.",
      ],
      correct: 0,
      explanation:
        "Korrekte Ausführung und korrekte wirtschaftliche Information sind getrennte Voraussetzungen.",
    },
    related: ["blockchain", "defi", "token-rights"],
    terms: ["smart-contract", "oracle", "bridge", "governance"],
    sources: ["fsb-token", "bis-token-summary", "bis-token-continuum"],
  }),
  defineLesson("tokenization", {
    id: "custody",
    title: "Wallet und Verwahrung · Zugang ist nicht gleich Eigentumsrecht",
    subtitle: "Schlüssel, Dienstleister und Wiederherstellung",
    summary:
      "Bei Selbstverwahrung kontrollierst du Schlüssel; bei einem Anbieter hängt dein Zugang auch von dessen Betrieb und Bedingungen ab.",
    context:
      "Eine Wallet verwaltet den technischen Zugriff auf digitale Vermögenswerte. Der private Schlüssel erlaubt relevante Aktionen. Eine Wiederherstellungsphrase kann den Zugriff wiederherstellen; wer sie kennt, kann ihn häufig übernehmen. Das technische Zugangsrecht ersetzt nicht die Rechtsstruktur eines tokenisierten Assets. Ein Verwahrer kann Schlüsselverwaltung erleichtern, bringt aber Anbieterabhängigkeit mit.",
    drivers: [
      [
        "Schlüsselkontrolle",
        "Verlust oder Offenlegung kann den Zugriff oder Bestand gefährden.",
        "Sicherheits- und Wiederherstellungsprozess.",
      ],
      [
        "Anbieterbedingungen",
        "Auszahlungen, Trennung von Vermögen und Ausfallbehandlung unterscheiden sich.",
        "Verwahrvertrag und kontrollierter Ausstieg.",
      ],
      [
        "Transaktionsprüfung",
        "Netzwerk, Adresse und Freigaben müssen zum beabsichtigten Vorgang passen.",
        "Empfänger, Netzwerk und Berechtigungen.",
      ],
    ],
    chain: [
      ["Du willst übertragen", "Die Wallet erstellt einen Vorgang."],
      ["Du signierst", "Der Schlüssel autorisiert ihn."],
      ["Netzwerk verarbeitet", "Die Übertragung kann endgültig werden."],
      [
        "Zugriff und Recht",
        "Technischer Zugang und vertraglicher Anspruch bleiben getrennt zu prüfen.",
      ],
    ],
    example: {
      title: "Support fragt nach der Phrase",
      situation:
        "Gedankenbeispiel: Eine Nachricht behauptet, zur Fehlerbehebung werde deine Wiederherstellungsphrase gebraucht.",
      explanation:
        "Teile sie nicht und gib sie nicht in fremde Webseiten oder Chats ein. Prüfe den Zugang über einen selbst geöffneten offiziellen Weg. Zum Lernen brauchst du keine echten Schlüssel oder Käufe.",
    },
    counterweights: [
      "Selbstverwahrung entfernt Anbieterabhängigkeit teilweise, erhöht aber deine operative Verantwortung.",
      "Ein Anbieter beseitigt technische, rechtliche und Betrugsrisiken nicht vollständig.",
    ],
    takeaway:
      "Entscheide erst nach Verständnis von Zugriff, Wiederherstellung, Rechten und Ausstieg.",
    action:
      "Beschreibe zunächst ohne echtes Geld deinen Wiederherstellungs- und Prüfprozess. Halte private Schlüssel vollständig privat.",
    quiz: {
      question: "Was solltest du mit einer Wiederherstellungsphrase tun?",
      options: [
        "An beliebigen Support schicken.",
        "Geheim halten; sie kann Zugriff auf Vermögen erlauben.",
        "Als Profilbild veröffentlichen.",
      ],
      correct: 1,
      explanation:
        "Die Phrase ist ein Zugangsschlüssel, keine normale Kontoinformation.",
    },
    related: ["token-rights", "smart-contracts", "token-checklist"],
    terms: ["custody", "private-key", "seed-phrase", "settlement"],
    sources: ["sec-custody", "sec-account-security"],
  }),
  defineLesson("tokenization", {
    id: "token-checklist",
    title: "Bringt mir Tokenisierung einen Vorteil?",
    subtitle: "Ein klarer Vergleich statt eines Technikversprechens",
    summary:
      "Bewerte ein Tokenangebot anhand deines Zwecks, des Anspruchs, der Kosten und des realistischen Ausstiegs.",
    context:
      "Ein Nutzen kann kleinerer Mindestbetrag, einfachere Übertragung oder ein Zugang sein, den du sonst nicht bekommst. Manche Vorteile gibt es bereits bei klassischen Produkten. Für dich ist entscheidend, ob der Token einen nachvollziehbaren zusätzlichen Nutzen bietet und welche neuen Abhängigkeiten entstehen. Unklarheit ist ein Grund zum Weiterlernen, nicht zum Überspringen der Prüfung.",
    drivers: [
      [
        "Zweck und Alternative",
        "Ein Produkt ist nur hilfreich, wenn es deinen konkreten Zweck erfüllt.",
        "Welche klassische Alternative löst dasselbe?",
      ],
      [
        "Gesamtkosten",
        "Handel, Verwahrung, Netzwerk, Spread und FX zählen gemeinsam.",
        "Kosten für Einstieg, Halten und Ausstieg.",
      ],
      [
        "Rechte und Handelbarkeit",
        "Eine Übertragungsfunktion beweist weder Käufernächfrage noch Rückzahlungsanspruch.",
        "Vertrag, Käufer, Rücknahme und Fristen.",
      ],
    ],
    chain: [
      [
        "Zweck formulieren",
        "Zum Beispiel ein bestimmtes Zinsportfolio zugänglich machen.",
      ],
      ["Alternativen finden", "Vergleiche denselben wirtschaftlichen Inhalt."],
      ["Rechte/Kosten prüfen", "Notiere Unterschiede und offene Fragen."],
      [
        "Lernentscheidung",
        "Wenn du einen wesentlichen Mechanismus nicht erklären kannst, lerne diesen zuerst.",
      ],
    ],
    example: {
      title: "Kleine Anlage mit vielen Gebühren",
      situation:
        "Gedankenbeispiel: Ein kleiner Betrag verdient wenige Euro erwarteten Jahresertrag. Ein- und Ausstieg sowie Netzwerk kosten zusammen mehr.",
      explanation:
        "Niedrige Mindestbeträge können bequem sein, aber feste Kosten fallen bei kleinen Beträgen stärker ins Gewicht. Rechne in deiner Kontowährung und benutze keine Renditeversprechen als Ersatz für die Rechnung.",
    },
    counterweights: [
      "24/7-Übertragbarkeit bedeutet nicht rund um die Uhr genügend Käufer.",
      "Recht, Kosten und Netzwerke können sich ändern; konkrete Bedingungen müssen aktuell geprüft werden.",
    ],
    takeaway:
      "Ein Vorteil muss konkret, vergleichbar und nach Kosten verständlich sein.",
    action:
      "Nutze fünf Fragen: Zweck? Anspruch? Alternative? Gesamtkosten? Ausstieg? Markiere jede ungeklärte Antwort.",
    quiz: {
      question: "Was ist der beste erste Schritt bei einem neuen Tokenangebot?",
      options: [
        "Zweck und Anspruch verstehen und eine vergleichbare Alternative suchen.",
        "Sofort wegen 24/7 kaufen.",
        "Nur das beworbene APY vergleichen.",
      ],
      correct: 0,
      explanation:
        "Der Vergleich braucht denselben Inhalt und klare Rechte. Erst danach sind Preis und Technik sinnvoll zu bewerten.",
    },
    related: ["tokenization", "token-rights", "token-bonds", "custody"],
    terms: ["spread", "fractionalization", "redemption", "underlying"],
    sources: ["fsb-token", "bis-token-continuum", "sec-token-rights"],
  }),
  defineLesson("tokenization", {
    id: "blockchain",
    title: "Blockchain, Netzwerktoken und tokenisiertes Asset",
    subtitle: "Drei Dinge, die du getrennt verstehen solltest",
    summary:
      "Das Register, sein eigener Token und ein darauf abgebildeter Anspruch haben unterschiedliche Funktionen und Risiken.",
    context:
      "Eine Blockchain ist ein gemeinsam geführtes digitales Register nach bestimmten Regeln. Ein Netzwerktoken kann innerhalb eines Netzwerks Gebühren oder Anreize ermöglichen. Ein tokenisiertes Asset kann dagegen einen Anspruch auf etwas außerhalb des Netzwerks darstellen. Ein wertvolles Gebäude macht den Token eines verwendeten Netzwerks nicht automatisch wertvoll; umgekehrt schafft ein starkes Netzwerk nicht automatisch gute Eigentumsrechte am Gebäude.",
    drivers: [
      [
        "Registerregeln",
        "Zugang, Bestätigung und Änderungsrechte unterscheiden sich je Plattform.",
        "Offenes oder zugangsbeschränktes System.",
      ],
      [
        "Netzwerktoken",
        "Seine Nutzung und Preisbildung können vom abgebildeten Asset unabhängig sein.",
        "Gebührenrolle, Angebot und Nachfrage.",
      ],
      [
        "Externer Anspruch",
        "Der Wert eines tokenisierten Assets hängt an eigenen Rechten und Vermögenswerten.",
        "Vertrag, Emittent und zugrunde liegendes Gut.",
      ],
    ],
    chain: [
      [
        "Ein Asset wird abgebildet",
        "Ein Anbieter führt einen Anspruch im Register.",
      ],
      ["Das Netzwerk verarbeitet", "Es prüft Vorgänge nach seinen Regeln."],
      [
        "Gebühren entstehen",
        "Je System ist eine separate Gebührenwährung nötig.",
      ],
      [
        "Risiken trennen",
        "Assetwert, Netzwerkzugang und Gebührenwährung sind eigene Fragen.",
      ],
    ],
    example: {
      title: "Anleihe auf Netzwerk X",
      situation:
        "Gedankenbeispiel: Eine sichere Emittentin verwendet ein Netzwerk mit schwankender Gebührenwährung.",
      explanation:
        "Der Anleiheanspruch und der Preis der Gebührenwährung sind verschiedene Risiken. Du brauchst keine Annahme, dass beide im Gleichschritt steigen.",
    },
    counterweights: [
      "Nicht jede Tokenplattform braucht einen öffentlich gehandelten Netzwerktoken.",
      "Technische Transparenz ersetzt keine Prüfung von Vermögen außerhalb des Registers.",
    ],
    takeaway: "Trenne Infrastruktur, Netzwerktoken und Anspruch.",
    action:
      "Zeichne drei Kästen für ein Beispiel und schreibe in jeden seine Funktion und seine Abhängigkeit.",
    quiz: {
      question:
        "Steigt ein Netzwerktoken automatisch, wenn eine Anleihe darauf tokenisiert wird?",
      options: [
        "Nein, Nutzung, Gebühren und Preisbildung sind getrennt zu prüfen.",
        "Ja, garantiert im gleichen Umfang.",
        "Nur wenn die Anleihe einen Kupon hat.",
      ],
      correct: 0,
      explanation:
        "Ein Anwendungsfall ist nicht automatisch eine direkte Wertweitergabe an den Netzwerktoken.",
    },
    related: ["tokenization", "smart-contracts", "custody"],
    terms: ["blockchain", "smart-contract", "governance", "underlying"],
    sources: ["bis-token-continuum", "bis-token-summary", "sec-token-rights"],
  }),
  defineLesson("tokenization", {
    id: "defi",
    title: "DeFi und APY · Wo kommt der Ertrag her?",
    subtitle: "Kredit, Gebühren, Anreize und variable Risiken",
    summary:
      "Ein angezeigter Ertrag kann aus Kredit, Handelsgebühren oder Tokenanreizen stammen. Diese Quellen haben andere Risiken.",
    context:
      "DeFi beschreibt Finanzfunktionen, die über programmierte Protokolle organisiert werden. Ein Renditewert auf einer Oberfläche kann variabel sein. APY rechnet Wiederanlage über ein Jahr hinein; APR ist eine andere Zinsdarstellung. Zusätzliche Anreiztoken können den angezeigten Wert erhöhen, ihr eigener Preis kann aber fallen. Die Quelle des Ertrags ist wichtiger als die große Prozentzahl.",
    drivers: [
      [
        "Ertragsquelle",
        "Kreditzinsen, Gebühren und subventionierte Token belohnen unterschiedliche Risiken.",
        "Wer bezahlt welchen Ertrag und warum?",
      ],
      [
        "Sicherheiten und Liquidation",
        "Preisbewegungen und Regeln können automatische Verwertungen auslösen.",
        "Collateral, Schwellen und Preisquelle.",
      ],
      [
        "Protokollabhängigkeiten",
        "Code, Orakel, Verwahrer und Brücken können zusammenwirken.",
        "Kontrollrechte, Audits und Ausfallwege.",
      ],
    ],
    chain: [
      ["Renditeangebot", "Eine Plattform zeigt einen hohen APY."],
      ["Quelle prüfen", "Ein Teil kann aus neu ausgegebenen Token stammen."],
      ["Wert schwankt", "Der Anreiztoken kann an Preis verlieren."],
      [
        "Nettoergebnis",
        "Ertrag, Vermögenspreis und Kosten bestimmen dein Ergebnis.",
      ],
    ],
    example: {
      title: "Hoher APY mit fallendem Anreiztoken",
      situation:
        "Gedankenbeispiel: Die Anzeige berechnet zusätzlichen Ertrag mit dem heutigen Tokenpreis. Dieser Preis sinkt später stark.",
      explanation:
        "Die Anzeige war keine garantierte Auszahlung in Euro. Trenne Tokenmenge, Tokenpreis, variable Zinsen und Gebühren. Verstehe außerdem, ob dein Grundvermögen zusätzliche Risiken eingeht.",
    },
    counterweights: [
      "Audits und hohe Sicherheiten beseitigen nicht jede Ausfallmöglichkeit.",
      "Mehrere verbundene Protokolle können Risiken schwerer überschaubar machen.",
    ],
    takeaway:
      "Frage immer: Wer bezahlt meinen Ertrag, wofür und mit welchem zusätzlichen Risiko?",
    action:
      "Lerne erst Ertragsquelle, Sicherheiten, Orakel und Ausstieg an einem Beispiel ohne echte Einzahlung.",
    quiz: {
      question: "Was sagt ein hoher angezeigter APY allein?",
      options: [
        "Er garantiert deinen Eurogewinn.",
        "Er reicht nicht aus; Quelle, Veränderlichkeit, Preise und Risiken müssen erklärt werden.",
        "Er beseitigt alle Smart-Contract-Risiken.",
      ],
      correct: 1,
      explanation:
        "Ein rechnerischer Ertragswert ist keine Garantie für den späteren Nettoertrag.",
    },
    related: ["smart-contracts", "stablecoins", "risk", "custody"],
    terms: ["apy", "collateral", "oracle", "leverage"],
    sources: ["fsb-token", "bis-token-summary", "sec-crypto-risk"],
  }),
];
