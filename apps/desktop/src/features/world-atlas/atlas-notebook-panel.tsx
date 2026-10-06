import { useEffect, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Star, Trash2, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useDialogFocus } from "../../components/ui/use-dialog-focus";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import {
  atlasContextParams,
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";
import { captureAtlasPictures } from "./atlas-picture-capture";
import type {
  AtlasNotebookCreateInput,
  AtlasNotebookEntry,
  AtlasSavedContext,
  AtlasSourceReference,
} from "./atlas-notebook-types";
import "./atlas-notebook.css";

const message = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die Ansicht konnte nicht gespeichert werden. Bitte erneut versuchen.";
const date = (value: string) =>
  new Date(value).toLocaleString("de", {
    dateStyle: "medium",
    timeStyle: "short",
  });
type Picture = { base64: string | null; error: string | null };
type Prepared = { input: AtlasNotebookCreateInput; picture: Promise<Picture> };

function SourceStand({ sources }: { sources: AtlasSourceReference[] }) {
  return (
    <details className="atlas-details">
      <summary>Gespeicherte Quellenangaben</summary>
      <p>
        Der Quellenstand gehört zum Zeitpunkt des Merkens. Die öffentlichen
        Datensätze werden bei einer späteren Aktualisierung neu eingelesen.
      </p>
      {!sources.length && (
        <p>Zu dieser Ansicht lag kein geladener Datenstand vor.</p>
      )}
      <ul className="atlas-notebook-sources">
        {sources.map((source, i) => (
          <li key={`${source.family}:${source.datasetId}:${source.scope}:${i}`}>
            <strong>
              {source.label} · {source.scope}
            </strong>
            <span>
              {source.datasetId}
              {source.release ? ` · Quellenstand ${source.release}` : ""}
            </span>
            <span>
              {source.retrievedAt
                ? `Lokal abgerufen ${date(source.retrievedAt)}`
                : source.status === "explanatory_model"
                  ? "Erklärendes Modell · keine beobachtete Länderphase"
                  : "Kein lokaler Abruf hinterlegt"}
            </span>
            {source.recipe && (
              <span>Berechnung / Katalog: {source.recipe}</span>
            )}
            {source.hashes.length > 0 && (
              <details>
                <summary>Dateiprüfsummen</summary>
                <pre>{source.hashes.join("\n")}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EntryForm({
  entry: providedEntry,
  prepared,
  onClose,
  onChanged,
  onNavigate,
}: {
  entry?: AtlasNotebookEntry;
  prepared?: Prepared;
  onClose: () => void;
  onChanged: (entry: AtlasNotebookEntry) => void;
  onNavigate: (context: AtlasSavedContext) => void;
}) {
  // Keep the version the user started editing. Refetches must neither erase a
  // draft nor silently upgrade its optimistic revision.
  const [entry] = useState(providedEntry);
  const original = entry ?? prepared!.input;
  const [title, setTitle] = useState(original.title);
  const [note, setNote] = useState(original.note);
  const [favorite, setFavorite] = useState(original.favorite);
  const [includePicture, setIncludePicture] = useState(true);
  const [picture, setPicture] = useState<Picture | null>(
    entry ? { base64: null, error: null } : null,
  );
  const [discard, setDiscard] = useState(false);
  const [opening, setOpening] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty =
    title !== original.title ||
    note !== original.note ||
    favorite !== original.favorite;
  const liveContext = atlasContextParams(original.context);
  useEffect(() => {
    let cancelled = false;
    if (prepared)
      void prepared.picture.then((value) => {
        if (!cancelled) setPicture(value);
      });
    return () => {
      cancelled = true;
    };
  }, [prepared]);
  const save = useMutation({
    mutationFn: () =>
      entry
        ? api.updateAtlasNotebookEntry({
            id: entry.id,
            revision: entry.revision,
            title,
            note,
            favorite,
          })
        : api.createAtlasNotebookEntry({
            ...prepared!.input,
            title,
            note,
            favorite,
            snapshotBase64: includePicture ? (picture?.base64 ?? null) : null,
          }),
    onSuccess: (saved) => {
      onChanged(saved);
      onClose();
    },
  });
  const trash = useMutation({
    mutationFn: () =>
      api.trashAtlasNotebookEntry(
        entry!.id,
        entry!.revision,
        !entry!.trashedAt,
      ),
    onSuccess: (saved) => {
      onChanged(saved);
      onClose();
    },
  });
  const pending = save.isPending || trash.isPending;
  const closeAttempt = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  // Escape and outside clicks use the same draft guard as the explicit close.
  useEffect(() => {
    const content = formRef.current?.closest('[role="dialog"]');
    const listener = (event: Event) => {
      event.preventDefault();
      closeAttempt();
    };
    content?.addEventListener("atlas-close", listener);
    return () => content?.removeEventListener("atlas-close", listener);
  });
  const image =
    entry?.snapshotDataUrl ??
    (picture?.base64 && includePicture
      ? `data:image/png;base64,${picture.base64}`
      : null);
  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !pending &&
          !entry?.trashedAt &&
          (!includePicture || (picture && !picture.error))
        )
          save.mutate();
      }}
    >
      <div className="dialog-body atlas-notebook-body">
        <p className="atlas-notebook-context">{original.contextLabel}</p>
        {entry && (
          <p>
            Gemerkt am {date(entry.capturedAt)}. Diagrammstand und Quellen
            bleiben beim Bearbeiten der Notiz erhalten.
          </p>
        )}
        <label className="atlas-notebook-field">
          Name
          <input
            autoFocus
            className="input"
            maxLength={160}
            required
            value={title}
            disabled={pending || !!entry?.trashedAt}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="atlas-notebook-field">
          Eigene Notiz
          <textarea
            className="textarea"
            rows={5}
            maxLength={12000}
            placeholder="Was fällt dir an diesem Bild auf?"
            value={note}
            disabled={pending || !!entry?.trashedAt}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="atlas-notebook-check">
          <input
            type="checkbox"
            checked={favorite}
            disabled={pending || !!entry?.trashedAt}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          <Star size={15} /> Als Favorit merken
        </label>
        {!entry && (
          <label className="atlas-notebook-check">
            <input
              type="checkbox"
              checked={includePicture}
              disabled={pending}
              onChange={(e) => setIncludePicture(e.target.checked)}
            />{" "}
            Diagrammstand mitspeichern
          </label>
        )}
        {!entry && includePicture && !picture && (
          <p role="status">Diagramme werden lokal als Bild festgehalten …</p>
        )}
        {!entry && includePicture && picture?.error && (
          <p role="alert">
            {picture.error} Du kannst den Bildstand abwählen und die Ansicht mit
            Notiz speichern.
          </p>
        )}
        {!image && (entry || (picture && !picture.error)) && (
          <p>
            {entry?.snapshotStatus === "unreadable"
              ? "Der gespeicherte Bildstand ist nicht lesbar. Deine Notiz und die Ansicht bleiben verfügbar."
              : "Diese Ansicht enthält keinen gespeicherten Diagrammstand."}
          </p>
        )}
        {image && (
          <details className="atlas-details" open={!entry}>
            <summary>
              {entry
                ? "Gespeicherten Diagrammstand ansehen"
                : "Vorschau des festen Diagrammstands"}
            </summary>
            <img
              className="atlas-notebook-picture"
              src={image}
              alt={`Gespeicherter Diagrammstand: ${original.contextLabel}`}
            />
          </details>
        )}
        <SourceStand sources={original.sources} />
        {entry && !entry.trashedAt && (
          <div className="atlas-notebook-live">
            <Button
              type="button"
              disabled={pending || dirty || !liveContext}
              onClick={() => {
                setOpening(true);
                onNavigate(entry.context);
                onClose();
              }}
            >
              Ansicht mit aktuellem Datenstand öffnen
            </Button>
            <p>
              {dirty
                ? "Speichere oder verwerfe zuerst deine Änderungen."
                : !liveContext
                  ? "Diese Ansichtsversion kann hier nicht geöffnet werden. Notiz und Bild bleiben verfügbar."
                  : "Öffnet deine Auswahl mit den aktuell vorhandenen Daten. Der gespeicherte Bildstand bleibt erhalten."}
            </p>
          </div>
        )}
        {(save.error || trash.error) && (
          <p role="alert">{message(save.error ?? trash.error)}</p>
        )}
        {discard && (
          <div className="atlas-notebook-discard" role="alert">
            <p>Deine Änderungen sind noch nicht gespeichert.</p>
            <Button type="button" onClick={() => setDiscard(false)}>
              Weiter bearbeiten
            </Button>
            <Button type="button" variant="danger" onClick={onClose}>
              Änderungen verwerfen
            </Button>
          </div>
        )}
      </div>
      <footer className="dialog-footer atlas-notebook-footer">
        {entry && (
          <Button
            type="button"
            variant={entry.trashedAt ? "default" : "ghost"}
            disabled={pending || dirty}
            onClick={() => trash.mutate()}
          >
            {entry.trashedAt ? (
              "Wiederherstellen"
            ) : (
              <>
                <Trash2 size={15} /> In den Papierkorb
              </>
            )}
          </Button>
        )}
        <Button
          type="button"
          disabled={pending || opening}
          onClick={closeAttempt}
        >
          Schließen
        </Button>
        {!entry?.trashedAt && (
          <Button
            type="submit"
            variant="primary"
            disabled={
              pending ||
              !title.trim() ||
              (!entry && includePicture && (!picture || !!picture.error))
            }
          >
            {save.isPending
              ? "Wird gespeichert …"
              : entry
                ? "Notiz speichern"
                : "Ansicht merken"}
          </Button>
        )}
      </footer>
    </form>
  );
}

export function AtlasNotebookPanel({
  params,
  contextLabel,
  root,
  onNavigate,
  lastViewError,
}: {
  params: URLSearchParams;
  contextLabel: string;
  root: RefObject<HTMLDivElement | null>;
  onNavigate: (params: URLSearchParams) => void;
  lastViewError: string | null;
}) {
  const native = isTauri() || isPrivateWeb();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [trashed, setTrashed] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focus = useDialogFocus();
  const list = useQuery({
    queryKey: ["atlas-notebook", "list", trashed],
    queryFn: () => api.atlasNotebook(trashed),
    enabled: native && expanded,
  });
  const detail = useQuery({
    queryKey: ["atlas-notebook", "entry", selected],
    queryFn: () => api.atlasNotebookEntry(selected!),
    enabled: native && !!selected,
  });
  const close = () => {
    setSelected(null);
    setPrepared(null);
  };
  const onChanged = (entry: AtlasNotebookEntry) => {
    client.setQueryData(["atlas-notebook", "entry", entry.id], entry);
    void client.invalidateQueries({ queryKey: ["atlas-notebook", "list"] });
    void client.invalidateQueries({ queryKey: ["backups"] });
    setNotice(
      entry.trashedAt
        ? "Ansicht im Papierkorb. Du kannst sie dort wiederherstellen."
        : isPrivateWeb()
          ? "Ansicht privat in der Cloud gespeichert."
          : "Ansicht lokal gespeichert.",
    );
  };
  const entries =
    list.data?.filter(
      (entry) =>
        (!favorites || entry.favorite) &&
        `${entry.title} ${entry.contextLabel} ${entry.notePreview}`
          .toLocaleLowerCase("de")
          .includes(search.toLocaleLowerCase("de")),
    ) ?? [];
  function remember() {
    try {
      const context = atlasSavedContext(params);
      const sources = atlasNotebookSources(client, context);
      const picture = root.current
        ? captureAtlasPictures(
            root.current,
            contextLabel,
            isPrivateWeb() ? 1024 * 1024 : undefined,
          )
            .then((base64): Picture => ({ base64, error: null }))
            .catch((e): Picture => ({ base64: null, error: message(e) }))
        : Promise.resolve({ base64: null, error: null });
      focus.rememberFocus();
      setError(null);
      setNotice(null);
      setPrepared({
        input: {
          title: [...contextLabel].slice(0, 160).join(""),
          note: "",
          favorite: false,
          contextLabel: [...contextLabel].slice(0, 400).join(""),
          capturedAt: new Date().toISOString(),
          context,
          sources,
          snapshotBase64: null,
        },
        picture,
      });
    } catch (e) {
      setError(message(e));
    }
  }
  function requestClose() {
    if (dialogRef.current?.querySelector("form"))
      dialogRef.current.dispatchEvent(
        new Event("atlas-close", { cancelable: true }),
      );
    else close();
  }
  return (
    <section className="atlas-notebook" aria-label="Persönliche Atlasansichten">
      <div className="atlas-notebook-toolbar">
        <Button type="button" disabled={!native} onClick={remember}>
          <Bookmark size={16} /> Ansicht merken
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!native}
          aria-expanded={expanded}
          aria-controls="atlas-notebook-list"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={16} /> Gemerkte Ansichten
        </Button>
        <span>
          {isPrivateWeb()
            ? "Eigene Notizen · privat in deinem Cloud-Journal"
            : native
              ? "Eigene Notizen · lokal · im Journal-Backup enthalten"
              : "Notizen und gemerkte Ansichten sind in der Desktop-App verfügbar."}
        </span>
      </div>
      {lastViewError && <p role="status">{lastViewError}</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {expanded && (
        <div id="atlas-notebook-list" className="atlas-notebook-list">
          <div className="atlas-notebook-filters">
            <label>
              Ansichten durchsuchen
              <input
                className="input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="atlas-notebook-check">
              <input
                type="checkbox"
                checked={favorites}
                onChange={(e) => setFavorites(e.target.checked)}
              />{" "}
              Nur Favoriten
            </label>
            <Button
              type="button"
              aria-pressed={trashed}
              onClick={() => setTrashed(!trashed)}
            >
              <Trash2 size={15} />{" "}
              {trashed ? "Zurück zu meinen Ansichten" : "Papierkorb"}
            </Button>
          </div>
          {list.isLoading && (
            <p role="status">Gespeicherte Ansichten werden geladen …</p>
          )}
          {list.error && (
            <p role="alert">
              {message(list.error)}{" "}
              <Button onClick={() => void list.refetch()}>Erneut laden</Button>
            </p>
          )}
          {list.isSuccess && !entries.length && (
            <p>
              {trashed
                ? "Hier liegen keine passenden Ansichten im Papierkorb."
                : search || favorites
                  ? "Keine gemerkte Ansicht passt zu diesem Filter."
                  : "Merke ein Bild, das du später vergleichen oder mit einer eigenen Beobachtung ergänzen möchtest."}
            </p>
          )}
          <ul className="atlas-notebook-cards">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    focus.rememberFocus();
                    setNotice(null);
                    setSelected(entry.id);
                  }}
                >
                  <strong>
                    {entry.favorite && <Star size={14} aria-label="Favorit" />}{" "}
                    {entry.title}
                  </strong>
                  <span>{entry.contextLabel}</span>
                  {entry.notePreview && <p>{entry.notePreview}</p>}
                  <small>
                    {entry.hasImage
                      ? "Mit festem Diagrammstand"
                      : "Ansicht und Notiz"}{" "}
                    · {new Date(entry.capturedAt).toLocaleDateString("de")}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog.Root
        open={!!prepared || !!selected}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            ref={dialogRef}
            className="dialog-content wide atlas-notebook-dialog"
            onCloseAutoFocus={focus.restoreFocus}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              requestClose();
            }}
            onInteractOutside={(event) => {
              event.preventDefault();
              requestClose();
            }}
          >
            <header className="dialog-header">
              <div>
                <Dialog.Title className="dialog-title">
                  {selected ? "Gemerkte Ansicht" : "Ansicht mit Notiz merken"}
                </Dialog.Title>
                <Dialog.Description className="dialog-description">
                  Dein Blick auf Länder, Märkte und lange Entwicklungen.
                </Dialog.Description>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Dialog schließen"
                onClick={requestClose}
              >
                <X size={17} />
              </Button>
            </header>
            {selected && detail.isLoading && (
              <p className="dialog-body" role="status">
                Ansicht wird geladen …
              </p>
            )}
            {selected && detail.error && (
              <p className="dialog-body" role="alert">
                {message(detail.error)}{" "}
                <Button onClick={() => void detail.refetch()}>
                  Erneut laden
                </Button>
              </p>
            )}
            {(prepared || (selected && detail.data)) && (
              <EntryForm
                key={prepared ? "new" : selected}
                prepared={prepared ?? undefined}
                entry={selected ? detail.data : undefined}
                onClose={close}
                onChanged={onChanged}
                onNavigate={(context) => {
                  const next = atlasContextParams(context);
                  if (next) onNavigate(next);
                }}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
