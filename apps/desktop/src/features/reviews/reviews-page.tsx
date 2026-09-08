import { NotebookPen as PageIcon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FileText,
  NotebookPen,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { JournalPageHeader } from "../../components/ui/journal-page-header";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { formatMoneyMinor, formatR, localDate } from "../../lib/utils";
import { api } from "../../services/commands";
import type { ReviewInput, ReviewRecord } from "../../types/domain";
import { JournalAccountGate } from "../accounts/journal-account-gate";
import { useJournalAccount } from "../accounts/journal-account-context";
import { WorkspaceSummary } from "../../components/ui/workspace-summary";
import { useDialogFocus } from "../../components/ui/use-dialog-focus";

export function ReviewsPage() {
  const { selectedAccountId, status } = useJournalAccount();
  const ready = status === "ready" && selectedAccountId !== null;
  const query = useQuery({
    queryKey: ["reviews", selectedAccountId],
    queryFn: () => api.reviews(selectedAccountId!),
    enabled: ready,
  });
  const [open, setOpen] = useState(false);
  const { rememberFocus, restoreFocus } = useDialogFocus();
  const [selected, setSelected] = useState<ReviewRecord>();
  const [dialogAccountId, setDialogAccountId] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setSelected(undefined);
    setDialogAccountId(null);
  }, [selectedAccountId]);

  const openReview = (review?: ReviewRecord) => {
    if (!ready || !selectedAccountId) return;
    rememberFocus();
    setSelected(review);
    setDialogAccountId(selectedAccountId);
    setOpen(true);
  };

  return (
    <div className="page reviews-page">
      <JournalPageHeader
        icon={PageIcon}
        eyebrow="Prozess"
        title="Reviews"
        description="Tages-, Wochen- und Monatsreflexionen mit eingefrorenem Kennzahlen-Snapshot."
        actions={
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => openReview()}
          >
            <Plus size={15} /> Review starten
          </Button>
        }
      />
      <JournalAccountGate>
        {query.isLoading ? (
          <PageLoading />
        ) : query.isError ? (
          <ErrorState message="Reviews konnten nicht geladen werden." />
        ) : (
          <>
            <WorkspaceSummary
              items={[
                {
                  label: "Reviews",
                  value: query.data?.length ?? 0,
                  detail: "Reflexionen im ausgewählten Konto",
                },
                {
                  label: "Abgeschlossen",
                  value:
                    query.data?.filter(
                      (review) => review.status === "completed",
                    ).length ?? 0,
                  detail: "Mit festgehaltenen Erkenntnissen",
                },
                {
                  label: "Entwürfe",
                  value:
                    query.data?.filter(
                      (review) => review.status !== "completed",
                    ).length ?? 0,
                  detail: "Zur weiteren Bearbeitung",
                },
              ]}
            />
            <Tabs.Root defaultValue="all">
              <Tabs.List
                className="segmented"
                style={{ width: "fit-content", marginBottom: 14 }}
              >
                <Tabs.Trigger value="all" asChild>
                  <button>Alle</button>
                </Tabs.Trigger>
                <Tabs.Trigger value="daily" asChild>
                  <button>Täglich</button>
                </Tabs.Trigger>
                <Tabs.Trigger value="weekly" asChild>
                  <button>Wöchentlich</button>
                </Tabs.Trigger>
                <Tabs.Trigger value="monthly" asChild>
                  <button>Monatlich</button>
                </Tabs.Trigger>
              </Tabs.List>
              {["all", "daily", "weekly", "monthly"].map((type) => (
                <Tabs.Content value={type} key={type}>
                  <ReviewList
                    reviews={(query.data ?? []).filter(
                      (review) => type === "all" || review.reviewType === type,
                    )}
                    onOpen={openReview}
                  />
                </Tabs.Content>
              ))}
            </Tabs.Root>
            {selectedAccountId && (
              <ReviewDialog
                key={`${selectedAccountId}:${selected?.id ?? "new"}`}
                accountId={selectedAccountId}
                open={open && dialogAccountId === selectedAccountId}
                onOpenChange={setOpen}
                onCloseAutoFocus={restoreFocus}
                review={
                  selected?.accountId === selectedAccountId
                    ? selected
                    : undefined
                }
              />
            )}
          </>
        )}
      </JournalAccountGate>
    </div>
  );
}

function ReviewList({
  reviews,
  onOpen,
}: {
  reviews: ReviewRecord[];
  onOpen: (review: ReviewRecord) => void;
}) {
  if (!reviews.length)
    return (
      <Card>
        <EmptyState
          icon={NotebookPen}
          title="Noch keine Reviews"
          description="Ein Review friert die Kennzahlen des Zeitraums ein und verbindet sie mit deinen qualitativen Erkenntnissen."
        />
      </Card>
    );
  return (
    <div className="grid responsive-card-grid">
      {reviews.map((review) => {
        const snapshot = safeJson(review.metricSnapshotJson) as {
          netPnlMinor?: number;
          totalR?: { value?: number };
        };
        return (
          <Card key={review.id} className="collection-card">
            <CardHeader
              onOpen={() => onOpen(review)}
              title={`${reviewTypeLabel(review.reviewType)} · ${localDate(review.periodStart)}`}
              action={
                <Badge
                  className={
                    review.status === "completed" ? "positive" : "warning"
                  }
                >
                  {review.status === "completed" ? "Abgeschlossen" : "Entwurf"}
                </Badge>
              }
            />
            <CardContent>
              <div
                className="grid"
                style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 15 }}
              >
                <ReviewMetric
                  label="Netto-P&L"
                  value={formatMoneyMinor(snapshot.netPnlMinor)}
                />
                <ReviewMetric
                  label="Total R"
                  value={formatR(snapshot.totalR?.value)}
                />
              </div>
              <div className="collection-card-copy">
                {review.lessonsHtml ||
                  review.actionsHtml ||
                  "Noch keine Erkenntnisse notiert."}
              </div>
              {review.processRating && (
                <div style={{ marginTop: 14 }}>
                  <Badge className="primary">
                    Prozess {review.processRating} / 10
                  </Badge>
                </div>
              )}
              <div className="collection-card-footer">
                <span>
                  {localDate(review.periodStart)} –{" "}
                  {localDate(review.periodEnd)}
                </span>
                <Button size="sm" onClick={() => onOpen(review)}>
                  Review öffnen
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ReviewDialog({
  accountId,
  open,
  onOpenChange,
  review,
  onCloseAutoFocus,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  review?: ReviewRecord;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<ReviewInput>(() =>
    initialReview(review, today, accountId),
  );
  useEffect(() => {
    if (open) setDraft(initialReview(review, today, accountId));
  }, [accountId, open, review, today]);
  const snapshot = useQuery({
    queryKey: [
      "dashboard",
      "review-snapshot",
      accountId,
      draft.periodStart,
      draft.periodEnd,
    ],
    queryFn: () =>
      api.dashboard(accountId, {
        dateFrom: draft.periodStart,
        dateTo: draft.periodEnd,
      }),
    enabled:
      open &&
      draft.accountId === accountId &&
      Boolean(draft.periodStart && draft.periodEnd),
  });
  const mutation = useMutation({
    mutationFn: (input: ReviewInput) => {
      if (input.accountId !== accountId) {
        return Promise.reject({
          code: "ACCOUNT_SCOPE_CHANGED",
          message: "Das Tradingkonto hat sich geändert. Öffne das Review neu.",
        });
      }
      return api.saveReview(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", accountId] });
      toast.success("Review gespeichert.");
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Review konnte nicht gespeichert werden."),
  });
  const saveReview = (status: ReviewInput["status"]) => {
    if (!snapshot.data) {
      toast.error("Kennzahlen für den Review-Zeitraum werden noch geladen.");
      return;
    }
    mutation.mutate({
      ...draft,
      accountId,
      status,
      metricSnapshot: snapshot.data.metrics,
    });
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                {review ? "Review bearbeiten" : "Neues Review"}
              </Dialog.Title>
              <div className="dialog-description">
                Kennzahlen und qualitative Reflexion für einen festen Zeitraum
              </div>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Dialog schließen">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <section className="form-section">
              <div className="form-grid cols-3">
                <Field label="Typ">
                  <select
                    className="select"
                    value={draft.reviewType}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        reviewType: event.target
                          .value as ReviewInput["reviewType"],
                      })
                    }
                  >
                    <option value="daily">Tagesreview</option>
                    <option value="weekly">Wochenreview</option>
                    <option value="monthly">Monatsreview</option>
                  </select>
                </Field>
                <Field label="Von">
                  <input
                    className="input"
                    type="date"
                    value={draft.periodStart}
                    onChange={(event) =>
                      setDraft({ ...draft, periodStart: event.target.value })
                    }
                  />
                </Field>
                <Field label="Bis">
                  <input
                    className="input"
                    type="date"
                    value={draft.periodEnd}
                    onChange={(event) =>
                      setDraft({ ...draft, periodEnd: event.target.value })
                    }
                  />
                </Field>
              </div>
            </section>
            <section className="form-section">
              <div className="form-grid">
                <Field label="Was lief gut?">
                  <textarea
                    className="textarea"
                    value={draft.winsHtml ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, winsHtml: event.target.value })
                    }
                  />
                </Field>
                <Field label="Herausforderungen">
                  <textarea
                    className="textarea"
                    value={draft.challengesHtml ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, challengesHtml: event.target.value })
                    }
                  />
                </Field>
                <Field label="Erkenntnisse">
                  <textarea
                    className="textarea"
                    value={draft.lessonsHtml ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, lessonsHtml: event.target.value })
                    }
                  />
                </Field>
                <Field label="Konkrete nächste Aktionen">
                  <textarea
                    className="textarea"
                    value={draft.actionsHtml ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, actionsHtml: event.target.value })
                    }
                  />
                </Field>
              </div>
            </section>
            <section className="form-section">
              <Field
                label={`Prozessbewertung: ${draft.processRating ?? "nicht bewertet"}`}
              >
                <input
                  className="range"
                  type="range"
                  min="1"
                  max="10"
                  value={draft.processRating ?? 5}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      processRating: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </section>
          </div>
          <footer className="dialog-footer">
            <div className="page-actions">
              {review && (
                <Button
                  onClick={async () => {
                    try {
                      const saved =
                        await import("../import-export/document-exports").then(
                          (module) => module.exportReviewPdf(review),
                        );
                      if (saved) toast.success("Review als PDF gespeichert.");
                    } catch {
                      toast.error("Review-PDF konnte nicht erstellt werden.");
                    }
                  }}
                >
                  <FileText size={14} /> PDF
                </Button>
              )}
              <Button
                disabled={snapshot.isPending || mutation.isPending}
                onClick={() => saveReview("draft")}
              >
                <Save size={14} /> Als Entwurf
              </Button>
            </div>
            <Button
              variant="primary"
              disabled={snapshot.isPending || mutation.isPending}
              onClick={() => saveReview("completed")}
            >
              <CheckCircle2 size={14} /> Abschließen
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function initialReview(
  review: ReviewRecord | undefined,
  today: string,
  accountId: string,
): ReviewInput {
  return review
    ? {
        id: review.id,
        accountId,
        reviewType: review.reviewType,
        periodStart: review.periodStart.slice(0, 10),
        periodEnd: review.periodEnd.slice(0, 10),
        status: review.status,
        metricSnapshot: safeJson(review.metricSnapshotJson),
        winsHtml: review.winsHtml ?? "",
        challengesHtml: review.challengesHtml ?? "",
        lessonsHtml: review.lessonsHtml ?? "",
        actionsHtml: review.actionsHtml ?? "",
        processRating: review.processRating ?? undefined,
      }
    : {
        accountId,
        reviewType: "weekly",
        periodStart: today,
        periodEnd: today,
        status: "draft",
        metricSnapshot: {},
        winsHtml: "",
        challengesHtml: "",
        lessonsHtml: "",
        actionsHtml: "",
      };
}
function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}
function reviewTypeLabel(value: string) {
  return value === "daily" ? "Tag" : value === "weekly" ? "Woche" : "Monat";
}
function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <strong style={{ display: "block", marginTop: 5, fontSize: 14 }}>
        {value}
      </strong>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
