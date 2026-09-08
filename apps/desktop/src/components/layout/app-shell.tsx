import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Goal,
  Image,
  Keyboard,
  Menu,
  NotebookPen,
  Plus,
  Search,
  Settings,
  TableProperties,
  Target,
} from "lucide-react";
import { Suspense, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, isTauri } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import { Button } from "../ui/button";
import { CommandPalette } from "./command-palette";
import { MarketContextNavigation } from "./market-context-navigation";
import { QuickTradeDialog } from "../../features/trades/quick-trade-dialog";
import { GuidedTradeDialog } from "../../features/trades/guided-trade-dialog";
import { PageLoading } from "../ui/loading";

const journalNav = [
  { label: "Übersicht", path: "/", icon: BarChart3 },
  { label: "Trades", path: "/trades", icon: TableProperties },
  { label: "Kalender", path: "/calendar", icon: CalendarDays },
  { label: "Analytics", path: "/analytics", icon: ChartNoAxesCombined },
  { label: "Reviews", path: "/reviews", icon: NotebookPen },
  { label: "Playbook", path: "/playbook", icon: BookOpenCheck },
  { label: "Fehleranalyse", path: "/mistakes", icon: Target },
  { label: "Medien", path: "/media", icon: Image },
  { label: "Ziele", path: "/goals", icon: Goal },
];

const dataNav = [
  { label: "Import & Export", path: "/import-export", icon: FileUp },
  { label: "Einstellungen", path: "/settings", icon: Settings },
];

const researchNav = [
  {
    label: "Put/Call Ratio",
    path: "/put-call-ratio",
    icon: ChartNoAxesCombined,
  },
];

function NavGroup({
  label,
  items,
}: {
  label: string;
  items: typeof journalNav;
}) {
  return (
    <nav className="nav-group" aria-label={label}>
      <div className="nav-label">{label}</div>
      {items.map(({ label: itemLabel, path, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === "/"}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          title={itemLabel}
        >
          <Icon size={18} strokeWidth={1.8} />
          <span>{itemLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function ResearchNavigation() {
  return <NavGroup label="Research" items={researchNav} />;
}

const titles: Record<string, string> = {
  "/": "Übersicht",
  "/trades": "Trades",
  "/calendar": "Kalender",
  "/analytics": "Analytics",
  "/reviews": "Reviews",
  "/playbook": "Playbook",
  "/mistakes": "Fehleranalyse",
  "/media": "Medien",
  "/goals": "Ziele",
  "/macro": "Macro Heatmap",
  "/regime-insights": "Regime Insights",
  "/economic-data": "Wirtschaftsdaten",
  "/economic-calendar": "Wirtschaftskalender",
  "/cot": "COT Analyse",
  "/seasonality": "Seasonality",
  "/rates": "Leitzinsen",
  "/central-bank-reports": "Zentralbank-Briefings",
  "/put-call-ratio": "Put/Call Ratio",
  "/import-export": "Import & Export",
  "/settings": "Einstellungen",
};

export function AppShell() {
  const location = useLocation();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const appearance = settings.data?.settings.appearance as
    { density?: string } | undefined;
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const { sidebarCollapsed, toggleSidebar, setCommandOpen, setQuickTradeOpen } =
    useUiStore();

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setQuickTradeOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [setCommandOpen, setQuickTradeOpen]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.title = `${titles[location.pathname] ?? "Workspace"} · Personal Macro`;
    const activeItem =
      sidebarScrollRef.current?.querySelector(".nav-item.active");
    activeItem?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [location.pathname]);

  const title = titles[location.pathname] ?? "Personal Macro";
  return (
    <div
      className="app-shell"
      data-page={location.pathname.slice(1) || "dashboard"}
      data-density={
        appearance?.density === "comfortable" ? "comfortable" : "compact"
      }
    >
      <a className="skip-link" href="#workspace-content">
        Zum Seiteninhalt
      </a>
      <aside className={`sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}>
        <div className="brand">
          <img
            className="brand-mark"
            src="/branding/personal-macro-logo.png"
            alt="Personal Macro"
          />
          <div className="brand-copy">
            <div className="brand-title">Personal Macro</div>
            <div className="brand-subtitle">Trading Workspace</div>
          </div>
        </div>
        <button
          className="sidebar-collapse"
          onClick={toggleSidebar}
          aria-label={
            sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"
          }
        >
          {sidebarCollapsed ? (
            <ChevronRight size={13} />
          ) : (
            <ChevronLeft size={13} />
          )}
        </button>
        <div
          className="sidebar-scroll"
          id="workspace-navigation"
          ref={sidebarScrollRef}
        >
          <NavGroup label="Tradingjournal" items={journalNav} />
          <MarketContextNavigation />
          <ResearchNavigation />
          <NavGroup label="Daten & System" items={dataNav} />
        </div>
        <div className="sidebar-footer">
          <div
            className="storage-card"
            title={isTauri() ? "SQLite verbunden" : "Browser-Vorschaumodus"}
          >
            <span className={`storage-dot${isTauri() ? "" : " preview"}`} />
            <div className="storage-copy">
              {isTauri() ? "Lokal verbunden" : "Browser-Vorschau"}
              <small>
                {isTauri()
                  ? "Daten auf diesem Gerät"
                  : "Im Browser gespeichert"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleSidebar}
              aria-label="Menü"
              aria-expanded={!sidebarCollapsed}
              aria-controls="workspace-navigation"
            >
              <Menu size={17} />
            </Button>
            <div className="breadcrumbs">
              <img
                className="topbar-logo"
                src="/branding/personal-macro-logo.png"
                alt=""
              />
              Personal Macro&nbsp; / &nbsp;<strong>{title}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setCommandOpen(true)}
              aria-label="Suchen oder Aktion starten, Ctrl K"
            >
              <Search size={15} /> Suchen oder Aktion starten <kbd>Strg K</kbd>
            </button>
            <Button
              size="icon"
              variant="ghost"
              title="Tastaturbefehle"
              aria-label="Tastaturbefehle"
              onClick={() => setCommandOpen(true)}
            >
              <Keyboard size={16} />
            </Button>
            <Button variant="primary" onClick={() => setQuickTradeOpen(true)}>
              <Plus size={16} /> Trade hinzufügen
            </Button>
          </div>
        </header>
        <div id="workspace-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="page">
                <PageLoading />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
      <CommandPalette />
      <QuickTradeDialog />
      <GuidedTradeDialog />
    </div>
  );
}
