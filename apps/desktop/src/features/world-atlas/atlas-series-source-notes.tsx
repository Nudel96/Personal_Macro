import { atlasSdgNature, atlasSdgPointSource } from "./atlas-source-series";
import type { AtlasSeriesResponse } from "./atlas-types";

export function AtlasSeriesSourceNotes({
  rows,
  showNumbers,
}: {
  rows: AtlasSeriesResponse[];
  showNumbers: boolean;
}) {
  if (!rows.some((row) => row.series.sourceId === "unsdg")) return null;
  return (
    <details className="atlas-details">
      <summary>Erhebungen, Schätzungen und Hinweise je Jahr</summary>
      <p>
        Die Datenart stammt aus der Quelle. Jahresangaben können sich auf eine
        einzelne Erhebung innerhalb des Jahres beziehen. Unsicherheitsgrenzen
        sind mit „Zahlen anzeigen“ verfügbar.
      </p>
      {rows.map((row) => (
        <div key={row.geography.id}>
          <h4>{row.geography.label}</h4>
          {row.points.map((point) => {
            const source = atlasSdgPointSource(point.sourceFlag);
            if (!source) return null;
            return (
              <details key={point.year}>
                <summary>
                  {point.year} · {atlasSdgNature(source.attributes.Nature)}
                  {point.value === null ? " · kein numerischer Wert" : ""}
                </summary>
                {showNumbers && (
                  <p>
                    Originalwert: {source.value ?? "nicht verfügbar"}
                    {source.lowerBound !== null || source.upperBound !== null
                      ? ` · Quellintervall: ${source.lowerBound ?? "offen"} bis ${source.upperBound ?? "offen"}`
                      : ""}
                  </p>
                )}
                <p>{source.source}</p>
                {[
                  source.timeDetail,
                  source.timeCoverage,
                  source.basePeriod,
                  ...(source.footnotes ?? []),
                ]
                  .filter(Boolean)
                  .map((note, index) => (
                    <p key={index}>{note}</p>
                  ))}
                {source.attributes["Observation Status"] && (
                  <p>
                    Originalstatus: {source.attributes["Observation Status"]}
                  </p>
                )}
              </details>
            );
          })}
        </div>
      ))}
    </details>
  );
}
