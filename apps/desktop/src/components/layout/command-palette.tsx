import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesCombined,
  CirclePercent,
  FileUp,
  Goal,
  Grid3X3,
  Image,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Scale,
  Shapes,
  Sparkles,
  TableProperties,
  Target,
  Landmark,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import { useJournalAccount } from "../../features/accounts/journal-account-context";
import { Button } from "../ui/button";

const commands = [
  { label: "Übersicht öffnen", path: "/", icon: BarChart3 },
  { label: "Trades anzeigen", path: "/trades", icon: TableProperties },
  { label: "Kalender öffnen", path: "/calendar", icon: CalendarDays },
  { label: "Analytics öffnen", path: "/analytics", icon: ChartNoAxesCombined },
  { label: "Reviews öffnen", path: "/reviews", icon: NotebookPen },
  { label: "Playbook öffnen", path: "/playbook", icon: BookOpenCheck },
  { label: "Fehleranalyse öffnen", path: "/mistakes", icon: Target },
  { label: "Medien öffnen", path: "/media", icon: Image },
  { label: "Ziele öffnen", path: "/goals", icon: Goal },
  { label: "Macro Heatmap öffnen", path: "/macro", icon: Grid3X3 },
  {
    label: "Regime Insights öffnen",
    path: "/regime-insights",
    icon: Scale,
  },
  {
    label: "Wirtschaftskalender öffnen",
    path: "/economic-calendar",
    icon: CalendarDays,
  },
  { label: "Wirtschaftsdaten öffnen", path: "/economic-data", icon: BarChart3 },
  { label: "COT Analyse öffnen", path: "/cot", icon: ChartNoAxesCombined },
  { label: "Seasonality öffnen", path: "/seasonality", icon: Sparkles },
  { label: "Leitzinsen öffnen", path: "/rates", icon: CirclePercent },
  {
    label: "Zentralbank-Briefings öffnen",
    path: "/central-bank-reports",
    icon: Landmark,
  },
  {
    label: "Put/Call Ratio öffnen",
    path: "/put-call-ratio",
    icon: ChartNoAxesCombined,
  },
  { label: "Import & Export öffnen", path: "/import-export", icon: FileUp },
  { label: "Einstellungen öffnen", path: "/settings", icon: Settings },
];

export function CommandPalette() {
  const navigate = useNavigate();
  const { commandOpen, setCommandOpen, setQuickTradeOpen } = useUiStore();
  const { status: journalAccountStatus, selectedAccountId } =
    useJournalAccount();
  const journalReady =
    journalAccountStatus === "ready" && selectedAccountId !== null;
  const [search, setSearch] = useState("");
  const trades = useQuery({
    queryKey: ["global-search", selectedAccountId, search],
    queryFn: () => api.listTrades(selectedAccountId!, { search, pageSize: 10 }),
    enabled: journalReady && commandOpen && search.trim().length >= 2,
  });
  const run = (action: () => void) => {
    setCommandOpen(false);
    action();
  };
  return (
    <Dialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content command-content"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Befehlspalette</Dialog.Title>
          <Command>
            <div className="command-input-wrap">
              <Search size={18} className="muted" />
              <Command.Input
                className="command-input"
                placeholder="Seite oder Aktion suchen …"
                autoFocus
                value={search}
                onValueChange={setSearch}
              />
              <Dialog.Close asChild>
                <Button size="icon" variant="ghost" aria-label="Schließen">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
            <Command.List className="command-list">
              <Command.Empty className="empty-copy">
                Keine passende Aktion gefunden.
              </Command.Empty>
              <Command.Group className="command-group" heading="Aktionen">
                <Command.Item
                  className="command-item"
                  disabled={!journalReady}
                  onSelect={() => run(() => setQuickTradeOpen(true))}
                >
                  <Plus size={17} />
                  {journalReady
                    ? "Trade hinzufügen"
                    : "Zum Erfassen zuerst Konto wählen"}
                  <kbd>Strg + N</kbd>
                </Command.Item>
              </Command.Group>
              <Command.Group className="command-group" heading="Navigation">
                {commands.map(({ label, path, icon: Icon }) => (
                  <Command.Item
                    className="command-item"
                    key={path}
                    onSelect={() => run(() => navigate(path))}
                  >
                    <Icon size={17} /> {label}
                  </Command.Item>
                ))}
              </Command.Group>
              {trades.data?.items.length ? (
                <Command.Group className="command-group" heading="Trades">
                  <>
                    {trades.data.items.map((trade) => (
                      <Command.Item
                        className="command-item"
                        key={trade.id}
                        value={`${trade.instrument} ${trade.setupName ?? ""} ${trade.id}`}
                        onSelect={() =>
                          run(() =>
                            navigate(
                              `/trades?open=${encodeURIComponent(trade.id)}`,
                            ),
                          )
                        }
                      >
                        <span className="asset-icon">
                          {trade.instrument.slice(0, 2)}
                        </span>
                        <span>
                          {trade.instrument}
                          <small>
                            {trade.setupName ?? trade.assetClass} ·{" "}
                            {trade.direction.toUpperCase()}
                          </small>
                        </span>
                      </Command.Item>
                    ))}
                  </>
                </Command.Group>
              ) : null}
              <Command.Group className="command-group" heading="Werkzeuge">
                <Command.Item
                  className="command-item"
                  onSelect={() => run(() => navigate("/playbook"))}
                >
                  <Shapes size={17} /> Neues Setup anlegen
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="command-footer">
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> Auswählen
              </span>
              <span>
                <kbd>Enter</kbd> Öffnen
              </span>
              <span>
                <kbd>Esc</kbd> Schließen
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
