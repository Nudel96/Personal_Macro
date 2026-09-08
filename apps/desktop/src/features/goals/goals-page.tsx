import { Goal as PageIcon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Goal, Plus, Save, Target, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { localDate, number } from "../../lib/utils";
import { api } from "../../services/commands";
import type { GoalInput, GoalRecord } from "../../types/domain";
import { CollectionToolbar } from "../../components/ui/collection-toolbar";
import { WorkspaceSummary } from "../../components/ui/workspace-summary";
import { useDialogFocus } from "../../components/ui/use-dialog-focus";

const metricLabels: Record<string, string> = {
  total_r: "Total R",
  net_pnl: "Netto-P&L",
  plan_adherence: "Plantreue",
  process_score: "Prozess-Score",
  review_rate: "Review-Quote",
  max_drawdown: "Max. Drawdown",
};
const statusLabels: Record<string, string> = {
  active: "Aktiv",
  completed: "Erreicht",
  paused: "Pausiert",
  archived: "Archiviert",
  cancelled: "Abgebrochen",
};

export function GoalsPage() {
  const query = useQuery({ queryKey: ["goals"], queryFn: api.goals });
  const [open, setOpen] = useState(false);
  const { rememberFocus, restoreFocus } = useDialogFocus();
  const [selected, setSelected] = useState<GoalRecord>();
  const [search, setSearch] = useState("");
  const goals = query.data ?? [];
  const visibleGoals = goals.filter((goal) =>
    `${goal.name} ${goal.description ?? ""} ${metricLabels[goal.metricKey] ?? goal.metricKey}`
      .toLocaleLowerCase("de")
      .includes(search.trim().toLocaleLowerCase("de")),
  );
  if (query.isLoading)
    return (
      <div className="page goals-page">
        <PageLoading />
      </div>
    );
  if (query.isError)
    return (
      <div className="page goals-page">
        <ErrorState message="Ziele konnten nicht geladen werden." />
      </div>
    );
  return (
    <div className="page goals-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Prozess"
        title="Ziele"
        description="Ergebnis- und Prozessziele mit manuellem oder berechnetem Fortschritt."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              rememberFocus();
              setSelected(undefined);
              setOpen(true);
            }}
          >
            <Plus size={15} /> Ziel anlegen
          </Button>
        }
      />
      {goals.length > 0 && (
        <>
          <WorkspaceSummary
            items={[
              {
                label: "Aktive Ziele",
                value: goals.filter((goal) => goal.status === "active").length,
                detail: "Dein aktueller Fokus",
              },
              {
                label: "Fortschritt erfasst",
                value: goals.filter((goal) => goal.latestValue != null).length,
                detail: "Ziele mit einer Beobachtung",
              },
              {
                label: "Erreichte Ziele",
                value: goals.filter((goal) => goal.status === "completed")
                  .length,
                detail: "Als abgeschlossen markiert",
              },
            ]}
          />
          <CollectionToolbar
            label="Ziele durchsuchen"
            value={search}
            onChange={setSearch}
            count={visibleGoals.length}
          />
        </>
      )}
      {visibleGoals.length ? (
        <div className="grid responsive-card-grid">
          {visibleGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onOpen={() => {
                rememberFocus();
                setSelected(goal);
                setOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Goal}
            title={search ? "Keine passenden Ziele" : "Noch keine Ziele"}
            description={
              search
                ? "Passe den Suchbegriff an oder setze die Suche zurück."
                : "Kombiniere Ergebnisziele wie Total R mit Prozesszielen wie Plantreue oder Review-Quote."
            }
            action={
              search ? (
                <Button onClick={() => setSearch("")}>
                  Suche zurücksetzen
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    rememberFocus();
                    setSelected(undefined);
                    setOpen(true);
                  }}
                >
                  <Plus size={14} /> Erstes Ziel anlegen
                </Button>
              )
            }
          />
        </Card>
      )}
      <GoalDialog
        open={open}
        onOpenChange={setOpen}
        goal={selected}
        onCloseAutoFocus={restoreFocus}
      />
    </div>
  );
}
function GoalCard({ goal, onOpen }: { goal: GoalRecord; onOpen: () => void }) {
  const current = goal.latestValue == null ? null : Number(goal.latestValue),
    target = Number(goal.targetValue),
    progress =
      target && current != null
        ? Math.min(100, Math.max(0, (current / target) * 100))
        : 0;
  const queryClient = useQueryClient();
  const [progressOpen, setProgressOpen] = useState(false);
  const { rememberFocus, restoreFocus } = useDialogFocus();
  return (
    <Card className="collection-card">
      <CardHeader
        title={goal.name}
        onOpen={onOpen}
        subtitle={goal.description}
        action={
          <Badge
            className={
              goal.status === "active"
                ? "primary"
                : goal.status === "completed"
                  ? "positive"
                  : "neutral"
            }
          >
            {statusLabels[goal.status] ?? goal.status}
          </Badge>
        }
      />
      <CardContent>
        <div className="goal-progress-value">
          <div>
            <div className="muted">Fortschritt</div>
            <strong>
              {current == null ? "—" : number.format(current)}{" "}
              <small>
                / {number.format(target)} {goal.unit}
              </small>
            </strong>
          </div>
          <span>
            {current == null
              ? "Noch nicht erfasst"
              : `${number.format(progress)} %`}
          </span>
        </div>
        <div className="goal-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
          }}
        >
          <span className="muted">
            {metricLabels[goal.metricKey] ?? goal.metricKey}
          </span>
          <span className="muted">
            {goal.endsAt ? `bis ${localDate(goal.endsAt)}` : "Ohne Enddatum"}
          </span>
        </div>
        <Button
          size="sm"
          style={{ marginTop: 14 }}
          onClick={(event) => {
            event.stopPropagation();
            rememberFocus();
            setProgressOpen(true);
          }}
        >
          <Target size={12} /> Fortschritt erfassen
        </Button>
        <ProgressDialog
          goal={goal}
          open={progressOpen}
          onOpenChange={setProgressOpen}
          onCloseAutoFocus={restoreFocus}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["goals"] })}
        />
      </CardContent>
    </Card>
  );
}
function GoalDialog({
  open,
  onOpenChange,
  goal,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalRecord;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<GoalInput>(() => initialGoal(goal, today));
  useEffect(() => {
    if (open) setDraft(initialGoal(goal, today));
  }, [open, goal, today]);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.saveGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Ziel gespeichert.");
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Ziel konnte nicht gespeichert werden."),
  });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <header className="dialog-header">
            <Dialog.Title className="dialog-title">
              {goal ? "Ziel bearbeiten" : "Neues Ziel"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Dialog schließen">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <div className="form-grid">
              <Field label="Name">
                <input
                  className="input"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Messgröße">
                <select
                  className="select"
                  value={draft.metricKey}
                  onChange={(event) =>
                    setDraft({ ...draft, metricKey: event.target.value })
                  }
                >
                  <option value="total_r">Total R</option>
                  <option value="net_pnl">Netto-P&L</option>
                  <option value="plan_adherence">Plantreue</option>
                  <option value="process_score">Prozess-Score</option>
                  <option value="review_rate">Review-Quote</option>
                  <option value="max_drawdown">Max. Drawdown</option>
                </select>
              </Field>
              <Field label="Zielwert">
                <input
                  className="input"
                  value={draft.targetValue}
                  onChange={(event) =>
                    setDraft({ ...draft, targetValue: event.target.value })
                  }
                />
              </Field>
              <Field label="Einheit">
                <input
                  className="input"
                  value={draft.unit}
                  onChange={(event) =>
                    setDraft({ ...draft, unit: event.target.value })
                  }
                />
              </Field>
              <Field label="Start">
                <input
                  className="input"
                  type="date"
                  value={draft.startsAt.slice(0, 10)}
                  onChange={(event) =>
                    setDraft({ ...draft, startsAt: event.target.value })
                  }
                />
              </Field>
              <Field label="Ende">
                <input
                  className="input"
                  type="date"
                  value={draft.endsAt?.slice(0, 10) ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, endsAt: event.target.value || null })
                  }
                />
              </Field>
            </div>
            <Field label="Beschreibung">
              <textarea
                className="textarea"
                value={draft.description ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <span />
            <Button variant="primary" onClick={() => mutation.mutate(draft)}>
              <Save size={14} /> Speichern
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function initialGoal(goal: GoalRecord | undefined, today: string): GoalInput {
  return goal
    ? {
        id: goal.id,
        name: goal.name,
        description: goal.description,
        metricKey: goal.metricKey,
        targetValue: goal.targetValue,
        unit: goal.unit,
        direction: goal.direction,
        startsAt: goal.startsAt,
        endsAt: goal.endsAt,
        status: goal.status,
      }
    : {
        name: "",
        description: "",
        metricKey: "total_r",
        targetValue: "10",
        unit: "R",
        direction: "at_least",
        startsAt: today,
        endsAt: null,
        status: "active",
      };
}

function ProgressDialog({
  goal,
  open,
  onOpenChange,
  onSaved,
  onCloseAutoFocus,
}: {
  goal: GoalRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [value, setValue] = useState(goal.latestValue ?? "0");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setValue(goal.latestValue ?? "0");
      setNote("");
    }
  }, [open, goal.latestValue]);
  const mutation = useMutation({
    mutationFn: () => api.recordGoalProgress(goal.id, value, note || undefined),
    onSuccess: () => {
      onSaved();
      toast.success("Fortschritt gespeichert.");
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Fortschritt konnte nicht gespeichert werden.",
      ),
  });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                Fortschritt erfassen
              </Dialog.Title>
              <div className="dialog-description">
                {goal.name} · Ziel {goal.targetValue} {goal.unit}
              </div>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Dialog schließen">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <Field label={`Aktueller Wert (${goal.unit})`}>
              <input
                className="input"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Notiz (optional)">
              <textarea
                className="textarea"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Was hat den Fortschritt beeinflusst?"
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <span />
            <Button
              variant="primary"
              disabled={!value.trim() || mutation.isPending}
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
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field" style={{ marginBottom: 13 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}
