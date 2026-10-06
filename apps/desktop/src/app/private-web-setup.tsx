import "./private-web-setup.css";

export function PrivateWebSetup() {
  return (
    <main className="private-web-setup" aria-labelledby="private-web-title">
      <section className="private-web-setup-card">
        <p className="private-web-brand">Personal Macro</p>
        <h1 id="private-web-title">
          Private Browser-Version wird eingerichtet
        </h1>
        <p className="private-web-status">
          Datenanbindung noch nicht verbunden
        </p>
        <p>
          Deine Desktop-Daten sind hier noch nicht verfügbar. Der Workspace wird
          erst geöffnet, wenn die Browser-Version mit deinem persönlichen
          Datenbestand verbunden ist.
        </p>
        <p>Bis dahin kannst du Personal Macro auf deinem Computer nutzen.</p>
        <p className="private-web-access-note">
          Es wurden noch keine persönlichen Journal-Daten in die Browser-Version
          übertragen.
        </p>
      </section>
    </main>
  );
}
