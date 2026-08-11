import * as Dialog from "@radix-ui/react-dialog";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnOrderState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  ListFilter,
  Plus,
  Save,
  Search,
  TableProperties,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime, formatMoneyMinor, formatR } from "../../lib/utils";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { TradeStatus, TradeSummary } from "../../types/domain";
import { TradeDetailDialog } from "./trade-detail-dialog";
import { TrashDialog } from "./trash-dialog";

const column = createColumnHelper<TradeSummary>();

export function TradesPage() {
  const { setQuickTradeOpen, setGuidedTradeOpen } = useUiStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TradeStatus | "all">("all");
  const [direction, setDirection] = useState<"all" | "long" | "short">("all");
  const [page, setPage] = useState(1);
  const [selectedTrade, setSelectedTrade] = useState<string>();
  useEffect(() => {
    const target = searchParams.get("open");
    if (target) setSelectedTrade(target);
  }, [searchParams]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "closedAt", desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    session: false,
    processScore: false,
  });
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const filter = useMemo(
    () => ({
      search,
      statuses: status === "all" ? undefined : [status],
      directions: direction === "all" ? undefined : [direction],
      page,
      pageSize: 50,
      sortBy: sorting[0]?.id,
      sortDirection: sorting[0]?.desc ? ("desc" as const) : ("asc" as const),
    }),
    [search, status, direction, page, sorting],
  );
  const query = useQuery({
    queryKey: ["trades", filter],
    queryFn: () => api.listTrades(filter),
  });
  const views = useQuery({
    queryKey: ["saved-views", "trades"],
    queryFn: () => api.savedViews("trades"),
  });
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const [bulkTagId, setBulkTagId] = useState("");

  const columns = useMemo(
    () => [
      column.display({
        id: "select",
        header: ({ table }) => (
          <input
            aria-label="Alle sichtbaren Trades auswählen"
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            aria-label={`${row.original.instrument} auswählen`}
            type="checkbox"
            checked={row.getIsSelected()}
            onClick={(event) => event.stopPropagation()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 38,
      }),
      column.accessor("instrument", {
        header: "Asset",
        cell: (info) => (
          <div className="asset-cell">
            <span className="asset-icon">{info.getValue().slice(0, 2)}</span>
            <div>
              <strong>{info.getValue()}</strong>
              <div className="muted" style={{ fontSize: 9 }}>
                {info.row.original.assetClass}
              </div>
            </div>
          </div>
        ),
      }),
      column.accessor("setupName", {
        header: "Setup",
        cell: (info) => info.getValue() ?? "—",
      }),
      column.accessor("direction", {
        header: "Richtung",
        cell: (info) => (
          <Badge
            className={info.getValue() === "long" ? "positive" : "negative"}
          >
            {info.getValue().toUpperCase()}
          </Badge>
        ),
      }),
      column.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge
            className={info.getValue() === "closed" ? "primary" : "neutral"}
          >
            {statusLabel(info.getValue())}
          </Badge>
        ),
      }),
      column.accessor("session", {
        header: "Session",
        cell: (info) => info.getValue() ?? "—",
      }),
      column.accessor("closedAt", {
        header: "Datum",
        cell: (info) => dateTime(info.getValue() ?? info.row.original.openedAt),
      }),
      column.accessor("calculatedR", {
        header: "R",
        cell: (info) => (
          <span
            className={
              (Number(info.getValue()) || 0) >= 0
                ? "positive-text"
                : "negative-text"
            }
          >
            {formatR(info.getValue())}
          </span>
        ),
      }),
      column.accessor("netPnlMinor", {
        header: "Netto-P&L",
        cell: (info) => (
          <strong
            className={
              (info.getValue() ?? 0) >= 0 ? "positive-text" : "negative-text"
            }
          >
            {formatMoneyMinor(info.getValue())}
          </strong>
        ),
      }),
      column.accessor("processScore", {
        header: "Prozess",
        cell: (info) => (info.getValue() ? `${info.getValue()} / 10` : "—"),
      }),
      column.accessor("reviewedAt", {
        header: "Review",
        cell: (info) => (
          <Badge className={info.getValue() ? "positive" : "warning"}>
            {info.getValue() ? "Erledigt" : "Offen"}
          </Badge>
        ),
      }),
    ],
    [],
  );
  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    state: { sorting, columnVisibility, columnOrder, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });
  const selectedIds = Object.entries(rowSelection)
    .filter(([, selected]) => selected)
    .map(([id]) => id);
  const bulk = useMutation({
    mutationFn: async (action: "archive" | "trash" | "tag") => {
      for (const id of selectedIds) {
        if (action === "trash") await api.trashTrade(id);
        else if (action === "archive") {
          const trade = await api.getTrade(id);
          await api.updateTrade(id, { ...trade, status: "archived" });
        } else if (bulkTagId) {
          const context = await api.tradeContext(id);
          await api.saveTradeContext({
            tradeId: id,
            tagIds: [
              ...new Set([...context.tags.map((tag) => tag.id), bulkTagId]),
            ],
            legs: context.legs,
            checklistItems: context.checklistItems.map((item) => ({
              ...item,
              label: item.label ?? item.labelSnapshot ?? "",
            })),
            emotions: context.emotions,
            customValues: context.customValues,
          });
        }
      }
    },
    onSuccess: async (_, action) => {
      const count = selectedIds.length;
      setRowSelection({});
      setBulkTagId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
      toast.success(
        action === "tag"
          ? `Tag zu ${count} Trades hinzugefügt.`
          : `${count} Trades ${action === "trash" ? "in den Papierkorb verschoben" : "archiviert"}.`,
      );
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Sammelaktion fehlgeschlagen."),
  });
  const moveColumn = (id: string, offset: number) => {
    const current = columnOrder.length
      ? columnOrder
      : table.getAllLeafColumns().map((item) => item.id);
    const index = current.indexOf(id);
    const target = Math.max(0, Math.min(current.length - 1, index + offset));
    if (index !== target) setColumnOrder(moveItem(current, index, target));
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Tradingjournal"
        title="Trades"
        description="Durchsuche, filtere und bearbeite alle Journal-Einträge."
        actions={
          <>
            <details className="page-action-menu">
              <summary>Weitere Aktionen</summary>
              <div className="page-action-menu-panel">
                <Button size="sm" onClick={() => setTrashOpen(true)}>
                  <Trash2 size={14} /> Papierkorb
                </Button>
                <Button
                  size="sm"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await api.exportTrades("csv");
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  <Download size={14} />{" "}
                  {exporting ? "Exportiere …" : "Exportieren"}
                </Button>
              </div>
            </details>
            <Button variant="primary" onClick={() => setGuidedTradeOpen(true)}>
              <Plus size={15} /> Geführt erfassen
            </Button>
          </>
        }
      />
      <Card>
        <div className="toolbar">
          <div style={{ position: "relative", minWidth: 270 }}>
            <Search
              size={14}
              className="muted"
              style={{ position: "absolute", left: 11, top: 12 }}
            />
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Instrument oder Setup suchen …"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <select
            className="select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            style={{ width: 145 }}
          >
            <option value="all">Alle Status</option>
            <option value="draft">Entwürfe</option>
            <option value="planned">Geplant</option>
            <option value="open">Offen</option>
            <option value="closed">Geschlossen</option>
            <option value="archived">Archiviert</option>
          </select>
          <select
            className="select"
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value as typeof direction);
              setPage(1);
            }}
            style={{ width: 130 }}
          >
            <option value="all">Long & Short</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          <Button>
            <Filter size={14} /> Mehr Filter
          </Button>
          <select
            className="select"
            aria-label="Gespeicherte Ansicht"
            defaultValue=""
            onChange={(event) => {
              const view = views.data?.find(
                (item) => item.id === event.target.value,
              );
              if (!view) return;
              try {
                const state = JSON.parse(view.stateJson) as {
                  search?: string;
                  status?: typeof status;
                  direction?: typeof direction;
                  sorting?: SortingState;
                  columnVisibility?: VisibilityState;
                  columnOrder?: ColumnOrderState;
                };
                setSearch(state.search ?? "");
                setStatus(state.status ?? "all");
                setDirection(state.direction ?? "all");
                setSorting(state.sorting ?? []);
                setColumnVisibility(state.columnVisibility ?? {});
                setColumnOrder(state.columnOrder ?? []);
                setPage(1);
              } catch {
                toast.error("Ansicht ist beschädigt.");
              }
            }}
            style={{ width: 165 }}
          >
            <option value="">Gespeicherte Ansichten</option>
            {views.data?.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setViewDialogOpen(true)}>
            <Save size={14} /> Ansicht speichern
          </Button>
          <details className="column-menu">
            <summary>
              <Columns3 size={14} /> Spalten
            </summary>
            <div className="column-menu-panel">
              {table
                .getAllLeafColumns()
                .filter((item) => item.getCanHide())
                .map((item) => (
                  <div className="column-menu-row" key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.getIsVisible()}
                        onChange={item.getToggleVisibilityHandler()}
                      />
                      {columnLabel(item.id)}
                    </label>
                    <span>
                      <button
                        type="button"
                        aria-label={`${columnLabel(item.id)} nach links`}
                        onClick={() => moveColumn(item.id, -1)}
                      >
                        <ChevronLeft size={11} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${columnLabel(item.id)} nach rechts`}
                        onClick={() => moveColumn(item.id, 1)}
                      >
                        <ChevronRight size={11} />
                      </button>
                    </span>
                  </div>
                ))}
              <Button
                size="sm"
                onClick={() => {
                  setColumnVisibility({});
                  setColumnOrder([]);
                }}
              >
                Zurücksetzen
              </Button>
            </div>
          </details>
          <div className="toolbar-spacer" />
          {selectedIds.length > 0 && (
            <>
              <Badge className="primary">{selectedIds.length} ausgewählt</Badge>
              <select
                className="select"
                aria-label="Tag für Auswahl"
                value={bulkTagId}
                onChange={(event) => setBulkTagId(event.target.value)}
                style={{ width: 135 }}
              >
                <option value="">Tag wählen</option>
                {bootstrap.data?.tags.map((tag) => (
                  <option value={tag.id} key={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={bulk.isPending || !bulkTagId}
                onClick={() => bulk.mutate("tag")}
              >
                Tag hinzufügen
              </Button>
              <Button
                disabled={bulk.isPending}
                onClick={() => bulk.mutate("archive")}
              >
                <Archive size={13} /> Archivieren
              </Button>
              <Button
                variant="danger"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate("trash")}
              >
                <Trash2 size={13} /> Löschen
              </Button>
            </>
          )}
          <Badge>
            <ListFilter size={11} /> {query.data?.total ?? 0} Einträge
          </Badge>
        </div>
        {(search || status !== "all" || direction !== "all") && (
          <div className="active-filter-row" aria-label="Aktive Filter">
            <span className="muted">Aktiv:</span>
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                Suche: {search} ×
              </button>
            )}
            {status !== "all" && (
              <button type="button" onClick={() => setStatus("all")}>
                Status: {statusLabel(status)} ×
              </button>
            )}
            {direction !== "all" && (
              <button type="button" onClick={() => setDirection("all")}>
                Richtung: {direction.toUpperCase()} ×
              </button>
            )}
          </div>
        )}
        {query.isLoading ? (
          <div style={{ padding: 17 }}>
            <PageLoading />
          </div>
        ) : query.isError ? (
          <ErrorState
            message={
              (query.error as Error)?.message ??
              "Trades konnten nicht geladen werden."
            }
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={TableProperties}
            title="Keine passenden Trades"
            description="Passe die Filter an oder erfasse deinen ersten Trade. Entwürfe, offene und geschlossene Trades werden gemeinsam verwaltet."
            action={
              <Button variant="primary" onClick={() => setQuickTradeOpen(true)}>
                <Plus size={14} /> Trade erfassen
              </Button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          style={{
                            width: header.getSize(),
                            position: "relative",
                          }}
                        >
                          {header.isPlaceholder ? null : (
                            <button
                              className="table-sort"
                              disabled={!header.column.getCanSort()}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {header.column.getIsSorted() === "asc"
                                ? " ↑"
                                : header.column.getIsSorted() === "desc"
                                  ? " ↓"
                                  : ""}
                            </button>
                          )}
                          {header.column.getCanResize() && (
                            <span
                              className={`column-resizer${header.column.getIsResizing() ? " active" : ""}`}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.getIsSelected() ? "selected" : ""}
                      onClick={() => setSelectedTrade(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Seite {query.data.page} von {Math.max(query.data.totalPages, 1)}{" "}
                · {query.data.total} Trades
              </span>
              <div className="page-actions">
                <Button
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  size="icon"
                  disabled={page >= query.data.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
      <TradeDetailDialog
        tradeId={selectedTrade}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTrade(undefined);
            if (searchParams.has("open")) {
              const next = new URLSearchParams(searchParams);
              next.delete("open");
              setSearchParams(next, { replace: true });
            }
          }
        }}
      />
      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} />
      <SaveViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        state={{
          search,
          status,
          direction,
          sorting,
          columnVisibility,
          columnOrder,
        }}
      />
    </div>
  );
}

function statusLabel(status: TradeStatus) {
  return (
    {
      draft: "Entwurf",
      planned: "Geplant",
      open: "Offen",
      closed: "Geschlossen",
      cancelled: "Storniert",
      archived: "Archiviert",
      trashed: "Papierkorb",
    } as const
  )[status];
}

function columnLabel(id: string) {
  return (
    (
      {
        instrument: "Asset",
        setupName: "Setup",
        direction: "Richtung",
        status: "Status",
        session: "Session",
        closedAt: "Datum",
        calculatedR: "R-Multiple",
        netPnlMinor: "Netto-P&L",
        processScore: "Prozess",
        reviewedAt: "Review",
      } as Record<string, string>
    )[id] ?? id
  );
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SaveViewDialog({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: unknown;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api.saveSavedView({
        name,
        scope: "trades",
        stateJson: JSON.stringify(state),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["saved-views", "trades"],
      });
      setName("");
      onOpenChange(false);
      toast.success("Tabellenansicht gespeichert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Ansicht konnte nicht gespeichert werden."),
  });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          aria-describedby="save-view-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                Ansicht speichern
              </Dialog.Title>
              <Dialog.Description
                id="save-view-description"
                className="dialog-description"
              >
                Filter, Sortierung und sichtbare Spalten werden gemeinsam
                gespeichert.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Schließen">
                <X size={16} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <label className="field">
              <span>Name</span>
              <input
                className="input"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="z. B. London-Setups"
              />
            </label>
          </div>
          <footer className="dialog-footer">
            <Dialog.Close asChild>
              <Button>Abbrechen</Button>
            </Dialog.Close>
            <Button
              variant="primary"
              disabled={!name.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Save size={14} /> Speichern
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
