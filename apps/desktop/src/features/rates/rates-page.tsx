import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CirclePercent,
  DatabaseZap,
  ExternalLink,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { DataStatusStrip } from "../../components/ui/data-status-strip";
import { dateTime, number } from "../../lib/utils";
import { api } from "../../services/commands";
export function RatesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["rates"],
    queryFn: api.policyRates,
    refetchInterval: 60_000,
  });
  const syncMutation = useMutation({
    mutationFn: api.syncPolicyRates,
    onSuccess: (dashboard) => {
      queryClient.setQueryData(["rates"], dashboard);
      toast.success("Alle verfügbaren Leitzinsen wurden aktualisiert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Leitzinsen konnten nicht aktualisiert werden.",
      ),
  });
  if (query.isLoading)
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="page">
        <ErrorState message="Leitzinsdaten konnten nicht geladen werden." />
      </div>
    );
  const data = query.data;
  const automation = data.automation ?? {
    enabled: false,
    coveredCurrencies: 0,
    expectedCurrencies: 9,
    refreshIntervalHours: 6,
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Marktkontext"
        title="Leitzinsen"
        description="Erwartete Zentralbankentscheidungen und relative USD-Wirkung im globalen Zinsumfeld."
        actions={
          <>
            <Badge className={data.snapshotAt ? "positive" : "warning"}>
              <DatabaseZap size={11} />{" "}
              {automation.enabled
                ? `Automatisch · ${automation.coveredCurrencies}/${automation.expectedCurrencies}`
                : data.snapshotAt
                  ? "Lokaler Snapshot"
                  : "Keine Daten"}
            </Badge>
            <Button
              variant="primary"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !automation.enabled}
            >
              <RefreshCw size={14} /> Jetzt aktualisieren
            </Button>
          </>
        }
      />
      <DataStatusStrip
        status={
          automation.enabled
            ? "Automatische Leitzins-Aktualisierung aktiv"
            : data.snapshotAt
              ? "Lokaler Zins-Snapshot"
              : "Keine Zinsdaten"
        }
        quality={
          automation.lastStatus === "failed"
            ? "Letzter Abruf fehlgeschlagen"
            : `${automation.coveredCurrencies} von ${automation.expectedCurrencies} Währungen abgedeckt`
        }
        detail={
          automation.lastSuccessAt
            ? `Zuletzt erfolgreich: ${dateTime(automation.lastSuccessAt)} · automatisch alle ${automation.refreshIntervalHours} Stunden`
            : data.snapshotAt
              ? "Erwartungen und Quellen prüfen"
              : "Der erste automatische Abruf startet in der Desktop-App."
        }
        action={
          <Button
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !automation.enabled}
          >
            <RefreshCw size={13} /> Aktualisieren
          </Button>
        }
      />
      {automation.errorMessage ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          Der letzte automatische Abruf ist fehlgeschlagen. Die zuletzt
          bestätigten Istwerte bleiben sichtbar. {automation.errorMessage}
        </div>
      ) : null}
      <div
        className="grid"
        style={{ gridTemplateColumns: "1.1fr .9fr", marginBottom: 14 }}
      >
        <Card>
          <CardHeader
            title="USD-Relativwirkung"
            subtitle="Fed-Erwartung abzüglich gewichteter ausländischer Zentralbankerwartung"
            action={<Info size={14} className="muted" />}
          />
          <CardContent>
            {data.usdRelative.availabilityStatus === "available" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px 1fr",
                  gap: 25,
                  alignItems: "center",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: 150,
                      height: 150,
                      margin: "0 auto",
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background:
                        "conic-gradient(var(--primary) 0 70%, #142239 70%)",
                      padding: 11,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "50%",
                        background: "#0b1628",
                      }}
                    >
                      <div>
                        <div
                          className={signalClass(
                            data.usdRelative.relativeSignal,
                          )}
                          style={{ fontSize: 25, fontWeight: 800 }}
                        >
                          {bps(data.usdRelative.relativeStanceBps)}
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 9, marginTop: 4 }}
                        >
                          USD relativ
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <RateMetric
                    label="Auslandskorb"
                    value={bps(data.usdRelative.foreignPressureBps)}
                  />
                  <RateMetric
                    label="Abdeckung"
                    value={`${data.usdRelative.coveredCentralBanks} / ${data.usdRelative.requiredCentralBanks} Zentralbanken`}
                  />
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: "repeat(3, 1fr)",
                      marginTop: 14,
                    }}
                  >
                    <Mini
                      label="Hikes"
                      value={data.usdRelative.hikeCount}
                      tone="positive"
                    />
                    <Mini label="Holds" value={data.usdRelative.holdCount} />
                    <Mini
                      label="Cuts"
                      value={data.usdRelative.cutCount}
                      tone="negative"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={CirclePercent}
                title={
                  data.usdRelative.availabilityStatus ===
                  "insufficient_coverage"
                    ? "Zu geringe Auslandsabdeckung"
                    : "Keine USD-Relativbewertung"
                }
                description={`Für eine Bewertung werden eine nutzbare USD-Erwartung und mindestens ${data.usdRelative.requiredCentralBanks} ausländische Zentralbanken benötigt. Vorhanden: ${data.usdRelative.coveredCentralBanks}.`}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Modellinterpretation"
            subtitle="Warum globale Hikes den USD-Effekt abschwächen"
          />
          <CardContent>
            <div className="notice">
              Eine Fed-Erhöhung ist nicht isoliert gleich stark bullish. Wenn
              der gewichtete Auslandskorb ebenfalls um 25 bp anzieht, beträgt
              die relative USD-Stance 0 bp. Holds können relativ bearish sein,
              wenn ein großer Teil der Welt gleichzeitig strafft.
            </div>
            <div style={{ marginTop: 17 }}>
              <RateMetric label="Formel" value="Fed Δbp − Ausland Δbp" />
              <RateMetric
                label="Fehlende Forecasts"
                value="Unavailable, nicht neutral"
              />
              <RateMetric
                label="Qualitätsregel"
                value="Amtliche Istwerte + aktuelle Marktquelle"
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Zins-Heatmap"
          subtitle={
            data.snapshotAt
              ? `${data.sourceName} · Stand ${dateTime(data.snapshotAt)}`
              : "Actual, Erwartung und Überraschung je Zentralbank"
          }
        />
        <CardContent style={{ padding: 0 }}>
          {data.rates.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Währung / Zentralbank</th>
                    <th>Aktuell</th>
                    <th>Erwartet</th>
                    <th>Erwartete Änderung</th>
                    <th>Stance</th>
                    <th>Actual</th>
                    <th>Decision Surprise</th>
                    <th>Nächster Termin</th>
                    <th>Quelle</th>
                    <th>Qualität</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rates.map((rate) => (
                    <tr key={rate.currency}>
                      <td>
                        <div className="asset-cell">
                          <span className="asset-icon">{rate.currency}</span>
                          <div>
                            <strong>{rate.currency}</strong>
                            <div className="muted" style={{ fontSize: 9 }}>
                              {rate.centralBank}
                              {rate.rateDefinition
                                ? ` · ${rate.rateDefinition}`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {rate.currentRateLow != null &&
                        rate.currentRateHigh != null
                          ? `${number.format(Number(rate.currentRateLow))}–${number.format(Number(rate.currentRateHigh))} %`
                          : rate.currentRate == null
                            ? "—"
                            : `${number.format(Number(rate.currentRate))} %`}
                      </td>
                      <td>
                        {rate.expectedRate == null
                          ? "—"
                          : `${number.format(Number(rate.expectedRate))} %`}
                      </td>
                      <td className={signalClass(rate.expectedStance)}>
                        {bps(rate.expectedDeltaBps)}
                      </td>
                      <td>
                        <Signal signal={rate.expectedStance} />
                      </td>
                      <td>
                        {rate.actualRate == null
                          ? "—"
                          : `${number.format(Number(rate.actualRate))} %`}
                      </td>
                      <td className={signalClass(rate.decisionSurprise)}>
                        {bps(rate.decisionSurpriseBps)}
                      </td>
                      <td>{dateTime(rate.nextDecisionAt)}</td>
                      <td>
                        {rate.officialSourceUrl ? (
                          <a
                            href={rate.officialSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="muted"
                          >
                            Quelle{" "}
                            <ExternalLink
                              size={10}
                              style={{ verticalAlign: -1 }}
                            />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Badge
                          className={
                            rate.qualityStatus === "provider_confirmed"
                              ? "positive"
                              : "warning"
                          }
                        >
                          {rate.qualityStatus === "provider_confirmed"
                            ? "EODHD bestätigt"
                            : rate.qualityStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={CirclePercent}
              title="Noch kein Leitzins-Snapshot"
              description="Synchronisiere EODHD. Fehlende kommende Konsenswerte bleiben bewusst unavailable."
              action={
                <div className="page-actions">
                  <Button onClick={() => syncMutation.mutate()}>
                    <RefreshCw size={14} /> EODHD synchronisieren
                  </Button>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function Signal({ signal }: { signal?: number | null }) {
  return (
    <Badge
      className={
        signal == null
          ? "warning"
          : signal > 0
            ? "positive"
            : signal < 0
              ? "negative"
              : "neutral"
      }
    >
      {signal == null
        ? "Unavailable"
        : signal > 0
          ? "Hawkish"
          : signal < 0
            ? "Dovish"
            : "Hold"}
    </Badge>
  );
}
function signalClass(signal?: number | null) {
  return signal == null || signal === 0
    ? ""
    : signal > 0
      ? "positive-text"
      : "negative-text";
}
function bps(value?: string | null) {
  if (value == null) return "—";
  const parsed = Number(value);
  return `${parsed > 0 ? "+" : ""}${number.format(parsed)} bp`;
}
function RateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{label}</strong>
      </div>
      <strong className="tabular">{value}</strong>
    </div>
  );
}
function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="card" style={{ padding: 12, textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 9 }}>
        {label}
      </div>
      <div
        className={tone ? `${tone}-text` : ""}
        style={{ fontSize: 18, fontWeight: 750, marginTop: 6 }}
      >
        {value}
      </div>
    </div>
  );
}
