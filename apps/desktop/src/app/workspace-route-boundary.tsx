import { Link, Outlet, useLocation } from "react-router-dom";
import { canUseWorkspaceRoute } from "./workspace-capabilities";

export function WorkspaceRouteBoundary() {
  const { pathname } = useLocation();
  if (canUseWorkspaceRoute(pathname)) return <Outlet />;

  return (
    <section className="page" aria-labelledby="workspace-unavailable-title">
      <h1 id="workspace-unavailable-title">
        Dieser Bereich ist hier noch nicht verfügbar
      </h1>
      <p className="muted">
        Die private Browser-Version verbindet dein Journal mit dem
        Cloudspeicher. Marktdaten, Broker-Verbindungen und lokale Importe oder
        Backups sind in dieser Version noch nicht angebunden. Dafür kannst du
        die Desktop-App verwenden.
      </p>
      <div className="page-actions">
        <Link className="button" to="/">
          Zur Übersicht
        </Link>
        <Link className="button" to="/settings">
          Zu den Einstellungen
        </Link>
      </div>
    </section>
  );
}
