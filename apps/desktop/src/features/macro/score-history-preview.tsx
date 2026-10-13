import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { api, isTauri } from "../../services/commands";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { canUseWorkspaceRoute } from "../../app/workspace-capabilities";

const ScoreHistoryChart = lazy(() =>
  import("./score-history-charts").then((m) => ({
    default: m.ScoreHistoryChart,
  })),
);

export function utcDate(daysAgo = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function ScoreHistoryPreview({
  instrumentId,
}: {
  instrumentId: string;
}) {
  const input = { instrumentId, from: utcDate(90), to: utcDate() };
  const history = useQuery({
    queryKey: ["macro", "score-history", input],
    queryFn: () => api.macroScoreHistory(input),
    enabled: isTauri(),
    retry: false,
    refetchInterval: isTauri() ? 60_000 : false,
  });
  return (
    <Card className="score-history-preview">
      <CardHeader
        title={
          <>
            <History size={16} /> Score-Historie
          </>
        }
        subtitle="Grün: positiver Rohscore · Rot: negativer Rohscore · letzte 90 Tage"
        action={
          canUseWorkspaceRoute("/score-history") ? (
            <a
              className="button"
              href={`/score-history?instrument=${encodeURIComponent(instrumentId)}`}
            >
              Historie & Daily-Vergleich
            </a>
          ) : undefined
        }
      />
      <CardContent>
        {!isTauri() ? (
          <p className="score-explanation">
            Die dauerhafte Aufzeichnung liegt in der Desktop-Datenbank. Dieser
            Cloud-Datenstand enthält noch keine Score-Historie.
          </p>
        ) : history.isLoading ? (
          <p role="status">Score-Historie wird geladen …</p>
        ) : history.isError ? (
          <p role="alert">
            Die Score-Historie konnte nicht geladen werden. Im Bereich Historie
            kann der Abruf erneut gestartet werden.
          </p>
        ) : history.data?.points.length ? (
          <Suspense fallback={<p role="status">Diagramm wird geladen …</p>}>
            <ScoreHistoryChart
              points={history.data.points}
              threshold={history.data.instrument.defaultThreshold}
              compact
            />
          </Suspense>
        ) : (
          <p className="score-explanation">
            Noch keine aufgezeichneten Scores für diesen Zeitraum. Bei laufender
            App werden tägliche Beobachtungen und neue Datenstände gespeichert.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
