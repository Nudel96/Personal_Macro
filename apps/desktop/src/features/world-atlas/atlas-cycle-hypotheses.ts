/** Curated explanations, never observations, fitted cycles or country forecasts. */
export const cycleSources = {
  nber: {
    author: "NBER · Business Cycle Dating Committee",
    title: "Business Cycle Dating Procedure: Frequently Asked Questions",
    url: "https://www.nber.org/research/business-cycle-dating/business-cycle-dating-procedure-frequently-asked-questions",
    scope:
      "US-Konjunkturdatierung. Das Verfahren betrachtet mehrere Wirtschaftsindikatoren und datiert Wendepunkte rückblickend.",
    locator: "FAQ: Definition, Indikatoren und Zeitpunkt der Datierung",
  },
  bis: {
    author: "Drehmann, Borio und Tsatsaronis (2012)",
    title:
      "Characterising the financial cycle: don't lose sight of the medium term!",
    url: "https://www.bis.org/publ/work380.pdf",
    scope:
      "Quartalsdaten 1960–2011: Australien, Deutschland, Japan, Norwegen, Schweden, Vereinigtes Königreich und USA.",
    locator:
      "BIS Working Paper 380, Abschnitte 1–3; PDF-Seiten 7–10 zur Stichprobe und Filterwahl",
  },
  bernanke: {
    author: "Ben S. Bernanke (1980; veröffentlicht 1983)",
    title: "Irreversibility, Uncertainty, and Cyclical Investment",
    url: "https://www.nber.org/papers/w0502",
    scope:
      "Theoretisches Modell irreversibler Investitionen und neuer Information. Keine gemeinsame Länderreihe und kein geschätzter Infrastrukturkalender.",
    locator: "NBER Working Paper 502, Abstract und Investitionsmodell",
  },
  hall: {
    author: "Bronwyn H. Hall und Beethika Khan (2003)",
    title: "Adoption of New Technology",
    url: "https://www.nber.org/papers/w9730",
    scope:
      "Literaturüberblick zur Einführung und Verbreitung verschiedener Technologien bis 2003; keine einheitliche Länderstichprobe.",
    locator:
      "NBER Working Paper 9730, Einführung und Modellierung der Diffusion",
  },
  kondratieff: {
    author: "Nikolai D. Kondratieff (1935), Übersetzung W. F. Stolper",
    title: "The Long Waves in Economic Life",
    url: "https://www.jstor.org/stable/1928486",
    scope:
      "Vor allem England und Frankreich, ergänzend US-Reihen. Unterschiedliche Preis- und Wirtschaftsreihen vom späten 18. bis ins frühe 20. Jahrhundert.",
    locator:
      "The Review of Economics and Statistics 17(6), 105–115; insbesondere S. 105–106 und 115",
  },
  turchin: {
    author: "Peter Turchin und Sergey A. Nefedov (2009)",
    title: "Secular Cycles · Introduction: The Theoretical Background",
    url: "https://assets.press.princeton.edu/chapters/s8904.pdf",
    scope:
      "Theorie historischer Agrargesellschaften, vor allem west- und mitteleuropäische Beispiele vom Mittelalter bis zur frühen Neuzeit. Keine aktuelle globale Länderprognose.",
    locator:
      "Kapitel 1, S. 3–4, 12 und 21–22: Gegenargumente, abweichende Entwicklungen und fehlende strikte Periodizität",
  },
  hamilton: {
    author: "James D. Hamilton (2017; veröffentlicht 2018)",
    title: "Why You Should Never Use the Hodrick-Prescott Filter",
    url: "https://www.nber.org/papers/w23429",
    scope:
      "Methodische Kritik am HP-Filter: Filterung kann künstliche Dynamik und instabile Randwerte erzeugen. Kein direkter Test aller hier vorgestellten Thesen.",
    locator:
      "NBER Working Paper 23429; Review of Economics and Statistics 100(5), 831–843",
  },
} as const;

export type CycleSourceId = keyof typeof cycleSources;
export type CycleDiagram =
  "wave" | "credit" | "investment" | "diffusion" | "long_wave" | "branches";
export interface CycleContextLink {
  label: string;
  topicId: string;
  seriesId?: string;
  perspective?: string;
}
export interface CycleHypothesis {
  topicId: string;
  kind: string;
  summary: string;
  diagram: CycleDiagram;
  diagramLabel: string;
  sourceIds: CycleSourceId[];
  finding: string;
  limitation: string;
  alternative: string;
  needed: string;
  contextNote: string;
  steps: { id: string; label: string; explanation: string }[];
  context: CycleContextLink[];
}

const investment: CycleContextLink = {
  label: "Bruttoinvestitionen ansehen",
  topicId: "macro:investment",
  seriesId: "worldbank:2:NE.GDI.TOTL.ZS",
  perspective: "worldbank",
};
const prosperity: CycleContextLink = {
  label: "Historischen Wohlstandsverlauf ansehen",
  topicId: "long_history:long_run_prosperity",
};

export const cycleHypotheses: CycleHypothesis[] = [
  {
    topicId: "cycle_hypotheses:business_cycles",
    kind: "Beobachtete Schwankungen",
    summary:
      "Wirtschaftliche Aktivität kann sich ausweiten und zurückgehen. Stärke und Dauer unterscheiden sich von Phase zu Phase.",
    diagram: "wave",
    diagramLabel:
      "Unregelmäßige Auf- und Abbewegung wirtschaftlicher Aktivität",
    sourceIds: ["nber"],
    finding:
      "Das NBER datiert US-Aufschwünge und Rezessionen anhand mehrerer Indikatoren. Eine schwächere Wachstumsrate allein beschreibt noch keine Rezession.",
    limitation:
      "Die Datierung erfolgt rückblickend und gilt für die USA. Das Schema bestimmt keinen heutigen Wendepunkt in einem anderen Land.",
    alternative:
      "Eine Reihe kann langsamer wachsen, ohne zu schrumpfen. Niveau, Wachstumsrate und Abweichung vom Trend beantworten unterschiedliche Fragen.",
    needed:
      "Mehrere reale Aktivitätsreihen, nachvollziehbare Wendepunkte und die jeweilige landesspezifische Datierung.",
    contextNote:
      "Jahreswachstum und Arbeitslosigkeit liefern Kontext. Der Atlas führt damit keine NBER-Datierung durch.",
    steps: [
      {
        id: "recovery",
        label: "Erholung",
        explanation:
          "Nach einer schwachen Phase kann die Aktivität wieder zunehmen. Das frühere Niveau muss dabei noch nicht erreicht sein.",
      },
      {
        id: "expansion",
        label: "Ausweitung",
        explanation:
          "Produktion, Einkommen und Beschäftigung können gemeinsam zulegen. Wie lange das anhält, bleibt offen.",
      },
      {
        id: "contraction",
        label: "Rückgang",
        explanation:
          "Breite wirtschaftliche Aktivität geht zurück. Ein Kurshoch an der Börse ist dafür kein notwendiger Startpunkt.",
      },
      {
        id: "trough",
        label: "Tiefphase",
        explanation:
          "Ein Tiefpunkt wird erst im Rückblick erkennbar. Aus der Form des Bildes folgt kein Datum der Erholung.",
      },
    ],
    context: [
      {
        label: "Reales Jahreswachstum ansehen",
        topicId: "macro:growth",
        seriesId: "worldbank:2:NY.GDP.MKTP.KD.ZG",
        perspective: "worldbank",
      },
      {
        label: "Arbeitslosigkeit ansehen",
        topicId: "labor:unemployment",
        seriesId: "worldbank:2:SL.UEM.TOTL.ZS",
        perspective: "worldbank",
      },
    ],
  },
  {
    topicId: "cycle_hypotheses:financial_cycles",
    kind: "Empirischer Forschungsbefund",
    summary:
      "Kredit und Immobilienpreise können sich über längere Phasen gemeinsam aufbauen und wieder abschwächen.",
    diagram: "credit",
    diagramLabel: "Breite Aufbau- und Abbauphase von Kredit und Immobilien",
    sourceIds: ["bis", "hamilton"],
    finding:
      "Die BIS-Studie findet gemeinsame mittelfristige Bewegungen in Kredit und Wohnimmobilienpreisen. Aktienkurse passen deutlich weniger gut zu diesem Muster.",
    limitation:
      "Die untersuchten sieben Länder und die gewählten Filter begrenzen die Aussage. Das untersuchte Band von 8–30 Jahren ist eine Methodenwahl, kein natürlicher Takt für alle Märkte.",
    alternative:
      "Strukturwandel, Kreditregeln und Trendfilter können das Bild verändern. Hamilton zeigt speziell für den HP-Filter, wie künstliche Dynamik entstehen kann.",
    needed:
      "Passende reale Kredit- und Immobilienreihen, mehrere Methoden und stabile Befunde außerhalb des zur Anpassung verwendeten Zeitraums.",
    contextNote:
      "BIS- und JST-Reihen zeigen Kredit und Immobilien in unterschiedlichen Quellenständen. Die JST-Geschichte endet 2020 und umfasst 18 Länder. Eine gemeinsame automatische Zyklusdatierung ist damit nicht berechnet.",
    steps: [
      {
        id: "build",
        label: "Aufbau",
        explanation:
          "Neue Finanzierung kann Nachfrage und Vermögenspreise stützen.",
      },
      {
        id: "reinforce",
        label: "Verstärkung",
        explanation:
          "Steigende Sicherheitenwerte und zusätzliche Kredite können sich gegenseitig verstärken.",
      },
      {
        id: "strain",
        label: "Anspannung",
        explanation:
          "Die Tragfähigkeit hängt unter anderem von Einkommen, Finanzierungskosten und Kreditbedingungen ab.",
      },
      {
        id: "adjust",
        label: "Anpassung",
        explanation:
          "Kredit und Preise können sich unterschiedlich schnell abschwächen. Eine Krise folgt daraus nicht zwangsläufig.",
      },
    ],
    context: [
      {
        label: "BIS-Kreditwelle über Jahrzehnte ansehen",
        topicId: "long_history:long_run_credit",
        perspective: "credit",
      },
      {
        label: "Finanzgeschichte seit 1870 ansehen",
        topicId: "long_history:financial_history",
      },
      {
        label: "Wohnimmobilien über Jahrzehnte ansehen",
        topicId: "long_history:long_run_housing",
        perspective: "property",
      },
      {
        label: "Reale Wirtschaftsleistung ansehen",
        topicId: "macro:real_output",
        seriesId: "worldbank:2:NY.GDP.MKTP.KD",
        perspective: "worldbank",
      },
    ],
  },
  {
    topicId: "cycle_hypotheses:investment_waves",
    kind: "Erklärungsmodell",
    summary:
      "Investitionen können sich bündeln: Viele Projekte warten zunächst auf Klarheit und werden später umgesetzt.",
    diagram: "investment",
    diagramLabel:
      "Schematischer Investitionsimpuls mit offenem weiteren Verlauf",
    sourceIds: ["bernanke"],
    finding:
      "Bernankes Modell erklärt, weshalb bei schwer rückgängig zu machenden Investitionen das Warten auf neue Information wertvoll sein kann.",
    limitation:
      "Dieser Mechanismus liefert keine feste Länge von Infrastrukturwellen. Aus einer Investitionsspitze folgt auch kein bestimmter Ersatztermin.",
    alternative:
      "Förderpolitik, Bauzeiten, Nachfrage und Finanzierung können Projekte bündeln. Solche Impulse müssen sich nicht regelmäßig wiederholen.",
    needed:
      "Sektorspezifische Investitionen, Projektlaufzeiten und Kapazitätsnutzung; ein breites Wirtschaftsaggregat genügt dafür nicht.",
    contextNote:
      "Bruttoinvestitionen enthalten mehr als Infrastruktur. Der Strommix zeigt eine andere, realwirtschaftliche Perspektive.",
    steps: [
      {
        id: "wait",
        label: "Abwarten",
        explanation:
          "Bei Unsicherheit kann sich eine Entscheidung verschieben, obwohl ein Projekt grundsätzlich möglich ist.",
      },
      {
        id: "decide",
        label: "Entscheiden",
        explanation:
          "Neue Information kann den Ausschlag für oder gegen eine Investition geben.",
      },
      {
        id: "build",
        label: "Umsetzen",
        explanation:
          "Gebündelte Projekte können als Investitionsschub sichtbar werden.",
      },
      {
        id: "use",
        label: "Nutzen",
        explanation:
          "Der geschaffene Bestand kann lange weiterarbeiten. Ein erneuter Schub ist eine offene Möglichkeit.",
      },
    ],
    context: [
      investment,
      { label: "Strommix ansehen", topicId: "electricity:generation_mix" },
    ],
  },
  {
    topicId: "cycle_hypotheses:innovation_waves",
    kind: "Literaturüberblick und Modellbild",
    summary:
      "Neue Technologien können zunächst langsam, dann schneller und schließlich mit abnehmendem Tempo verbreitet werden.",
    diagram: "diffusion",
    diagramLabel: "Schematische S-Kurve der Verbreitung einer Technologie",
    sourceIds: ["hall"],
    finding:
      "Hall und Khan beschreiben Technologieverbreitung als Ergebnis vieler Einführungsentscheidungen unter unsicheren Kosten und Nutzen.",
    limitation:
      "Eine S-Kurve der Verbreitung ist kein Beleg für regelmäßig wiederkehrende Innovations- oder Börsenzyklen.",
    alternative:
      "Technologien können sich unterschiedlich schnell verbreiten, ersetzt werden oder in einer Nische bleiben. Verbreitung und Gewinnentwicklung sind verschiedene Größen.",
    needed:
      "Eine klar definierte Technologie, vergleichbare Nutzungsdaten sowie getrennte Informationen zu Kosten, Wettbewerb und wirtschaftlichen Erträgen.",
    contextNote:
      "Internetnutzung und Forschungsausgaben veranschaulichen verschiedene Aspekte. Sie bewerten weder KI noch Wasserstoffunternehmen.",
    steps: [
      {
        id: "pioneer",
        label: "Erproben",
        explanation:
          "Wenige Anwender sammeln erste Erfahrungen. Nutzen und Kosten sind oft noch unsicher.",
      },
      {
        id: "spread",
        label: "Verbreiten",
        explanation:
          "Erfahrungen, Verfügbarkeit und ergänzende Infrastruktur können weitere Einführung ermöglichen.",
      },
      {
        id: "broaden",
        label: "Breit nutzen",
        explanation:
          "Mehr Anwender nutzen die Technologie. Daraus lässt sich kein Börsenwert direkt ableiten.",
      },
      {
        id: "mature",
        label: "Reifen",
        explanation:
          "Die Verbreitung kann sich einem Plateau nähern. Eine neue Technologie kann einen eigenen Verlauf beginnen.",
      },
    ],
    context: [
      {
        label: "Internetnutzung ansehen",
        topicId: "digital:internet",
        seriesId: "worldbank:2:IT.NET.USER.ZS",
        perspective: "worldbank",
      },
      {
        label: "Forschungsausgaben ansehen",
        topicId: "innovation:research_spending",
        seriesId: "worldbank:2:GB.XPD.RSDV.GD.ZS",
        perspective: "worldbank",
      },
    ],
  },
  {
    topicId: "cycle_hypotheses:kondratiev",
    kind: "Historische Hypothese",
    summary:
      "Kondratieff deutete lange Bewegungen historischer Wirtschaftsreihen als Wellen über mehrere Jahrzehnte.",
    diagram: "long_wave",
    diagramLabel: "Frei gezeichnete lange Welle als historische Hypothese",
    sourceIds: ["kondratieff", "hamilton"],
    finding:
      "Die Veröffentlichung von 1935 schlägt ungefähr fünfzigjährige Wellen vor. Die damalige Datenbasis war begrenzt; Trendbereinigung und Glättung gehörten zur Untersuchung.",
    limitation:
      "Die These liefert hier keinen geprüften Kalender für heutige Länder oder Sektoren. Das Bild ist keine aus aktuellen Daten geschätzte Welle.",
    alternative:
      "Ähnliche Bögen können durch historische Brüche oder Aufbereitung entstehen. Hamiltons Filterkritik ist ein methodischer Prüfhinweis und widerlegt diese historische These nicht für sich allein.",
    needed:
      "Mehrere unabhängige Wiederholungen, alternative Trendmodelle und Vergleiche mit nichtzyklischen Prozessen; Prüfung vieler Perioden muss berücksichtigt werden.",
    contextNote:
      "Lange Wirtschaftsreihen ermöglichen eigene Beobachtung. Weder ihre Länge noch optisch ähnliche Abschnitte bestätigen die Hypothese.",
    steps: [
      {
        id: "rise",
        label: "Anstieg",
        explanation:
          "In der Modellvorstellung beginnt ein breiter Aufwärtsbogen.",
      },
      {
        id: "crest",
        label: "Hochphase",
        explanation:
          "Der gezeichnete Bogen erreicht ein Hoch. Dies ist kein gegenwärtiges Markthoch.",
      },
      {
        id: "fall",
        label: "Abstieg",
        explanation:
          "Die Modellvorstellung beschreibt einen langen Rückgang. Seine Dauer ist hier nicht datiert.",
      },
      {
        id: "open",
        label: "Offener Verlauf",
        explanation:
          "Eine erneute Aufwärtsbewegung ist Teil der Hypothese und keine zugesicherte Zukunft.",
      },
    ],
    context: [prosperity, investment],
  },
  {
    topicId: "cycle_hypotheses:secular_cycles",
    kind: "Historische Theorie",
    summary:
      "Säkulare Theorien untersuchen, wie Bevölkerung, Ressourcen, Machtverteilung und staatliche Strukturen über Generationen zusammenwirken.",
    diagram: "branches",
    diagramLabel:
      "Mehrere mögliche gesellschaftliche Entwicklungen statt eines festen Kreislaufs",
    sourceIds: ["turchin"],
    finding:
      "Turchin und Nefedov verbinden demografische und gesellschaftliche Mechanismen. Sie betonen selbst, dass die beschriebenen Entwicklungen nicht streng periodisch sind.",
    limitation:
      "Historische Agrargesellschaften sind kein direktes Modell heutiger Länder. Das Kapitel beschreibt abweichende Entwicklungen unter ähnlichen Ausgangsbedingungen.",
    alternative:
      "Institutionen, technische Veränderungen, äußere Ereignisse und menschliche Entscheidungen können den Verlauf ändern. Bevölkerung allein erklärt ihn nicht.",
    needed:
      "Historisch passende Begriffe, unabhängige Fallvergleiche und eine ausdrückliche Prüfung, ob ein Mechanismus auf die betrachtete Gesellschaft übertragbar ist.",
    contextNote:
      "Altersstruktur und Wirtschaftsgewichte sind Kontextbilder. Sie messen weder gesellschaftliches Schicksal noch eine aktuelle Jahrhundertphase.",
    steps: [
      {
        id: "conditions",
        label: "Ausgangslage",
        explanation:
          "Bevölkerung, Ressourcen und Institutionen bilden eine bestimmte historische Ausgangslage.",
      },
      {
        id: "interaction",
        label: "Wechselwirkung",
        explanation:
          "Veränderungen können einander verstärken oder abschwächen. Mehrere Ursachen wirken zusammen.",
      },
      {
        id: "choices",
        label: "Mögliche Wege",
        explanation:
          "Anpassung, Stabilisierung oder weitere Anspannung sind unterschiedliche mögliche Verläufe.",
      },
      {
        id: "outcomes",
        label: "Neue Lage",
        explanation:
          "Entscheidungen und Ereignisse verändern die Ausgangslage. Ein neuer identischer Kreislauf ist nicht vorgeschrieben.",
      },
    ],
    context: [
      { label: "Altersstruktur ansehen", topicId: "demography:age_structure" },
      {
        label: "Historische Wirtschaftsgewichte ansehen",
        topicId: "structural_change:global_economic_weights",
      },
    ],
  },
];

export const cycleHypothesis = (topicId: string | null) =>
  cycleHypotheses.find((item) => item.topicId === topicId);

export function cycleContextTarget(
  hypothesis: CycleHypothesis,
  context: CycleContextLink,
  stepId: string,
): Record<string, string> {
  return {
    view: "",
    topic: context.topicId,
    series: context.seriesId ?? "",
    perspective: context.perspective ?? "",
    proxy: "",
    fromCycle: hypothesis.topicId,
    hypothesis: hypothesis.topicId,
    cycleStep: stepId,
  };
}
