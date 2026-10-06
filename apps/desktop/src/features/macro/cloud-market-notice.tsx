import { dateTime } from "../../lib/utils";
import { isPrivateWeb } from "../../services/runtime-mode";
import type { CotDashboard } from "../../types/domain";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/commands";
import { supportsPrivateWebCommand } from "../../services/private-web-client";

export function CloudMarketNotice({
  importedAt,
  cotAutomaticRefresh,
}: {
  importedAt?: string | null;
  cotAutomaticRefresh?: CotDashboard["automaticRefresh"];
}) {
  const status = useQuery({
    queryKey: ["provider-automation-status"],
    queryFn: () => api.providerAutomationStatus(),
    enabled:
      isPrivateWeb() &&
      supportsPrivateWebCommand("get_provider_automation_status"),
    refetchInterval: 60_000,
  });
  if (!isPrivateWeb()) return null;
  return (
    <p className="notice" role="note">
      Privater Cloud-Datenstand ·{" "}
      {importedAt
        ? `Übernommen am ${dateTime(importedAt)}`
        : "Übernahmezeit nicht verfügbar"}
      . Auswahl, Vergleiche und Analysen verwenden die gespeicherten Quellen.
      {status.data?.economicEnabled && (
        <>
          {" "}
          Wirtschaftsreleases werden wöchentlich vorausgeplant und eine Stunde
          nach der Veröffentlichung automatisch geprüft.
          {status.data.nextRunAt &&
            ` Nächster automatischer Abruf: ${dateTime(status.data.nextRunAt)}.`}
          {status.data.failedJobs > 0 &&
            " Einzelne Abrufe konnten nicht abgeschlossen werden; fehlende Daten werden nicht ersetzt."}
        </>
      )}
      {cotAutomaticRefresh?.enabled ? (
        <>
          {" "}
          COT wird automatisch eine Stunde nach dem offiziellen CFTC-Termin
          aktualisiert, auch bei ausgeschaltetem PC.
          {cotAutomaticRefresh.nextRefreshAt &&
            ` Nächster geplanter COT-Abruf: ${dateTime(cotAutomaticRefresh.nextRefreshAt)}.`}
          {!cotAutomaticRefresh.calendarAvailable &&
            " Der nächste COT-Veröffentlichungstermin ist noch nicht bestätigt."}
          {cotAutomaticRefresh.lastOutcome === "expired" &&
            " Der letzte COT-Abruf konnte nicht abgeschlossen werden; der bisherige geprüfte Stand bleibt sichtbar."}{" "}
          Weitere Quellen verwenden ihren jeweils übernommenen Cloud-Datenstand.
          Eine automatische Desktop-Synchronisierung ist nicht eingerichtet.
        </>
      ) : (
        <>
          {" "}
          {status.data?.economicEnabled
            ? "Eine automatische Desktop-Synchronisierung ist nicht eingerichtet."
            : "Für diese Ansicht ist keine automatische Quellenaktualisierung bestätigt."}
        </>
      )}
    </p>
  );
}
