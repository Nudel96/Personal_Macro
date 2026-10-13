import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { supportsPrivateWebCommand } from "../../services/private-web-client";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/loading";
import type {
  AssetScore,
  CotDashboard,
  ScoreContribution,
} from "../../types/domain";
import { buildInstitutionalAssetActivity } from "./institutional-activity";
import { biasLabels, scoreBias } from "./score-history-model";
import { dateTime } from "../../lib/utils";
import "./score-history.css";

function channel(asset: AssetScore, name: string) {
  const rows = asset.contributions.filter(
    (c) => c.channel === name && c.score != null,
  );
  return rows.length ? rows.reduce((sum, c) => sum + (c.score ?? 0), 0) : null;
}

export function signedScore(value: number | null) {
  return value == null ? "—" : `${value > 0 ? "+" : ""}${value}`;
}

export function ContributionTable({
  contributions,
}: {
  contributions: ScoreContribution[];
}) {
  return (
    <div className="score-table-scroll">
      <table className="score-evidence-table">
        <thead>
          <tr>
            <th>Beitrag</th>
            <th>Kanal</th>
            <th>Actual</th>
            <th>Forecast</th>
            <th>Previous</th>
            <th>Score</th>
            <th>Quelle / Verfügbarkeit</th>
          </tr>
        </thead>
        <tbody>
          {contributions.map((c) => (
            <tr key={c.key}>
              <th scope="row">{c.label}</th>
              <td>
                {(
                  {
                    usd: "USD-Einfluss",
                    demand: "Nachfrage",
                    inventory: "Lager",
                    asset: "Asset",
                    fundamentals: "Fundamentals",
                    growth: "Wachstum",
                    labor: "Arbeit",
                    rates: "Zinsen",
                    inflation: "Inflation",
                  } as Record<string, string>
                )[c.channel] ?? c.channel}
              </td>
              <td>{c.actual ?? "—"}</td>
              <td>{c.forecast ?? "—"}</td>
              <td>{c.previous ?? "—"}</td>
              <td data-bias={scoreBias(c.score, 1)}>{signedScore(c.score)}</td>
              <td>
                {c.releasedAt ? dateTime(c.releasedAt) : ""}
                {c.sourceUrl?.startsWith("https://") ? (
                  <>
                    {" "}
                    ·{" "}
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                      Quelle
                    </a>
                  </>
                ) : null}
                {c.reason ? <small>{c.reason}</small> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CommodityScoreHeatmap({ cot }: { cot?: CotDashboard }) {
  const [selectedId, setSelectedId] = useState("commodity:XAU/USD");
  const available =
    isTauri() ||
    (isPrivateWeb() &&
      supportsPrivateWebCommand("get_macro_commodity_dashboard"));
  const dashboard = useQuery({
    queryKey: ["macro", "commodity-scores"],
    queryFn: api.macroCommodityDashboard,
    enabled: available,
    retry: false,
  });
  const selected = dashboard.data?.assets.find(
    (a) => a.instrument.id === selectedId,
  );
  return (
    <Card className="commodity-score-card">
      <CardHeader
        title="Metalle, Öl & weitere Rohstoffe"
        subtitle="Eigenständige USD-notierte Assets · transparente Fundamentals-Beiträge"
        action={
          available ? (
            <Button
              size="sm"
              onClick={() => void dashboard.refetch()}
              disabled={dashboard.isFetching}
            >
              Aktualisieren
            </Button>
          ) : undefined
        }
      />
      <CardContent>
        {!available ? (
          <p className="score-explanation">
            Für diesen Datenstand ist noch kein Rohstoff-Modell verfügbar.
          </p>
        ) : dashboard.isLoading ? (
          <p role="status">Rohstoff-Fundamentals werden geladen …</p>
        ) : dashboard.isError ? (
          <ErrorState message="Die Rohstoff-Fundamentals konnten nicht gelesen werden." />
        ) : (
          <>
            <p className="score-explanation">
              Positive Beiträge sprechen im Modell für einen steigenden
              USD-Preis, negative für einen fallenden. USD-Einfluss und
              industrielle Nachfrage werden getrennt bewertet. Fehlende
              physische Treiber bleiben offen. COT steht separat und verändert
              die Fundamentals-Summe nicht.
            </p>
            <div className="score-table-scroll">
              <table className="commodity-score-table">
                <thead>
                  <tr>
                    <th>Markt</th>
                    <th>USD-Kanal</th>
                    <th>Nachfrage</th>
                    <th>Lager</th>
                    <th>Eigene Treiber</th>
                    <th>Score / Bias ±5</th>
                    <th>Abdeckung</th>
                    <th>COT separat</th>
                    <th>Historie</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data?.assets.map((asset) => (
                    <tr
                      key={asset.instrument.id}
                      data-selected={asset.instrument.id === selectedId}
                    >
                      <th scope="row">
                        <button
                          className="score-market-button"
                          onClick={() => setSelectedId(asset.instrument.id)}
                        >
                          {asset.instrument.label}
                        </button>
                      </th>
                      {["usd", "demand", "inventory", "asset"].map((name) => (
                        <td
                          key={name}
                          data-bias={scoreBias(channel(asset, name), 1)}
                          title={asset.contributions
                            .filter((c) => c.channel === name)
                            .map(
                              (c) =>
                                `${c.label}: ${signedScore(c.score)}${c.reason ? ` · ${c.reason}` : ""}`,
                            )
                            .join("\n")}
                        >
                          {signedScore(channel(asset, name))}
                        </td>
                      ))}
                      <td
                        data-bias={scoreBias(
                          asset.score,
                          asset.instrument.defaultThreshold,
                        )}
                      >
                        <strong>{signedScore(asset.score)}</strong>
                        <small>
                          {
                            biasLabels[
                              scoreBias(
                                asset.score,
                                asset.instrument.defaultThreshold,
                              )
                            ]
                          }
                        </small>
                      </td>
                      <td>
                        {asset.availableComponents}/{asset.totalComponents}
                      </td>
                      <td>
                        {asset.instrument.cotSymbol && cot
                          ? signedScore(
                              buildInstitutionalAssetActivity(
                                asset.instrument.cotSymbol,
                                cot,
                              ).score,
                            )
                          : "—"}
                      </td>
                      <td>
                        <a
                          href={`/score-history?instrument=${encodeURIComponent(asset.instrument.id)}`}
                        >
                          Daily vergleichen
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected && (
              <details
                className="score-methodology"
                key={selected.instrument.id}
              >
                <summary>
                  {selected.instrument.label}: Beiträge & Datenlücken
                </summary>
                <p>{selected.scope}</p>
                <ContributionTable contributions={selected.contributions} />
              </details>
            )}
            <small className="score-model-version">
              Modell {dashboard.data?.modelVersion} · Stand{" "}
              {dashboard.data ? dateTime(dashboard.data.asOf) : "—"}
            </small>
          </>
        )}
      </CardContent>
    </Card>
  );
}
