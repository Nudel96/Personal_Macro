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
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { formatMoneyMinor, formatR, localDate } from "../../lib/utils";
import { api } from "../../services/commands";
import type { ReviewInput, ReviewRecord } from "../../types/domain";

export function ReviewsPage() {
  const query = useQuery({ queryKey: ["reviews"], queryFn: api.reviews });
  const dashboard = useQuery({
    queryKey: ["dashboard", "review-snapshot"],
    queryFn: () => api.dashboard({}),
  });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReviewRecord>();
  if (query.isLoading)
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  if (query.isError)
    return (
      <div className="page">
        <ErrorState message="Reviews konnten nicht geladen werden." />
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Prozess"
        title="Reviews"
        description="Tages-, Wochen- und Monatsreflexionen mit eingefrorenem Kennzahlen-Snapshot."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setSelected(undefined);
              setOpen(true);
            }}
          >
            <Plus size={15} /> Review starten
          </Button>
        }
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
              onOpen={(review) => {
                setSelected(review);
                setOpen(true);
              }}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
      <ReviewDialog
        open={open}
        onOpenChange={setOpen}
        review={selected}
        metricSnapshot={dashboard.data?.metrics}
      />
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
    <div
      className="grid"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {reviews.map((review) => {
        const snapshot = safeJson(review.metricSnapshotJson) as {
          netPnlMinor?: number;
          totalR?: { value?: number };
        };
        return (
          <Card
            key={review.id}
            style={{ cursor: "pointer" }}
            onClick={() => onOpen(review)}
          >
            <CardHeader
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
              <div className="muted" style={{ fontSize: 10, lineHeight: 1.55 }}>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  review,
  metricSnapshot,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  review?: ReviewRecord;
  metricSnapshot?: unknown;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<ReviewInput>(() =>
    initialReview(review, today, metricSnapshot),
  );
  useEffect(() => {
    if (open) setDraft(initialReview(review, today, metricSnapshot));
  }, [open, review, today, metricSnapshot]);
  const mutation = useMutation({
    mutationFn: api.saveReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      toast.success("Review gespeichert.");
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Review konnte nicht gespeichert werden."),
  });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide"
          aria-describedby={undefined}
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
              <Button size="icon" variant="ghost">
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
                onClick={() => mutation.mutate({ ...draft, status: "draft" })}
              >
                <Save size={14} /> Als Entwurf
              </Button>
            </div>
            <Button
              variant="primary"
              onClick={() => mutation.mutate({ ...draft, status: "completed" })}
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
  metricSnapshot: unknown,
): ReviewInput {
  return review
    ? {
        id: review.id,
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
        reviewType: "weekly",
        periodStart: today,
        periodEnd: today,
        status: "draft",
        metricSnapshot: metricSnapshot ?? {},
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
      <div className="muted" style={{ fontSize: 9 }}>
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
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
