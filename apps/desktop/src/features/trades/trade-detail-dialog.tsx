import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  FileText,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  dateTime,
  formatMoneyMinor,
  formatR,
  toInputDateTime,
  fromInputDateTime,
} from "../../lib/utils";
import { api } from "../../services/commands";
import type {
  BootstrapData,
  CustomField,
  TradeContext,
  TradeDetail,
  TradeInput,
} from "../../types/domain";

export function TradeDetailDialog({
  tradeId,
  onOpenChange,
}: {
  tradeId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: () => api.getTrade(tradeId!),
    enabled: Boolean(tradeId),
  });
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const mistakeQuery = useQuery({
    queryKey: ["trade-mistakes", tradeId],
    queryFn: () => api.tradeMistakes(tradeId!),
    enabled: Boolean(tradeId),
  });
  const contextQuery = useQuery({
    queryKey: ["trade-context", tradeId],
    queryFn: () => api.tradeContext(tradeId!),
    enabled: Boolean(tradeId),
  });
  const customFieldQuery = useQuery({
    queryKey: ["custom-fields", "trade"],
    queryFn: () => api.customFields("trade"),
  });
  const allMediaQuery = useQuery({ queryKey: ["media"], queryFn: api.media });
  const tradeMediaQuery = useQuery({
    queryKey: ["trade-media", tradeId],
    queryFn: () => api.tradeMedia(tradeId!),
    enabled: Boolean(tradeId),
  });
  const [draft, setDraft] = useState<TradeDetail | null>(null);
  const [context, setContext] = useState<TradeContext | null>(null);
  const [mistakeId, setMistakeId] = useState("");
  const [mistakeSeverity, setMistakeSeverity] = useState(2);
  const [mistakeCost, setMistakeCost] = useState("");
  const [mistakeNote, setMistakeNote] = useState("");
  const [mediaId, setMediaId] = useState("");
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  useEffect(() => {
    if (contextQuery.data) setContext(contextQuery.data);
  }, [contextQuery.data]);
  useEffect(() => {
    if (!mistakeId && bootstrap.data?.mistakes[0])
      setMistakeId(bootstrap.data.mistakes[0].id);
  }, [bootstrap.data, mistakeId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["trades"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  };
  const save = useMutation({
    mutationFn: async () => {
      const trade = await api.updateTrade(tradeId!, toInput(draft!));
      if (context) {
        await api.saveTradeContext({
          tradeId: tradeId!,
          tagIds: context.tags.map((tag) => tag.id),
          legs: context.legs.map((leg) => ({
            ...leg,
            occurredAt: fromInputDateTime(leg.occurredAt) ?? leg.occurredAt,
          })),
          checklistItems: context.checklistItems.map((item) => ({
            ...item,
            label: item.label ?? item.labelSnapshot ?? "",
            category: item.category ?? item.categorySnapshot,
          })),
          emotions: context.emotions,
          customValues: context.customValues,
        });
      }
      return trade;
    },
    onSuccess: (trade) => {
      setDraft(trade);
      queryClient.invalidateQueries({ queryKey: ["trade-context", tradeId] });
      invalidate();
      toast.success("Änderungen gespeichert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Änderungen konnten nicht gespeichert werden.",
      ),
  });
  const duplicate = useMutation({
    mutationFn: () => api.duplicateTrade(tradeId!),
    onSuccess: () => {
      invalidate();
      toast.success("Trade als Entwurf dupliziert.");
    },
  });
  const trash = useMutation({
    mutationFn: () => api.trashTrade(tradeId!),
    onSuccess: () => {
      invalidate();
      toast.success("Trade in den Papierkorb verschoben.");
      onOpenChange(false);
    },
  });
  const assignMistake = useMutation({
    mutationFn: () =>
      api.assignTradeMistake({
        tradeId: tradeId!,
        mistakeId,
        severity: mistakeSeverity,
        estimatedCostMinor: mistakeCost
          ? Math.round(Number(mistakeCost.replace(",", ".")) * 100)
          : undefined,
        note: mistakeNote || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["trade-mistakes", tradeId],
        }),
        queryClient.invalidateQueries({ queryKey: ["mistake-analytics"] }),
      ]);
      setMistakeCost("");
      setMistakeNote("");
      toast.success("Fehler dem Trade zugeordnet.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Fehler konnte nicht zugeordnet werden."),
  });
  const attachMedia = useMutation({
    mutationFn: () => api.attachTradeMedia(tradeId!, mediaId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trade-media", tradeId] }),
        queryClient.invalidateQueries({ queryKey: ["media"] }),
      ]);
      setMediaId("");
      toast.success("Screenshot verknüpft.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Screenshot konnte nicht verknüpft werden."),
  });
  const detachMedia = useMutation({
    mutationFn: (removeId: string) => api.detachTradeMedia(tradeId!, removeId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trade-media", tradeId] }),
        queryClient.invalidateQueries({ queryKey: ["media"] }),
      ]);
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Verknüpfung konnte nicht entfernt werden."),
  });

  return (
    <Dialog.Root open={Boolean(tradeId)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content wide"
          aria-describedby={undefined}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                {draft?.instrument ?? "Trade wird geladen …"}
              </Dialog.Title>
              {draft && (
                <div className="dialog-description">
                  {dateTime(draft.openedAt)} ·{" "}
                  <Badge
                    className={
                      draft.direction === "long" ? "positive" : "negative"
                    }
                  >
                    {draft.direction.toUpperCase()}
                  </Badge>
                </div>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">
            {!draft ? (
              <div className="skeleton" style={{ height: 360 }} />
            ) : (
              <>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: "repeat(4, 1fr)",
                    marginBottom: 18,
                  }}
                >
                  <Metric
                    label="Netto-P&L"
                    value={formatMoneyMinor(draft.netPnlMinor)}
                    tone={
                      (draft.netPnlMinor ?? 0) >= 0 ? "positive" : "negative"
                    }
                  />
                  <Metric
                    label="Realisiertes R"
                    value={formatR(draft.calculatedR)}
                    tone={
                      (Number(draft.calculatedR) || 0) >= 0
                        ? "positive"
                        : "negative"
                    }
                  />
                  <Metric
                    label="Prozess-Score"
                    value={
                      draft.processScore ? `${draft.processScore} / 10` : "—"
                    }
                  />
                  <Metric label="Status" value={draft.status} />
                </div>
                <section className="form-section">
                  <h3 className="form-section-title">Trade bearbeiten</h3>
                  <div className="form-grid cols-3">
                    <EditField label="Instrument">
                      <input
                        className="input"
                        value={draft.instrument}
                        onChange={(event) =>
                          setDraft({ ...draft, instrument: event.target.value })
                        }
                      />
                    </EditField>
                    <EditField label="Richtung">
                      <select
                        className="select"
                        value={draft.direction}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            direction: event.target.value as "long" | "short",
                          })
                        }
                      >
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </EditField>
                    <EditField label="Status">
                      <select
                        className="select"
                        value={draft.status}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            status: event.target.value as TradeDetail["status"],
                          })
                        }
                      >
                        <option value="draft">Entwurf</option>
                        <option value="planned">Geplant</option>
                        <option value="open">Offen</option>
                        <option value="closed">Geschlossen</option>
                        <option value="cancelled">Storniert</option>
                        <option value="archived">Archiviert</option>
                      </select>
                    </EditField>
                    <EditField label="Entry">
                      <input
                        className="input"
                        value={draft.actualEntry ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            actualEntry: event.target.value,
                          })
                        }
                      />
                    </EditField>
                    <EditField label="Stop">
                      <input
                        className="input"
                        value={draft.initialStopLoss ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            initialStopLoss: event.target.value,
                          })
                        }
                      />
                    </EditField>
                    <EditField label="Exit">
                      <input
                        className="input"
                        value={draft.actualExit ?? ""}
                        onChange={(event) =>
                          setDraft({ ...draft, actualExit: event.target.value })
                        }
                      />
                    </EditField>
                    <EditField label="Prozess-Score">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max="10"
                        value={draft.processScore ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            processScore: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </EditField>
                    <EditField label="Plan eingehalten">
                      <select
                        className="select"
                        value={
                          draft.followedPlan == null
                            ? ""
                            : String(draft.followedPlan)
                        }
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            followedPlan:
                              event.target.value === ""
                                ? null
                                : event.target.value === "true",
                          })
                        }
                      >
                        <option value="">Nicht bewertet</option>
                        <option value="true">Ja</option>
                        <option value="false">Nein</option>
                      </select>
                    </EditField>
                    <EditField label="Review abgeschlossen">
                      <select
                        className="select"
                        value={draft.reviewedAt ? "true" : "false"}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            reviewedAt:
                              event.target.value === "true"
                                ? new Date().toISOString()
                                : null,
                          })
                        }
                      >
                        <option value="false">Nein</option>
                        <option value="true">Ja</option>
                      </select>
                    </EditField>
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section-title">These & Review</h3>
                  <div className="form-grid">
                    <EditField label="These">
                      <textarea
                        className="textarea"
                        value={draft.thesisHtml ?? ""}
                        onChange={(event) =>
                          setDraft({ ...draft, thesisHtml: event.target.value })
                        }
                      />
                    </EditField>
                    <EditField label="Review-Notizen">
                      <textarea
                        className="textarea"
                        value={draft.reviewNotesHtml ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            reviewNotesHtml: event.target.value,
                          })
                        }
                      />
                    </EditField>
                  </div>
                </section>
                {context && (
                  <JournalContextEditor
                    context={context}
                    onChange={setContext}
                    bootstrap={bootstrap.data}
                    customFields={customFieldQuery.data ?? []}
                  />
                )}
                <section className="form-section">
                  <h3 className="form-section-title">Screenshots</h3>
                  {tradeMediaQuery.data?.length ? (
                    <div className="chip-list" style={{ marginBottom: 12 }}>
                      {tradeMediaQuery.data.map((media) => (
                        <Badge key={media.id} className="primary">
                          {media.originalFilename}
                          <button
                            type="button"
                            className="badge-remove"
                            aria-label={`${media.originalFilename} lösen`}
                            onClick={() => detachMedia.mutate(media.id)}
                          >
                            <X size={10} />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ marginBottom: 12 }}>
                      Noch kein Screenshot mit diesem Trade verknüpft.
                    </div>
                  )}
                  <div className="page-actions">
                    <select
                      className="select"
                      value={mediaId}
                      onChange={(event) => setMediaId(event.target.value)}
                    >
                      <option value="">Screenshot auswählen</option>
                      {allMediaQuery.data
                        ?.filter(
                          (media) =>
                            !tradeMediaQuery.data?.some(
                              (linked) => linked.id === media.id,
                            ),
                        )
                        .map((media) => (
                          <option key={media.id} value={media.id}>
                            {media.originalFilename}
                          </option>
                        ))}
                    </select>
                    <Button
                      disabled={!mediaId || attachMedia.isPending}
                      onClick={() => attachMedia.mutate()}
                    >
                      <Plus size={13} /> Verknüpfen
                    </Button>
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section-title">
                    <AlertTriangle size={15} /> Fehler & Gegenmaßnahmen
                  </h3>
                  {mistakeQuery.data?.length ? (
                    <div className="chip-list" style={{ marginBottom: 14 }}>
                      {mistakeQuery.data.map((mistake) => (
                        <Badge key={mistake.mistakeId} className="negative">
                          {mistake.name} · Schwere {mistake.severity}
                          {mistake.estimatedCostMinor
                            ? ` · ${formatMoneyMinor(mistake.estimatedCostMinor)}`
                            : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="muted"
                      style={{ marginBottom: 14, fontSize: 10 }}
                    >
                      Noch kein Fehler zugeordnet.
                    </div>
                  )}
                  <div className="form-grid cols-3">
                    <EditField label="Fehlertyp">
                      <select
                        className="select"
                        value={mistakeId}
                        onChange={(event) => setMistakeId(event.target.value)}
                      >
                        {bootstrap.data?.mistakes.map((mistake) => (
                          <option key={mistake.id} value={mistake.id}>
                            {mistake.name}
                          </option>
                        ))}
                      </select>
                    </EditField>
                    <EditField label={`Schweregrad: ${mistakeSeverity} / 5`}>
                      <input
                        className="range"
                        type="range"
                        min="1"
                        max="5"
                        value={mistakeSeverity}
                        onChange={(event) =>
                          setMistakeSeverity(Number(event.target.value))
                        }
                      />
                    </EditField>
                    <EditField label="Geschätzte Kosten (€)">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={mistakeCost}
                        onChange={(event) => setMistakeCost(event.target.value)}
                        placeholder="0,00"
                      />
                    </EditField>
                  </div>
                  <EditField label="Notiz / Gegenmaßnahme">
                    <textarea
                      className="textarea"
                      value={mistakeNote}
                      onChange={(event) => setMistakeNote(event.target.value)}
                      placeholder="Was ist passiert und wie verhinderst du es beim nächsten Mal?"
                    />
                  </EditField>
                  <Button
                    style={{ marginTop: 10 }}
                    disabled={!mistakeId || assignMistake.isPending}
                    onClick={() => assignMistake.mutate()}
                  >
                    <Plus size={14} /> Fehler zuordnen
                  </Button>
                </section>
              </>
            )}
          </div>
          <footer className="dialog-footer">
            <div className="page-actions">
              <Button
                variant="danger"
                onClick={() => trash.mutate()}
                disabled={!draft || trash.isPending}
              >
                <Trash2 size={14} /> Papierkorb
              </Button>
              <Button
                onClick={() => duplicate.mutate()}
                disabled={!draft || duplicate.isPending}
              >
                <Copy size={14} /> Duplizieren
              </Button>
              <Button
                disabled={!draft}
                onClick={async () => {
                  if (!draft) return;
                  try {
                    const saved =
                      await import("../import-export/document-exports").then(
                        (module) => module.exportSingleTradePdf(draft),
                      );
                    if (saved)
                      toast.success("Trade-Bericht als PDF gespeichert.");
                  } catch {
                    toast.error("PDF konnte nicht erstellt werden.");
                  }
                }}
              >
                <FileText size={14} /> PDF
              </Button>
            </div>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={!draft || save.isPending}
            >
              <Save size={14} />{" "}
              {save.isPending ? "Speichert …" : "Änderungen speichern"}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function JournalContextEditor({
  context,
  onChange,
  bootstrap,
  customFields,
}: {
  context: TradeContext;
  onChange: (context: TradeContext) => void;
  bootstrap?: BootstrapData;
  customFields: CustomField[];
}) {
  const updateLeg = (
    index: number,
    patch: Partial<TradeContext["legs"][number]>,
  ) =>
    onChange({
      ...context,
      legs: context.legs.map((leg, legIndex) =>
        legIndex === index ? { ...leg, ...patch } : leg,
      ),
    });
  const setEmotion = (
    phase: "before" | "during" | "after",
    emotionId: string,
  ) => {
    const remaining = context.emotions.filter(
      (emotion) => emotion.phase !== phase,
    );
    onChange({
      ...context,
      emotions: emotionId
        ? [...remaining, { emotionId, phase, intensity: 5 }]
        : remaining,
    });
  };
  const setCustomValue = (customFieldId: string, value: unknown) => {
    const values = context.customValues.filter(
      (item) => item.customFieldId !== customFieldId,
    );
    if (value !== "" && value != null)
      values.push({ customFieldId, valueJson: JSON.stringify(value) });
    onChange({ ...context, customValues: values });
  };
  return (
    <section className="form-section">
      <h3 className="form-section-title">Journal-Kontext</h3>
      <EditField label="Tags">
        <div className="chip-list">
          {bootstrap?.tags.map((tag) => {
            const selected = context.tags.some((item) => item.id === tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                className={`tag-toggle${selected ? " selected" : ""}`}
                onClick={() =>
                  onChange({
                    ...context,
                    tags: selected
                      ? context.tags.filter((item) => item.id !== tag.id)
                      : [...context.tags, tag],
                  })
                }
              >
                <span style={{ background: tag.color }} />
                {tag.name}
              </button>
            );
          })}
          {!bootstrap?.tags.length && (
            <span className="muted">
              Tags legst du in den Einstellungen an.
            </span>
          )}
        </div>
      </EditField>
      <div style={{ marginTop: 16 }}>
        <div className="field-label-row">
          <label>Teilpositionen</label>
          <Button
            size="sm"
            type="button"
            onClick={() =>
              onChange({
                ...context,
                legs: [
                  ...context.legs,
                  {
                    legType: "entry",
                    occurredAt: toInputDateTime(new Date().toISOString()),
                    price: "",
                    quantity: "",
                    feesMinor: 0,
                    sortOrder: context.legs.length,
                  },
                ],
              })
            }
          >
            <Plus size={12} /> Leg hinzufügen
          </Button>
        </div>
        {context.legs.map((leg, index) => (
          <div className="context-row" key={leg.id ?? index}>
            <select
              className="select"
              aria-label="Leg-Typ"
              value={leg.legType}
              onChange={(event) =>
                updateLeg(index, {
                  legType: event.target.value as "entry" | "exit",
                })
              }
            >
              <option value="entry">Entry</option>
              <option value="exit">Exit</option>
            </select>
            <input
              className="input"
              aria-label="Zeitpunkt"
              type="datetime-local"
              value={toInputDateTime(leg.occurredAt)}
              onChange={(event) =>
                updateLeg(index, { occurredAt: event.target.value })
              }
            />
            <input
              className="input"
              aria-label="Preis"
              placeholder="Preis"
              value={leg.price}
              onChange={(event) =>
                updateLeg(index, { price: event.target.value })
              }
            />
            <input
              className="input"
              aria-label="Größe"
              placeholder="Größe"
              value={leg.quantity}
              onChange={(event) =>
                updateLeg(index, { quantity: event.target.value })
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Leg entfernen"
              onClick={() =>
                onChange({
                  ...context,
                  legs: context.legs.filter(
                    (_, legIndex) => legIndex !== index,
                  ),
                })
              }
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
        {!context.legs.length && (
          <div className="muted" style={{ fontSize: 10 }}>
            Noch keine Teilposition erfasst.
          </div>
        )}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", marginTop: 18 }}
      >
        <div>
          <label>Checklisten-Snapshot</label>
          <div className="checklist-panel">
            {context.checklistItems.map((item, index) => (
              <label key={item.id ?? index} className="checklist-line">
                <input
                  type="checkbox"
                  checked={Boolean(item.isChecked)}
                  onChange={(event) =>
                    onChange({
                      ...context,
                      checklistItems: context.checklistItems.map(
                        (row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, isChecked: event.target.checked }
                            : row,
                      ),
                    })
                  }
                />
                <span>{item.label ?? item.labelSnapshot}</span>
                {item.isRequired && <Badge className="warning">Pflicht</Badge>}
              </label>
            ))}
            {!context.checklistItems.length && (
              <span className="muted">Kein Snapshot vorhanden.</span>
            )}
          </div>
        </div>
        <div>
          <label>Emotionen</label>
          {(["before", "during", "after"] as const).map((phase) => {
            const current = context.emotions.find(
              (emotion) => emotion.phase === phase,
            );
            return (
              <div className="context-emotion" key={phase}>
                <span>
                  {phase === "before"
                    ? "Vorher"
                    : phase === "during"
                      ? "Währenddessen"
                      : "Danach"}
                </span>
                <select
                  className="select"
                  value={current?.emotionId ?? ""}
                  onChange={(event) => setEmotion(phase, event.target.value)}
                >
                  <option value="">Nicht bewertet</option>
                  {bootstrap?.emotions.map((emotion) => (
                    <option key={emotion.id} value={emotion.id}>
                      {emotion.name}
                    </option>
                  ))}
                </select>
                {current && (
                  <input
                    className="input"
                    aria-label={`Intensität ${phase}`}
                    type="number"
                    min="1"
                    max="10"
                    value={current.intensity}
                    onChange={(event) =>
                      onChange({
                        ...context,
                        emotions: context.emotions.map((emotion) =>
                          emotion.phase === phase
                            ? {
                                ...emotion,
                                intensity: Number(event.target.value),
                              }
                            : emotion,
                        ),
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {customFields.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <label>Eigene Felder</label>
          <div className="form-grid cols-3" style={{ marginTop: 9 }}>
            {customFields.map((field) => (
              <CustomFieldControl
                key={field.id}
                field={field}
                valueJson={
                  context.customValues.find(
                    (item) => item.customFieldId === field.id,
                  )?.valueJson
                }
                onChange={(value) => setCustomValue(field.id, value)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CustomFieldControl({
  field,
  valueJson,
  onChange,
}: {
  field: CustomField;
  valueJson?: string;
  onChange: (value: unknown) => void;
}) {
  const value: unknown = (() => {
    try {
      return valueJson == null ? "" : JSON.parse(valueJson);
    } catch {
      return valueJson ?? "";
    }
  })();
  const options = (() => {
    try {
      const parsed = JSON.parse(field.optionsJson);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();
  if (field.fieldType === "boolean")
    return (
      <EditField label={field.name}>
        <select
          className="select"
          value={value === "" ? "" : String(value)}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? "" : event.target.value === "true",
            )
          }
        >
          <option value="">Nicht gesetzt</option>
          <option value="true">Ja</option>
          <option value="false">Nein</option>
        </select>
      </EditField>
    );
  if (field.fieldType === "select")
    return (
      <EditField label={field.name}>
        <select
          className="select"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Nicht gesetzt</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </EditField>
    );
  return (
    <EditField label={field.name}>
      <input
        className="input"
        type={
          field.fieldType === "number"
            ? "number"
            : field.fieldType === "date"
              ? "date"
              : "text"
        }
        value={String(value ?? "")}
        onChange={(event) =>
          onChange(
            field.fieldType === "number"
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </EditField>
  );
}

function toInput(trade: TradeDetail): TradeInput {
  const input = { ...trade } as Partial<TradeDetail>;
  delete input.id;
  delete input.calculatedR;
  delete input.createdAt;
  delete input.updatedAt;
  return input as TradeInput;
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="muted" style={{ fontSize: 9 }}>
        {label}
      </div>
      <div
        className={tone ? `${tone}-text` : ""}
        style={{
          fontSize: 17,
          fontWeight: 750,
          marginTop: 7,
          textTransform: label === "Status" ? "capitalize" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
function EditField({
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
