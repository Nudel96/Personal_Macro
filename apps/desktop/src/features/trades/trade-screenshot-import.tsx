import {
  ClipboardPaste,
  ImagePlus,
  LoaderCircle,
  ScanText,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { supportsPrivateWebCommand } from "../../services/private-web-client";
import type { TradeScreenshotInput } from "../../types/domain";
import { readScreenshotColors } from "./trade-screenshot-colors";
import {
  parseTradeScreenshot,
  screenshotFieldLabels,
  screenshotFormPatch,
  type ParsedTradeScreenshot,
  type ScreenshotFieldKey,
  type ScreenshotValues,
} from "./trade-screenshot-parser";
import "./trade-screenshot.css";

export interface ScreenshotReview {
  assetClass?: string;
  source: "tradingview-screenshot";
  quantityUnit: string;
  sourceQuantity?: string;
  unitsPerLot?: number;
  sourceCurrency: string;
  fields: ScreenshotValues;
}

interface Props {
  accountCurrency: string;
  disabled?: boolean;
  onImageChange: (image: TradeScreenshotInput | null) => void;
  onApply: (values: ScreenshotValues, review: ScreenshotReview) => void;
  onBusyChange: (busy: boolean) => void;
}

export function TradeScreenshotImport({
  accountCurrency,
  disabled,
  onImageChange,
  onApply,
  onBusyChange,
}: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [image, setImage] = useState<TradeScreenshotInput | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ParsedTradeScreenshot | null>(null);
  const [values, setValues] = useState<ScreenshotValues>({});
  const [selected, setSelected] = useState<ScreenshotFieldKey[]>([]);
  const [status, setStatus] = useState("draft");
  const [direction, setDirection] = useState("");
  const [unit, setUnit] =
    useState<ParsedTradeScreenshot["quantityUnit"]>("unknown");
  const [currency, setCurrency] = useState("");
  const [unitsPerLot, setUnitsPerLot] = useState("100000");
  const [applied, setApplied] = useState(false);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  async function readFile(file: File) {
    if (disabled) return;
    const run = ++generation.current;
    setError("");
    setApplied(false);
    setResult(null);
    setImage(null);
    setPreview("");
    onImageChange(null);
    if (
      !/\.(png|jpe?g)$/i.test(file.name) &&
      !["image/png", "image/jpeg"].includes(file.type)
    ) {
      setError("Bitte einen PNG- oder JPEG-Screenshot auswählen.");
      setBusy(false);
      onBusyChange(false);
      return;
    }
    const limit = isPrivateWeb() ? 3 : 12;
    if (!file.size || file.size > limit * 1024 * 1024) {
      setError(`Der Screenshot ist leer oder größer als ${limit} MiB.`);
      setBusy(false);
      onBusyChange(false);
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Die Bilddatei konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
      });
      if (run !== generation.current) return;
      const screenshot = {
        filename: file.name || "TradingView.png",
        base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      };
      setImage(screenshot);
      setPreview(dataUrl);
      onImageChange(screenshot);
      const analysis = await api.analyzeTradeScreenshot(screenshot);
      if (run !== generation.current) return;
      const colored = await readScreenshotColors(
        analysis,
        dataUrl,
        api.analyzeTradeScreenshot,
      );
      if (run !== generation.current) return;
      const parsed = parseTradeScreenshot(colored);
      setResult(parsed);
      setValues(
        Object.fromEntries(
          Object.entries(parsed.fields).map(([key, finding]) => [
            key,
            finding.value,
          ]),
        ),
      );
      setSelected(
        Object.keys(parsed.fields).filter(
          (key) => !["status", "direction"].includes(key),
        ) as ScreenshotFieldKey[],
      );
      setStatus(parsed.fields.status?.value ?? "draft");
      setDirection(parsed.fields.direction?.value ?? "");
      setUnit(parsed.quantityUnit);
      setCurrency(parsed.currency ?? "");
      setUnitsPerLot("100000");
    } catch (caught) {
      if (run === generation.current) {
        setError(
          (caught as Error).message ||
            "Der Screenshot konnte nicht ausgelesen werden.",
        );
        if ((caught as { code?: string }).code === "VALIDATION_ERROR") {
          setImage(null);
          setPreview("");
          onImageChange(null);
        }
      }
    } finally {
      if (run === generation.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  function receive(files: File[]) {
    const images = files.filter(
      (file) =>
        file.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(file.name),
    );
    if (images.length !== 1) {
      setError("Bitte genau einen Screenshot mit einer Position einfügen.");
      return;
    }
    void readFile(images[0]);
  }
  function paste(event: ClipboardEvent) {
    if (disabled) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      receive(files);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    if (!disabled) receive(Array.from(event.dataTransfer.files));
  }
  async function pasteButton() {
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((entry) =>
        entry.types.some((type) => ["image/png", "image/jpeg"].includes(type)),
      );
      const type = item?.types.find((value) =>
        ["image/png", "image/jpeg"].includes(value),
      );
      if (!item || !type) {
        setError(
          "Kein Bild in der Zwischenablage. In TradingView einen Screenshot kopieren und hier Strg+V drücken.",
        );
        return;
      }
      const blob = await item.getType(type);
      await readFile(
        new File(
          [blob],
          type === "image/png" ? "TradingView.png" : "TradingView.jpg",
          { type },
        ),
      );
    } catch {
      setError(
        "Bitte diesen Bereich anklicken und den Screenshot mit Strg+V einfügen.",
      );
    }
  }

  const wantsQuantity = selected.includes("quantity");
  const wantsRisk = selected.includes("plannedRisk");
  const convertUnits =
    wantsQuantity && unit === "units" && result?.assetClass === "forex";
  const validValues = selected.every((key) => {
    const value = values[key]?.trim();
    return (
      value &&
      (key === "instrument"
        ? value.length >= 2 && value.length <= 32
        : key === "timeframe" ||
          (Number.isFinite(Number(value)) &&
            Number(value) > 0 &&
            (key !== "riskPercent" || Number(value) <= 100)))
    );
  });
  const canApply =
    !disabled &&
    !busy &&
    result &&
    direction &&
    validValues &&
    (!wantsQuantity || unit !== "unknown") &&
    (!wantsRisk || currency === accountCurrency) &&
    (!convertUnits || Number(unitsPerLot) > 0);
  function apply() {
    if (!canApply || !result) return;
    const fields = Object.fromEntries(
      selected.map((key) => [key, values[key]]),
    ) as ScreenshotValues;
    fields.direction = direction;
    if (convertUnits)
      fields.quantity = String(Number(fields.quantity) / Number(unitsPerLot));
    const patch = screenshotFormPatch(fields, status);
    onApply(patch, {
      source: "tradingview-screenshot",
      assetClass: result.assetClass,
      quantityUnit: convertUnits ? "lots" : unit,
      sourceQuantity: values.quantity,
      unitsPerLot: convertUnits ? Number(unitsPerLot) : undefined,
      sourceCurrency: currency,
      fields: patch,
    });
    setApplied(true);
  }

  if (
    !isTauri() &&
    (!isPrivateWeb() ||
      !supportsPrivateWebCommand("create_trade_with_screenshot"))
  )
    return (
      <section className="screenshot-import">
        <strong>
          <ScanText size={16} /> Trade aus Screenshot
        </strong>
        <p className="muted">
          TradingView-Screenshots lassen sich in der Windows-Desktop-App lokal
          auslesen und am Trade speichern.
        </p>
      </section>
    );

  return (
    <section
      className="screenshot-import"
      aria-label="Trade aus Screenshot"
      onPaste={paste}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      tabIndex={0}
    >
      <div className="screenshot-import-heading">
        <div>
          <strong>
            <ScanText size={17} /> Trade aus Screenshot
          </strong>
          <p className="muted">
            {isPrivateWeb()
              ? "Bild auswählen oder einfügen. Die Erkennung erfolgt auf diesem Gerät; beim Speichern kommt das Original in deinen privaten Bildspeicher."
              : "TradingView-Bild hier ablegen oder mit Strg+V einfügen. Die Erkennung bleibt lokal."}
          </p>
        </div>
        <div className="page-actions">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={15} /> Screenshot auswählen
          </Button>
          <Button
            type="button"
            disabled={disabled}
            onClick={() => void pasteButton()}
            aria-label="Screenshot aus Zwischenablage einfügen"
          >
            <ClipboardPaste size={15} />
          </Button>
        </div>
      </div>
      <input
        ref={input}
        aria-label="Screenshot-Datei"
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
          event.target.value = "";
        }}
      />
      {!image && !error && (
        <p className="form-section-copy">
          Am besten eine einzelne Position mit sichtbaren Preislabels, Stop,
          Ziel und Mengenangabe aufnehmen. PNG / JPEG · bis{" "}
          {isPrivateWeb() ? 3 : 12} MiB.
        </p>
      )}
      {image && (
        <div className="screenshot-import-preview">
          <img
            src={preview}
            alt="Ausgewählter TradingView-Screenshot zur Prüfung"
          />
          <div>
            <strong>{image.filename}</strong>
            <p className="muted">
              Wird beim Speichern mit diesem Trade verknüpft.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled}
            aria-label="Screenshot entfernen"
            onClick={() => {
              generation.current++;
              setBusy(false);
              onBusyChange(false);
              setImage(null);
              setPreview("");
              setResult(null);
              setError("");
              onImageChange(null);
            }}
          >
            <X size={15} />
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="screenshot-import-status">
          <LoaderCircle size={16} className="animate-spin" /> Screenshot wird
          lokal ausgelesen …
        </p>
      )}
      {image && (
        <details className="screenshot-import-notes screenshot-import-original">
          <summary>Screenshot in Originalgröße ansehen</summary>
          <div>
            <img src={preview} alt="Screenshot in Originalgröße" />
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="screenshot-import-warning">
          {error}
          {image &&
            " Du kannst die Trade-Felder manuell ausfüllen und das Bild trotzdem speichern."}
        </p>
      )}
      {result && applied && (
        <div className="screenshot-import-footer">
          <span role="status">
            Werte im Formular übernommen. Du kannst sie dort weiter bearbeiten.
          </span>
          <Button
            type="button"
            disabled={disabled}
            onClick={() => setApplied(false)}
          >
            Erkennung erneut prüfen
          </Button>
        </div>
      )}
      {result && !applied && (
        <>
          <p className="form-section-copy">
            Erkannte Werte prüfen. Markierte Felder ersetzen beim Übernehmen die
            bisherigen Formulareingaben.
          </p>
          <div className="screenshot-import-fields">
            {(Object.keys(screenshotFieldLabels) as ScreenshotFieldKey[])
              .filter((key) => !["status", "direction"].includes(key))
              .map((key) => {
                const finding = result.fields[key];
                return (
                  <div className="screenshot-import-field" key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(key)}
                        disabled={!finding || disabled}
                        onChange={(event) => {
                          setApplied(false);
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, key]
                              : current.filter((item) => item !== key),
                          );
                        }}
                      />
                      {screenshotFieldLabels[key]}
                    </label>
                    {finding ? (
                      <input
                        className="input"
                        aria-label={`Erkannt: ${screenshotFieldLabels[key]}`}
                        value={values[key] ?? ""}
                        disabled={disabled}
                        onChange={(event) => {
                          setApplied(false);
                          setValues((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }));
                        }}
                      />
                    ) : (
                      <span className="muted">Nicht erkannt</span>
                    )}
                    {finding && (
                      <small title={finding.evidence}>
                        {finding.derived ? "Abgeleitet · " : "Gelesen · "}
                        {finding.evidence}
                      </small>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="form-grid cols-3">
            <div className="field">
              <label htmlFor={`${id}-direction`}>Richtung prüfen</label>
              <select
                className="select"
                id={`${id}-direction`}
                value={direction}
                disabled={disabled}
                onChange={(event) => {
                  setDirection(event.target.value);
                  setApplied(false);
                }}
              >
                <option value="">Bitte auswählen</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-status`}>Trade-Status prüfen</label>
              <select
                className="select"
                id={`${id}-status`}
                value={status}
                disabled={disabled}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setApplied(false);
                }}
              >
                <option value="draft">Entwurf</option>
                <option value="planned">Geplant</option>
                <option value="open">Offen</option>
                <option value="closed">Geschlossen</option>
              </select>
            </div>
            {wantsQuantity && (
              <div className="field">
                <label htmlFor={`${id}-unit`}>
                  Einheit der gelesenen Menge
                </label>
                <select
                  className="select"
                  id={`${id}-unit`}
                  value={unit}
                  disabled={disabled}
                  onChange={(event) => {
                    setUnit(event.target.value as typeof unit);
                    setApplied(false);
                  }}
                >
                  <option value="unknown">Bitte auswählen</option>
                  <option value="lots">Lots</option>
                  <option value="units">Einheiten</option>
                  <option value="contracts">Kontrakte</option>
                </select>
              </div>
            )}
            {convertUnits && (
              <div className="field">
                <label htmlFor={`${id}-lot`}>
                  Einheiten je Lot (Broker prüfen)
                </label>
                <input
                  className="input"
                  id={`${id}-lot`}
                  value={unitsPerLot}
                  disabled={disabled}
                  onChange={(event) => {
                    setUnitsPerLot(event.target.value);
                    setApplied(false);
                  }}
                />
                <small>
                  Übernahme: {Number(values.quantity) / Number(unitsPerLot)}{" "}
                  Lots
                </small>
              </div>
            )}
            {wantsRisk && (
              <div className="field">
                <label htmlFor={`${id}-currency`}>
                  Währung des Risikobetrags
                </label>
                <select
                  className="select"
                  id={`${id}-currency`}
                  value={currency}
                  disabled={disabled}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setApplied(false);
                  }}
                >
                  <option value="">Bitte prüfen</option>
                  {[
                    ...new Set(
                      [
                        accountCurrency,
                        "USD",
                        "EUR",
                        "GBP",
                        "JPY",
                        "CHF",
                        "CAD",
                        "AUD",
                        "NZD",
                        currency,
                      ].filter(Boolean),
                    ),
                  ].map((item) => (
                    <option key={item} value={item}>
                      {item}
                      {item === accountCurrency ? " (Kontowährung)" : ""}
                    </option>
                  ))}
                </select>
                {currency && currency !== accountCurrency && (
                  <small>
                    Abweichende Währung: Risiko abwählen oder vorher in{" "}
                    {accountCurrency} umrechnen und den Wert korrigieren.
                  </small>
                )}
              </div>
            )}
          </div>
          {result.warnings.length > 0 && (
            <details className="screenshot-import-notes">
              <summary>
                Hinweise zur Erkennung ({result.warnings.length})
              </summary>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="screenshot-import-footer">
            <Button
              type="button"
              variant="primary"
              disabled={!canApply}
              onClick={apply}
            >
              Geprüfte Werte übernehmen
            </Button>
            <span role="status" className="muted">
              {applied
                ? "Werte im Formular übernommen. Du kannst sie dort weiter bearbeiten."
                : "Der Trade wird erst mit dem Formular gespeichert."}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
