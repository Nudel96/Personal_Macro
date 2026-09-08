import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesCombined, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { api } from "../../services/commands";
import { CotOverview, CotPairDetail, CotPairHeatmap } from "./cot-components";
import { PageHeader } from "../../components/ui/page-header";

export function CotPage() {
  const [pair, setPair] = useState<[string, string]>(["EUR", "USD"]);
  const dashboard = useQuery({
    queryKey: ["cot"],
    queryFn: api.cotDashboard,
    refetchInterval: 60_000,
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
