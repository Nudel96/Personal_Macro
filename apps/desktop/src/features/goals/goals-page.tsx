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

export function GoalsPage() {
  const query = useQuery({ queryKey: ["goals"], queryFn: api.goals });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<GoalRecord>();
  if (query.isLoading)
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  if (query.isError)
    return (
      <div className="page">
        <ErrorState message="Ziele konnten nicht geladen werden." />
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Prozess"
        title="Ziele"
        description="Ergebnis- und Prozessziele mit manuellem oder berechnetem Fortschritt."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setSelected(undefined);
              setOpen(true);
            }}
          >
            <Plus size={15} /> Ziel anlegen
          </Button>
        }
      />
      {query.data?.length ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {query.data.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onOpen={() => {
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
            title="Noch keine Ziele"
            description="Kombiniere Ergebnisziele wie Total R mit Prozesszielen wie Plan-Adherence oder Review-Quote."
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus size={14} /> Erstes Ziel anlegen
              </Button>
            }
          />
        </Card>
      )}
      <GoalDialog open={open} onOpenChange={setOpen} goal={selected} />
    </div>
  );
}
function GoalCard({ goal, onOpen }: { goal: GoalRecord; onOpen: () => void }) {
  const current = Number(goal.latestValue ?? 0),
    target = Number(goal.targetValue),
    progress = target
      ? Math.min(100, Math.max(0, (current / target) * 100))
      : 0;
  const queryClient = useQueryClient();
  const [progressOpen, setProgressOpen] = useState(false);
  return (
    <Card style={{ cursor: "pointer" }} onClick={onOpen}>
      <CardHeader
        title={goal.name}
        subtitle={goal.description}
        action={
          <Badge className={goal.status === "active" ? "primary" : "positive"}>
            {goal.status}
          </Badge>
        }
      />
      <CardContent>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: 9 }}>
              Fortschritt
            </div>
            <div style={{ fontSize: 25, fontWeight: 780, marginTop: 6 }}>
              {number.format(current)}{" "}
              <span className="muted" style={{ fontSize: 12 }}>
                / {number.format(target)} {goal.unit}
              </span>
            </div>
          </div>
          <strong>{number.format(progress)} %</strong>
        </div>
        <div className="factor-track" style={{ margin: "13px 0" }}>
          <div className="factor-bar" style={{ width: `${progress}%` }} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 9,
          }}
        >
          <span className="muted">{goal.metricKey}</span>
          <span className="muted">bis {localDate(goal.endsAt)}</span>
        </div>
        <Button
          size="sm"
          style={{ marginTop: 14 }}
          onClick={(event) => {
            event.stopPropagation();
            setProgressOpen(true);
          }}
        >
          <Target size={12} /> Fortschritt erfassen
        </Button>
        <ProgressDialog
          goal={goal}
          open={progressOpen}
          onOpenChange={setProgressOpen}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalRecord;
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
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <header className="dialog-header">
            <Dialog.Title className="dialog-title">
              {goal ? "Ziel bearbeiten" : "Neues Ziel"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost">
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
                  <option value="plan_adherence">Plan-Adherence</option>
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
}: {
  goal: GoalRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
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
    <div className="field" style={{ marginBottom: 13 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
