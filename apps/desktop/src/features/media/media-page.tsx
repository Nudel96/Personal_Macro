import { Images as PageIcon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Circle as CircleIcon,
  Copy,
  FileImage,
  Image as ImageIcon,
  Plus,
  Redo2,
  Save,
  Square,
  Minus,
  Trash2,
  Type,
  Upload,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Arrow,
  Circle,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type Konva from "konva";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { CollectionToolbar } from "../../components/ui/collection-toolbar";
import { WorkspaceSummary } from "../../components/ui/workspace-summary";
import { useDialogFocus } from "../../components/ui/use-dialog-focus";
import { dateTime, uid } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type { MediaRecord } from "../../types/domain";

type AnnotationShape =
  | {
      id: string;
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }
  | {
      id: string;
      kind: "circle";
      x: number;
      y: number;
      radius: number;
      color: string;
    }
  | {
      id: string;
      kind: "line";
      x: number;
      y: number;
      points: number[];
      color: string;
    }
  | {
      id: string;
      kind: "arrow";
      x: number;
      y: number;
      points: number[];
      color: string;
    }
  | {
      id: string;
      kind: "text";
      x: number;
      y: number;
      text: string;
      color: string;
    };

export function MediaPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["media"], queryFn: api.media });
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<MediaRecord>();
  const { rememberFocus, restoreFocus } = useDialogFocus();
  const [search, setSearch] = useState("");
  const mediaFiles = query.data ?? [];
  const visibleMedia = mediaFiles.filter((media) =>
    media.originalFilename
      .toLocaleLowerCase("de")
      .includes(search.trim().toLocaleLowerCase("de")),
  );
  const addMedia = async () => {
    setBusy(true);
    try {
      if (isTauri()) {
        const path = await open({
          multiple: false,
          filters: [
            {
              name: "Bilder",
              extensions: ["png", "jpg", "jpeg", "webp", "gif"],
            },
          ],
        });
        if (typeof path === "string") await api.importMediaPath(path);
      } else inputRef.current?.click();
      await queryClient.invalidateQueries({ queryKey: ["media"] });
    } catch (error) {
      toast.error(
        (error as { message?: string }).message ??
          "Datei konnte nicht importiert werden.",
      );
    } finally {
      setBusy(false);
    }
  };
  const browserFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("In der Browser-Vorschau sind maximal 5 MB erlaubt.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const rows = JSON.parse(
      localStorage.getItem("personal-macro:browser-media:v1") ?? "[]",
    ) as MediaRecord[];
    rows.unshift({
      id: uid(),
      relativePath: dataUrl,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      sha256: "browser-preview",
      createdAt: new Date().toISOString(),
      tradeCount: 0,
      absolutePath: dataUrl,
    });
    localStorage.setItem(
      "personal-macro:browser-media:v1",
      JSON.stringify(rows),
    );
    queryClient.invalidateQueries({ queryKey: ["media"] });
  };
  if (query.isLoading)
    return (
      <div className="page media-page">
        <PageLoading />
      </div>
    );
  if (query.isError)
    return (
      <div className="page media-page">
        <ErrorState message="Medien konnten nicht geladen werden." />
      </div>
    );
  return (
    <div className="page media-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Tradingjournal"
        title="Medien"
        description="Lokale Screenshots mit unverändertem Original und nicht-destruktiven Chart-Anmerkungen."
        actions={
          <Button variant="primary" onClick={addMedia} disabled={busy}>
            <Upload size={14} /> {busy ? "Importiert …" : "Datei importieren"}
          </Button>
        }
      />
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => browserFile(event.target.files?.[0])}
      />
      {mediaFiles.length > 0 && (
        <>
          <WorkspaceSummary
            items={[
              {
                label: "Medienbibliothek",
                value: mediaFiles.length,
                detail: "Originale auf diesem Gerät",
              },
              {
                label: "Mit Trades verknüpft",
                value: mediaFiles.filter((media) => media.tradeCount > 0)
                  .length,
                detail: "Visueller Kontext für dein Journal",
              },
              {
                label: "Speicherbedarf",
                value: `${(mediaFiles.reduce((sum, media) => sum + media.sizeBytes, 0) / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`,
                detail: "Größe der Originaldateien",
              },
            ]}
          />
          <CollectionToolbar
            label="Medien durchsuchen"
            value={search}
            onChange={setSearch}
            count={visibleMedia.length}
          />
        </>
      )}
      {visibleMedia.length ? (
        <div className="grid media-grid">
          {visibleMedia.map((media) => (
            <MediaCard
              media={media}
              key={media.id}
              onClick={() => {
                rememberFocus();
                setSelected(media);
              }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={ImageIcon}
            title={search ? "Keine passenden Medien" : "Noch keine Medien"}
            description={
              search
                ? "Suche nach einem anderen Dateinamen oder setze die Suche zurück."
                : "Sammle Screenshots zu deinen Trades und ergänze Pfeile, Markierungen und Notizen. Das Original bleibt erhalten."
            }
            action={
              <Button variant="primary" onClick={addMedia}>
                <Plus size={14} /> Screenshot importieren
              </Button>
            }
          />
        </Card>
      )}
      <AnnotationDialog
        onCloseAutoFocus={restoreFocus}
        media={selected}
        onOpenChange={(open) => !open && setSelected(undefined)}
      />
    </div>
  );
}

function MediaCard({
  media,
  onClick,
}: {
  media: MediaRecord;
  onClick: () => void;
}) {
  const src = media.absolutePath.startsWith("data:")
    ? media.absolutePath
    : convertFileSrc(media.absolutePath);
  return (
    <Card className="collection-card">
      <div className="media-preview">
        {media.mimeType.startsWith("image/") ? (
          <img src={src} alt={media.originalFilename} />
        ) : (
          <FileImage size={32} className="muted" />
        )}
      </div>
      <CardHeader
        title={media.originalFilename}
        onOpen={onClick}
        subtitle={dateTime(media.createdAt)}
        action={<Badge>{media.tradeCount} Trades</Badge>}
      />
      <CardContent>
        <div className="settings-row-copy">
          <span>
            {(media.sizeBytes / 1024 / 1024).toFixed(2)} MB · {media.mimeType}
          </span>
          <span title={media.sha256}>Hash: {media.sha256.slice(0, 14)}…</span>
        </div>
        <div className="collection-card-footer">
          <span>Original erhalten</span>
          <Button size="sm" onClick={onClick}>
            Öffnen & annotieren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AnnotationDialog({
  media,
  onOpenChange,
  onCloseAutoFocus,
}: {
  media?: MediaRecord;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const src = media
    ? media.absolutePath.startsWith("data:")
      ? media.absolutePath
      : convertFileSrc(media.absolutePath)
    : "";
  const query = useQuery({
    queryKey: ["media-annotation", media?.id],
    queryFn: () => api.mediaAnnotation(media!.id),
    enabled: Boolean(media),
  });
  const [image, setImage] = useState<HTMLImageElement>();
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [undoStack, setUndoStack] = useState<AnnotationShape[][]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationShape[][]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [textDraft, setTextDraft] = useState("Entry");
  const [color, setColor] = useState("#4c8dff");
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    if (!src) return;
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.src = src;
  }, [src]);
  useEffect(() => {
    if (!query.data) {
      setShapes([]);
      return;
    }
    try {
      const parsed = JSON.parse(query.data.annotationJson) as {
        shapes?: AnnotationShape[];
      };
      setShapes(parsed.shapes ?? []);
      setUndoStack([]);
      setRedoStack([]);
    } catch {
      setShapes([]);
    }
  }, [query.data, media?.id]);
  const commitShapes = (next: AnnotationShape[]) => {
    setUndoStack((stack) => [...stack.slice(-39), shapes]);
    setRedoStack([]);
    setShapes(next);
  };
  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((stack) => [...stack, shapes]);
    setUndoStack((stack) => stack.slice(0, -1));
    setShapes(previous);
  };
  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((stack) => [...stack, shapes]);
    setRedoStack((stack) => stack.slice(0, -1));
    setShapes(next);
  };
  const mutation = useMutation({
    mutationFn: () =>
      api.saveMediaAnnotation(media!.id, {
        version: 1,
        canvas: { width: 840, height: 480 },
        shapes,
      }),
    onSuccess: () =>
      toast.success(
        "Annotation gespeichert; das Originalbild blieb unverändert.",
      ),
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Annotation konnte nicht gespeichert werden.",
      ),
  });
  const updatePosition = (id: string, x: number, y: number) =>
    commitShapes(
      shapes.map((shape) => (shape.id === id ? { ...shape, x, y } : shape)),
    );
  const addRect = () => {
    const shape: AnnotationShape = {
      id: uid(),
      kind: "rect",
      x: 250,
      y: 150,
      width: 220,
      height: 120,
      color,
    };
    commitShapes([...shapes, shape]);
    setSelectedId(shape.id);
  };
  const addArrow = () => {
    const shape: AnnotationShape = {
      id: uid(),
      kind: "arrow",
      x: 230,
      y: 240,
      points: [0, 0, 220, -90],
      color,
    };
    commitShapes([...shapes, shape]);
    setSelectedId(shape.id);
  };
  const addText = () => {
    if (!textDraft.trim()) return;
    const shape: AnnotationShape = {
      id: uid(),
      kind: "text",
      x: 300,
      y: 90,
      text: textDraft.trim(),
      color,
    };
    commitShapes([...shapes, shape]);
    setSelectedId(shape.id);
  };
  const addCircle = () => {
    const shape: AnnotationShape = {
      id: uid(),
      kind: "circle",
      x: 400,
      y: 240,
      radius: 75,
      color,
    };
    commitShapes([...shapes, shape]);
    setSelectedId(shape.id);
  };
  const addLine = () => {
    const shape: AnnotationShape = {
      id: uid(),
      kind: "line",
      x: 250,
      y: 240,
      points: [0, 0, 230, 0],
      color,
    };
    commitShapes([...shapes, shape]);
    setSelectedId(shape.id);
  };
  const updateSelectedColor = (next: string) => {
    setColor(next);
    if (selectedId)
      commitShapes(
        shapes.map((shape) =>
          shape.id === selectedId ? { ...shape, color: next } : shape,
        ),
      );
  };
  const copyPreview = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.toBlob({
      callback: async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          toast.success("Annotierte Vorschau kopiert.");
        } catch {
          toast.error(
            "Bild konnte nicht in die Zwischenablage kopiert werden.",
          );
        }
      },
      pixelRatio: 2,
    });
  };
  return (
    <Dialog.Root open={Boolean(media)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide annotation-dialog"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                Chart annotieren
              </Dialog.Title>
              <div className="dialog-description">
                {media?.originalFilename} · Original bleibt unverändert
              </div>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Dialog schließen">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            <div className="annotation-toolbar">
              <Button onClick={addRect}>
                <Square size={14} /> Bereich
              </Button>
              <Button onClick={addArrow}>
                <ArrowRight size={14} /> Pfeil
              </Button>
              <Button onClick={addCircle}>
                <CircleIcon size={14} /> Kreis
              </Button>
              <Button onClick={addLine}>
                <Minus size={14} /> Linie
              </Button>
              <input
                className="input"
                aria-label="Annotationstext"
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value)}
                style={{ width: 170 }}
              />
              <Button onClick={addText}>
                <Type size={14} /> Text
              </Button>
              <input
                type="color"
                className="color-input"
                aria-label="Annotationsfarbe"
                value={color}
                onChange={(event) => updateSelectedColor(event.target.value)}
              />
              <Button
                size="icon"
                aria-label="Rückgängig"
                disabled={!undoStack.length}
                onClick={undo}
              >
                <Undo2 size={14} />
              </Button>
              <Button
                size="icon"
                aria-label="Wiederholen"
                disabled={!redoStack.length}
                onClick={redo}
              >
                <Redo2 size={14} />
              </Button>
              <Button onClick={copyPreview}>
                <Copy size={14} /> Kopieren
              </Button>
              <Button
                variant="danger"
                disabled={!selectedId}
                onClick={() => {
                  commitShapes(
                    shapes.filter((shape) => shape.id !== selectedId),
                  );
                  setSelectedId("");
                }}
              >
                <Trash2 size={14} /> Auswahl
              </Button>
            </div>
            <div className="annotation-stage-wrap">
              <Stage
                ref={stageRef}
                width={840}
                height={480}
                onMouseDown={(event) => {
                  if (event.target === event.target.getStage())
                    setSelectedId("");
                }}
              >
                <Layer>
                  <Rect width={840} height={480} fill="#050b14" />
                  <KonvaImage image={image} width={840} height={480} />
                  {shapes.map((shape) =>
                    shape.kind === "rect" ? (
                      <Rect
                        key={shape.id}
                        {...shape}
                        stroke={shape.color}
                        strokeWidth={selectedId === shape.id ? 5 : 3}
                        fill={`${shape.color}20`}
                        draggable
                        onClick={() => setSelectedId(shape.id)}
                        onDragEnd={(event) =>
                          updatePosition(
                            shape.id,
                            event.target.x(),
                            event.target.y(),
                          )
                        }
                      />
                    ) : shape.kind === "arrow" ? (
                      <Arrow
                        key={shape.id}
                        x={shape.x}
                        y={shape.y}
                        points={shape.points}
                        stroke={shape.color}
                        fill={shape.color}
                        strokeWidth={selectedId === shape.id ? 6 : 4}
                        pointerLength={12}
                        pointerWidth={12}
                        draggable
                        onClick={() => setSelectedId(shape.id)}
                        onDragEnd={(event) =>
                          updatePosition(
                            shape.id,
                            event.target.x(),
                            event.target.y(),
                          )
                        }
                      />
                    ) : shape.kind === "circle" ? (
                      <Circle
                        key={shape.id}
                        x={shape.x}
                        y={shape.y}
                        radius={shape.radius}
                        stroke={shape.color}
                        strokeWidth={selectedId === shape.id ? 5 : 3}
                        fill={`${shape.color}18`}
                        draggable
                        onClick={() => setSelectedId(shape.id)}
                        onDragEnd={(event) =>
                          updatePosition(
                            shape.id,
                            event.target.x(),
                            event.target.y(),
                          )
                        }
                      />
                    ) : shape.kind === "line" ? (
                      <Line
                        key={shape.id}
                        x={shape.x}
                        y={shape.y}
                        points={shape.points}
                        stroke={shape.color}
                        strokeWidth={selectedId === shape.id ? 6 : 4}
                        lineCap="round"
                        draggable
                        onClick={() => setSelectedId(shape.id)}
                        onDragEnd={(event) =>
                          updatePosition(
                            shape.id,
                            event.target.x(),
                            event.target.y(),
                          )
                        }
                      />
                    ) : (
                      <Text
                        key={shape.id}
                        x={shape.x}
                        y={shape.y}
                        text={shape.text}
                        fill={shape.color}
                        fontSize={24}
                        fontStyle="bold"
                        draggable
                        onClick={() => setSelectedId(shape.id)}
                        onDragEnd={(event) =>
                          updatePosition(
                            shape.id,
                            event.target.x(),
                            event.target.y(),
                          )
                        }
                      />
                    ),
                  )}
                </Layer>
              </Stage>
            </div>
          </div>
          <footer className="dialog-footer">
            <span className="muted">
              {shapes.length} Elemente · Original bleibt erhalten
            </span>
            <Button
              variant="primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Save size={14} /> Annotation speichern
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
