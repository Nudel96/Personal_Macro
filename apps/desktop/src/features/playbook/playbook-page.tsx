import { BookOpenCheck as PageIcon } from "lucide-react";
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
import { JournalPageHeader } from "../../components/ui/journal-page-header";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { api } from "../../services/commands";
import type { PlaybookSetup } from "../../types/domain";
import { useJournalAccount } from "../accounts/journal-account-context";
import { CollectionToolbar } from "../../components/ui/collection-toolbar";
import { WorkspaceSummary } from "../../components/ui/workspace-summary";
import { useDialogFocus } from "../../components/ui/use-dialog-focus";

export function PlaybookPage() {
  const { selectedAccountId, status } = useJournalAccount();
  const accountId = status === "ready" ? selectedAccountId : null;
  const query = useQuery({
    queryKey: ["playbook", accountId],
    queryFn: () => api.playbook(accountId ?? undefined),
  });
  const [selected, setSelected] = useState<PlaybookSetup>();
  const { rememberFocus, restoreFocus } = useDialogFocus();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const setups = query.data ?? [];
  const visibleSetups = setups.filter((setup) =>
    `${setup.name} ${setup.description ?? ""} ${setup.strategyName ?? ""}`
      .toLocaleLowerCase("de")
      .includes(search.trim().toLocaleLowerCase("de")),
  );
  return (
    <div className="page playbook-page">
      <JournalPageHeader
        icon={PageIcon}
        eyebrow="Prozess"
        title="Setup Playbook"
        description="Versionierte Regeln, Checklisten und Beispiele für wiederholbare Trading-Setups."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              rememberFocus();
              setCreateOpen(true);
            }}
          >
            <Plus size={15} /> Setup anlegen
          </Button>
        }
      />
      {query.isSuccess && setups.length > 0 && (
        <>
          <WorkspaceSummary
            items={[
              {
                label: "Setups im Playbook",
                value: setups.length,
                detail: "Deine wiederholbaren Handelsansätze",
              },
              {
                label: "Mit Checkliste",
                value: setups.filter(
                  (setup) => safeArray(setup.checklistJson).length > 0,
                ).length,
                detail: "Klare Regeln vor dem Einstieg",
              },
              {
                label: "Mit Regelversion",
                value: setups.filter((setup) => (setup.version ?? 0) > 0)
                  .length,
                detail: "Historische Regeln bleiben erhalten",
              },
            ]}
          />
          <CollectionToolbar
            label="Setups durchsuchen"
            value={search}
            onChange={setSearch}
            count={visibleSetups.length}
          />
        </>
      )}
      {query.isLoading ? (
        <PageLoading />
      ) : query.isError ? (
        <ErrorState message="Playbook konnte nicht geladen werden." />
      ) : visibleSetups.length ? (
        <div className="grid responsive-card-grid">
          {visibleSetups.map((setup) => (
            <SetupCard
              setup={setup}
              key={setup.id}
              onClick={() => {
                rememberFocus();
                setSelected(setup);
              }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={BookOpenCheck}
            title={search ? "Keine passenden Setups" : "Noch keine Setups"}
            description={
              search
                ? "Passe deinen Suchbegriff an oder setze die Suche zurück."
                : "Lege Setups an und versioniere deren Regeln. Bereits verknüpfte Trades behalten ihren historischen Setup-Stand."
            }
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> Erstes Setup anlegen
              </Button>
            }
          />
        </Card>
      )}
      <CreateSetupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCloseAutoFocus={restoreFocus}
      />
      <SetupDialog
        onCloseAutoFocus={restoreFocus}
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
    <Card className="collection-card">
      <div style={{ height: 3, background: setup.color }} />
      <CardHeader
        title={setup.name}
        onOpen={onClick}
        subtitle={setup.strategyName ?? "Eigenständiges Setup"}
        action={<Badge className="primary">v{setup.version ?? 0}</Badge>}
      />
      <CardContent>
        <div className="collection-card-copy">
          {setup.description ?? setup.notesHtml ?? "Noch keine Beschreibung."}
        </div>
        <div className="collection-metrics">
          <div>
            <div className="muted" style={{ fontSize: 11 }}>
              Trades
            </div>
            <strong style={{ display: "block", marginTop: 5, fontSize: 18 }}>
              {setup.tradeCount === null ? "–" : setup.tradeCount}
            </strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>
              Checkliste
            </div>
            <strong style={{ display: "block", marginTop: 5, fontSize: 18 }}>
              {checklist.length}
            </strong>
          </div>
        </div>
        {checklist.slice(0, 3).map((item) => (
          <div key={String(item)} className="collection-card-note">
            <CheckCircle2 size={12} className="positive-text" /> {String(item)}
          </div>
        ))}
        <div className="collection-card-footer">
          <span>Regeln & Beispiele</span>
          <Button size="sm" onClick={onClick}>
            Setup öffnen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateSetupDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
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
        <Dialog.Content
          className="dialog-content"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
        >
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
  onCloseAutoFocus,
}: {
  setup?: PlaybookSetup;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
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
          onCloseAutoFocus={onCloseAutoFocus}
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
    <label className="field" style={{ marginBottom: 14 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}
