import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  CheckCircle2,
  Layers3,
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
import { api } from "../../services/commands";
import type { PlaybookSetup } from "../../types/domain";

export function PlaybookPage() {
  const query = useQuery({ queryKey: ["playbook"], queryFn: api.playbook });
  const [selected, setSelected] = useState<PlaybookSetup>();
  const [createOpen, setCreateOpen] = useState(false);
  if (query.isLoading)
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  if (query.isError)
    return (
      <div className="page">
        <ErrorState message="Playbook konnte nicht geladen werden." />
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Prozess"
        title="Setup Playbook"
        description="Versionierte Regeln, Checklisten und Beispiele für wiederholbare Trading-Setups."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Setup anlegen
          </Button>
        }
      />
      {query.data?.length ? (
        <div className="grid responsive-card-grid">
          {query.data.map((setup) => (
            <SetupCard
              setup={setup}
              key={setup.id}
              onClick={() => setSelected(setup)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={BookOpenCheck}
            title="Noch keine Setups"
            description="Lege Setups an und versioniere deren Regeln. Bereits verknüpfte Trades behalten ihren historischen Setup-Stand."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> Erstes Setup anlegen
              </Button>
            }
          />
        </Card>
      )}
      <CreateSetupDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SetupDialog
        setup={selected}
        onOpenChange={(open) => !open && setSelected(undefined)}
      />
    </div>
  );
}

function SetupCard({
  setup,
  onClick,
}: {
  setup: PlaybookSetup;
  onClick: () => void;
}) {
  const checklist = safeArray(setup.checklistJson);
  return (
    <Card onClick={onClick} style={{ cursor: "pointer", overflow: "hidden" }}>
      <div style={{ height: 3, background: setup.color }} />
      <CardHeader
        title={setup.name}
        subtitle={setup.strategyName ?? "Eigenständiges Setup"}
        action={<Badge className="primary">v{setup.version ?? 0}</Badge>}
      />
      <CardContent>
        <div
          className="muted"
          style={{ minHeight: 35, fontSize: 10, lineHeight: 1.55 }}
        >
          {setup.description ?? setup.notesHtml ?? "Noch keine Beschreibung."}
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr", margin: "15px 0" }}
        >
          <div>
            <div className="muted" style={{ fontSize: 9 }}>
              Trades
            </div>
            <strong style={{ display: "block", marginTop: 5, fontSize: 18 }}>
              {setup.tradeCount}
            </strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 9 }}>
              Checkliste
            </div>
            <strong style={{ display: "block", marginTop: 5, fontSize: 18 }}>
              {checklist.length}
            </strong>
          </div>
        </div>
        {checklist.slice(0, 3).map((item) => (
          <div
            key={String(item)}
            style={{
              display: "flex",
              gap: 7,
              alignItems: "center",
              fontSize: 10,
              color: "var(--text-2)",
              marginTop: 7,
            }}
          >
            <CheckCircle2 size={12} className="positive-text" /> {String(item)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CreateSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setColor("#3b82f6");
    }
  }, [open]);
  const mutation = useMutation({
    mutationFn: () => api.createSetup({ name, description, color }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playbook"] }),
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      ]);
      toast.success("Setup angelegt.");
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Setup konnte nicht angelegt werden."),
  });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <header className="dialog-header">
            <Dialog.Title className="dialog-title">Neues Setup</Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Dialog schließen">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <Field label="Name">
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Beschreibung">
              <textarea
                className="textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="Farbe">
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  className="input"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  style={{ width: 58, padding: 4 }}
                />
                <input
                  className="input tabular"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </div>
            </Field>
          </div>
          <footer className="dialog-footer">
            <span />
            <Button
              variant="primary"
              disabled={!name.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Plus size={14} /> Setup anlegen
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SetupDialog({
  setup,
  onOpenChange,
}: {
  setup?: PlaybookSetup;
  onOpenChange: (open: boolean) => void;
}) {
  const [rules, setRules] = useState("");
  const [checklist, setChecklist] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!setup) return;
    setRules(safeArray(setup.rulesJson).join("\n"));
    setChecklist(safeArray(setup.checklistJson).join("\n"));
    setNotes(setup.notesHtml ?? "");
  }, [setup]);
  const mutation = useMutation({
    mutationFn: () =>
      api.createSetupVersion({
        setupId: setup!.id,
        rules: rules
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        checklist: checklist
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        examples: [],
        notesHtml: notes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["playbook"] });
      toast.success("Neue Setup-Version gespeichert.");
      onOpenChange(false);
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Setup-Version konnte nicht gespeichert werden.",
      ),
  });
  return (
    <Dialog.Root open={Boolean(setup)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide"
          aria-describedby={undefined}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                {setup?.name}
              </Dialog.Title>
              <div className="dialog-description">
                Beim Speichern wird eine unveränderliche neue Version erzeugt.
              </div>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Dialog schließen">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Regeln (eine pro Zeile)">
                <textarea
                  className="textarea"
                  style={{ minHeight: 220 }}
                  value={rules}
                  onChange={(event) => setRules(event.target.value)}
                  placeholder={
                    "Nur im Haupttrend handeln\nEntry erst nach Bestätigung"
                  }
                />
              </Field>
              <Field label="Checkliste (eine pro Zeile)">
                <textarea
                  className="textarea"
                  style={{ minHeight: 220 }}
                  value={checklist}
                  onChange={(event) => setChecklist(event.target.value)}
                  placeholder={
                    "Macro Bias geprüft\nRisiko berechnet\nNews-Zeit geprüft"
                  }
                />
              </Field>
            </div>
            <Field label="Notizen">
              <textarea
                className="textarea"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </div>
          <footer className="dialog-footer">
            <Badge>
              <Layers3 size={11} /> Aktuell v{setup?.version ?? 0}
            </Badge>
            <Button
              variant="primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Save size={14} /> Neue Version speichern
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function safeArray(value?: string | null): unknown[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
