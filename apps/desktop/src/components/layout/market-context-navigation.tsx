import {
  Activity,
  BarChart3,
  CalendarDays,
  ChartNoAxesCombined,
  CirclePercent,
  Landmark,
  Grid3X3,
  Scale,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";

type MarketContextItem = {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  accent: "blue" | "cyan" | "violet" | "indigo" | "amber";
};

const analysisItems: MarketContextItem[] = [
  {
    label: "Macro Heatmap",
    description: "Pair-Matrix",
    path: "/macro",
    icon: Grid3X3,
    accent: "blue",
  },
  {
    label: "Regime Insights",
    description: "China CPI × AUDUSD",
    path: "/regime-insights",
    icon: Scale,
    accent: "cyan",
  },
];

const dataItems: MarketContextItem[] = [
  {
    label: "Wirtschaftskalender",
    description: "Releases & Termine",
    path: "/economic-calendar",
    icon: CalendarDays,
    accent: "blue",
  },
  {
    label: "Wirtschaftsdaten",
    description: "Actual · Forecast · Previous",
    path: "/economic-data",
    icon: BarChart3,
    accent: "cyan",
  },
  {
    label: "COT Analyse",
    description: "Institutionelle Positionierung",
    path: "/cot",
    icon: ChartNoAxesCombined,
    accent: "violet",
  },
  {
    label: "Seasonality",
    description: "Saisonale Muster & Zyklen",
    path: "/seasonality",
    icon: Sparkles,
    accent: "indigo",
  },
  {
    label: "Leitzinsen",
    description: "Policy-Pfade & Differenzen",
    path: "/rates",
    icon: CirclePercent,
    accent: "amber",
  },
  {
    label: "Zentralbank-Briefings",
    description: "Entscheidungen & Reports",
    path: "/central-bank-reports",
    icon: Landmark,
    accent: "violet",
  },
];

function AnalysisLink({ item }: { item: MarketContextItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        `nav-item context-nav-analysis${isActive ? " active" : ""}`
      }
      data-accent={item.accent}
      title={`${item.label} – ${item.description}`}
    >
      <span className="context-nav-analysis-icon" aria-hidden="true">
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <span className="context-nav-analysis-copy">
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
    </NavLink>
  );
}

function DataLink({ item }: { item: MarketContextItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        `nav-item context-nav-module${isActive ? " active" : ""}`
      }
      data-accent={item.accent}
      title={`${item.label} – ${item.description}`}
    >
      <span className="context-nav-module-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <span className="context-nav-module-copy">
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
      <span className="context-nav-module-state" aria-hidden="true" />
    </NavLink>
  );
}

export function MarketContextNavigation() {
  return (
    <nav
      className="nav-group market-context-nav"
      aria-labelledby="market-context-navigation-title"
    >
      <div className="market-context-nav-header">
        <span className="market-context-nav-mark" aria-hidden="true">
          <Activity size={16} strokeWidth={1.8} />
        </span>
        <span className="market-context-nav-heading">
          <strong id="market-context-navigation-title">Marktkontext</strong>
          <small>Signal Research</small>
        </span>
        <span
          className="market-context-nav-count"
          title="8 verknüpfte Ansichten"
          aria-hidden="true"
        >
          8
        </span>
      </div>

      <div className="market-context-nav-analysis" aria-label="Kernanalysen">
        {analysisItems.map((item) => (
          <AnalysisLink item={item} key={item.path} />
        ))}
      </div>

      <div className="market-context-nav-divider" aria-hidden="true">
        <span>Datenmodule</span>
        <small>6 Quellenmodule</small>
      </div>

      <div className="market-context-nav-modules" aria-label="Datenmodule">
        {dataItems.map((item) => (
          <DataLink item={item} key={item.path} />
        ))}
      </div>
    </nav>
  );
}
