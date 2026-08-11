import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { dateTime, formatMoneyMinor } from "../../lib/utils";
import { api } from "../../services/commands";

export function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["deleted-trades"],
    queryFn: api.deletedTrades,
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: api.restoreTrade,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deleted-trades"] }),
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">Papierkorb</Dialog.Title>
              <div className="dialog-description">
                Gelöschte Trades wiederherstellen. Daten bleiben lokal erhalten.
              </div>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Papierkorb schließen"
              >
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            {query.isLoading ? (
              <PageLoading />
            ) : query.isError ? (
              <ErrorState message="Der Papierkorb konnte nicht geladen werden." />
            ) : !query.data?.length ? (
              <EmptyState
                icon={Trash2}
                title="Papierkorb ist leer"
                description="Gelöschte Trades erscheinen hier und können wiederhergestellt werden."
              />
            ) : (
              <div className="trash-list">
                {query.data.map((trade) => (
                  <div className="trash-row" key={trade.id}>
                    <div className="asset-cell">
                      <span className="asset-icon">
                        {trade.instrument.slice(0, 2)}
                      </span>
                      <div>
                        <strong>{trade.instrument}</strong>
                        <div className="muted">
                          Gelöscht {dateTime(trade.deletedAt)}
                        </div>
                      </div>
                    </div>
                    <Badge
                      className={
                        trade.direction === "long" ? "positive" : "negative"
                      }
                    >
                      {trade.direction.toUpperCase()}
                    </Badge>
                    <strong
                      className={
                        (trade.netPnlMinor ?? 0) >= 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {formatMoneyMinor(trade.netPnlMinor)}
                    </strong>
                    <Button
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(trade.id)}
                    >
                      <RotateCcw size={14} /> Wiederherstellen
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {restore.isError && (
              <div className="form-error">
                {(restore.error as Error)?.message ??
                  "Wiederherstellung fehlgeschlagen."}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
