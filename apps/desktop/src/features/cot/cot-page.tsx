import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesCombined, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { api } from "../../services/commands";
import { CotOverview, CotPairDetail, CotPairHeatmap } from "./cot-components";
import { PageHeader } from "../../components/ui/page-header";
import { isPrivateWeb } from "../../services/runtime-mode";
import { CloudMarketNotice } from "../macro/cloud-market-notice";
import { dateTime } from "../../lib/utils";
import { useCloudCotRefresh } from "./use-cloud-cot-refresh";
import { CotComparison } from "./cot-comparison";

export function CotPage() {
  useCloudCotRefresh();
  const [pair, setPair] = useState<[string, string]>(["EUR", "USD"]);
  const dashboard = useQuery({
    queryKey: ["cot"],
    queryFn: api.cotDashboard,
    refetchInterval: isPrivateWeb() ? false : 60_000,
  });
  const header = (
    <PageHeader
      icon={ChartNoAxesCombined}
      eyebrow="Marktkontext"
      title="COT Analyse"
      description="Institutionelle Positionierung, Kapitalfluss und Trend im Vergleich der Währungen."
    />
  );

  if (dashboard.isLoading)
    return (
      <div className="page">
        {header}
        <PageLoading />
      </div>
    );
  if (dashboard.isError || !dashboard.data)
    return (
      <div className="page">
        {header}
        <ErrorState message="COT-Daten konnten nicht geladen werden." />
      </div>
    );

  const selectedPair = dashboard.data.pairs.find(
    (item) => item.base === pair[0] && item.quote === pair[1],
  );

  return (
    <div className="page cot-page">
      {header}
      {isPrivateWeb() && dashboard.data.automaticRefresh?.enabled ? (
        <p className="notice" role="note">
          COT wird automatisch eine Stunde nach dem offiziellen CFTC-Termin
          abgerufen, auch bei ausgeschaltetem PC. Feiertage und die New Yorker
          Zeitzone werden berücksichtigt.
          {dashboard.data.automaticRefresh.nextRefreshAt &&
            ` Nächster geplanter Abruf: ${dateTime(dashboard.data.automaticRefresh.nextRefreshAt)}.`}
          {!dashboard.data.automaticRefresh.calendarAvailable &&
            " Der nächste Veröffentlichungstermin ist noch nicht bestätigt."}
          {dashboard.data.automaticRefresh.lastOutcome === "expired" &&
            " Der letzte Abruf konnte nicht abgeschlossen werden; der bisherige geprüfte Stand bleibt sichtbar."}
          {dashboard.data.lastSyncedAt &&
            ` Zuletzt geladen: ${dateTime(dashboard.data.lastSyncedAt)}.`}
        </p>
      ) : (
        <CloudMarketNotice importedAt={dashboard.data.cloudImportedAt} />
      )}
      <CotComparison
        dashboard={dashboard.data}
        selected={pair}
        onSelect={setPair}
      />
      <div className="grid macro-layout">
        <Card>
          <CardHeader
            title="COT-Währungsmatrix"
            subtitle="Der Macro-Faktor nutzt für alle Märkte Legacy Futures Only · Non-Commercial."
          />
          <CardContent>
            <div className="macro-heatmap-wrap">
              <CotPairHeatmap
                pairs={dashboard.data.pairs}
                selected={pair}
                onSelect={setPair}
              />
            </div>
          </CardContent>
        </Card>
        <CotPairDetail pair={selectedPair} selected={pair} />
      </div>
      <CotOverview dashboard={dashboard.data} />
      <Card>
        <CardHeader
          title="Datenherkunft"
          subtitle="CFTC Commitments of Traders: offizielle Futures-Positionierung, kein CFD-Orderflow."
        />
        <CardContent>
          <a
            className="button button-ghost"
            href={dashboard.data.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} /> Offizielle CFTC-Quelle öffnen
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
