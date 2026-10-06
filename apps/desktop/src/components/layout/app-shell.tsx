import {
  BarChart3,
  BookOpen,
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
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { canUseWorkspaceRoute } from "../../app/workspace-capabilities";
import { useUiStore } from "../../stores/ui-store";
import { Button } from "../ui/button";
import { CommandPalette } from "./command-palette";
import { MarketContextNavigation } from "./market-context-navigation";
import { QuickTradeDialog } from "../../features/trades/quick-trade-dialog";
import { GuidedTradeDialog } from "../../features/trades/guided-trade-dialog";
import { JournalAccountBar } from "../../features/accounts/journal-account-bar";
import { PageLoading } from "../ui/loading";
import { useMobileNavigation } from "./use-mobile-navigation";
import "../../styles/mobile.css";

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

const learningNav = [{ label: "Learning", path: "/learning", icon: BookOpen }];

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
  "/learning": "Learning",
  "/macro": "Macro Heatmap",
  "/world-atlas": "Weltatlas",
  "/weather": "Wetter & Rohstoffe",
  "/regime-insights": "Regime Insights",
  "/economic-data": "Wirtschaftsdaten",
  "/economic-calendar": "Wirtschaftskalender",
  "/cot": "COT Analyse",
  "/seasonality": "Seasonality",
  "/rates": "Leitzinsen",
  "/government-bonds": "Staatsanleihen & Yields",
  "/central-bank-reports": "Zentralbank-Briefings",
  "/import-export": "Import & Export",
  "/settings": "Einstellungen",
};

export function AppShell() {
  const privateWeb = isPrivateWeb();
  const location = useLocation();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const appearance = settings.data?.settings.appearance as
    { density?: string } | undefined;
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobileNavigation();
  const [navigationLocation, setNavigationLocation] = useState<string | null>(
    null,
  );
  const navigationOpen = isMobile && navigationLocation === location.key;
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
  const journalPage =
    journalNav.some((item) => item.path === location.pathname) ||
    location.pathname === "/settings" ||
    location.pathname === "/import-export";
  const navigation = (
    <>
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
      {isMobile ? (
        <Dialog.Close asChild>
          <Button
            className="mobile-navigation-close"
            size="icon"
            variant="ghost"
            aria-label="Menü schließen"
          >
            <X size={20} />
          </Button>
        </Dialog.Close>
      ) : (
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
      )}
      <div
        className="sidebar-scroll"
        id="workspace-navigation"
        ref={sidebarScrollRef}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a[href]")
          ) {
            setNavigationLocation(null);
          }
        }}
      >
        <NavGroup
          label="Tradingjournal"
          items={journalNav.filter((item) => canUseWorkspaceRoute(item.path))}
        />
        <NavGroup
          label="Lernen"
          items={learningNav.filter((item) => canUseWorkspaceRoute(item.path))}
        />
        <MarketContextNavigation />
        <NavGroup
          label="Daten & System"
          items={dataNav.filter((item) => canUseWorkspaceRoute(item.path))}
        />
      </div>
      <div className="sidebar-footer">
        <div
          className="storage-card"
          title={
            privateWeb
              ? "Private Cloudverbindung"
              : isTauri()
                ? "SQLite verbunden"
                : "Browser-Vorschaumodus"
          }
        >
          <span
            className={`storage-dot${privateWeb || isTauri() ? "" : " preview"}`}
          />
          <div className="storage-copy">
            {privateWeb
              ? "Privat verbunden"
              : isTauri()
                ? "Lokal verbunden"
                : "Browser-Vorschau"}
            <small>
              {privateWeb
                ? "Dauerhafter Cloudspeicher"
                : isTauri()
                  ? "Daten auf diesem Gerät"
                  : "Im Browser gespeichert"}
            </small>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <Dialog.Root
      open={navigationOpen}
      onOpenChange={(open) => setNavigationLocation(open ? location.key : null)}
    >
      <div
        className="app-shell"
        data-page={location.pathname.slice(1) || "dashboard"}
        data-journal={journalPage}
        data-density={
          appearance?.density === "comfortable" ? "comfortable" : "compact"
        }
      >
        <a className="skip-link" href="#workspace-content">
          Zum Seiteninhalt
        </a>
        {isMobile ? (
          <Dialog.Portal>
            <Dialog.Overlay className="mobile-navigation-overlay" />
            <Dialog.Content
              className="sidebar mobile-sidebar"
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              {navigation}
            </Dialog.Content>
          </Dialog.Portal>
        ) : (
          <aside
            className={`sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
          >
            {navigation}
          </aside>
        )}
        <main className="app-main">
          <header className="topbar">
            <div className="topbar-left">
              {isMobile ? (
                <Dialog.Trigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Menü öffnen">
                    <Menu size={20} />
                  </Button>
                </Dialog.Trigger>
              ) : (
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
              )}
              <div className="breadcrumbs">
                <img
                  className="topbar-logo"
                  src="/branding/personal-macro-logo.png"
                  alt=""
                />
                <span className="breadcrumb-brand">
                  Personal Macro&nbsp; / &nbsp;
                </span>
                <strong>{title}</strong>
              </div>
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                onClick={() => setCommandOpen(true)}
                aria-label="Suchen oder Aktion starten, Ctrl K"
              >
                <Search size={17} />
                <span className="search-trigger-copy">
                  Suchen oder Aktion starten
                </span>{" "}
                <kbd>Strg K</kbd>
              </button>
              <Button
                size="icon"
                variant="ghost"
                title="Tastaturbefehle"
                aria-label="Tastaturbefehle"
                className="keyboard-shortcut-trigger"
                onClick={() => setCommandOpen(true)}
              >
                <Keyboard size={16} />
              </Button>
              <Button
                variant="primary"
                className="topbar-add-trade"
                aria-label="Trade hinzufügen"
                onClick={() => setQuickTradeOpen(true)}
              >
                <Plus size={18} />
                <span>Trade hinzufügen</span>
              </Button>
            </div>
          </header>
          {journalPage && <JournalAccountBar />}
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
    </Dialog.Root>
  );
}
